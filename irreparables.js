/*
 * irreparables.js — Módulo IRREPARABLES (alta 22/10/2026)
 *
 * Trazabilidad de terminales irreparables:  terminal → caja (30) → pallet → SPP
 *  - Alta por escaneo con lector de barras (la falla sale de lo que Logicalis informó:
 *    reporte RTO de Presupuesto, o Product2.Lote__c en SF, que ya trae "fecha - solución").
 *  - El operador puede sumar info propia (ej. "pantalla rayada") y marcar la terminal como
 *    "operativa" (funciona, pero se descarta).
 *  - Rótulos 100x150 para la SATO (caja y pallet) y packing list en Excel.
 *  - "Asentar en SF": agrega caja/pallet al final de Product2.Lote__c. NO toca otros campos.
 *
 * Datos: Supabase (irreparables_items / _cajas / _pallets, ver doc/setup_irreparables.sql).
 * Salesforce: usa los endpoints que YA existen en alleata-agent (/terminales/preview-sf y
 * /terminales/update-sf). No requiere cambios en el backend.
 *
 * Globales del portal que usa: sb (supabase), SF_AGENT_URL, currentProfile, XLSX.
 */
(function () {
  'use strict';

  /* ═════════════════ Lógica pura (testeable en node) ═════════════════ */
  const L = {};
  L.CAP_CAJA = 30;
  L.CAP_PALLET_CAJAS = 17;       // ~500 terminales por pallet (17 × 30 = 510) — aviso, no bloqueo
  L.LOTE_MAX = 255;              // largo estándar de un campo de texto de SF
  L.CAMPOS_PROTEGIDOS = ['Ubicacion__c', 'Estado__c', 'CAMBIO_DE_BATERIA__c', 'Perfil__c'];
  L.COMPLETABLES = ['Perfil__c', 'CAMBIO_DE_BATERIA__c'];      // si vienen vacíos de SF, los elige el operador
  L.OPC_PERFIL = ['NAPSE', 'PRISMA'];
  L.OPC_BATERIA = ['SÍ', 'NO'];

  L.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  L.pad4 = function (n) { return String(n).padStart(4, '0'); };

  // Clasifica lo que entró por el lector. Tolera que el lector cambie el guion por otro
  // símbolo ("CJ_0001", "CJ'0001") o lo omita ("CJ0001").
  L.tipoEscaneo = function (raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    const m = s.match(/^(CJ|PL)\D{0,3}(\d{1,6})$/i);
    if (m) {
      const pre = m[1].toUpperCase();
      return { tipo: pre === 'CJ' ? 'caja' : 'pallet', codigo: pre + '-' + L.pad4(parseInt(m[2], 10)) };
    }
    const d = s.replace(/[\s\-]/g, '');
    if (/^\d{9,30}$/.test(d)) return { tipo: 'serie', serie: d };
    return null;
  };

  // Sufijo que agrega este módulo a Lote__c: " | CJ-0001" o " | CJ-0001 | PL-0001"
  L.SUFIJO_RE = /\s*\|\s*CJ-\d+(?:\s*\|\s*PL-\d+)?\s*$/i;
  L.quitarSufijo = function (lote) {
    const s = String(lote == null ? '' : lote).trim();
    if (!s || s === '—') return '';
    return s.replace(L.SUFIJO_RE, '').trim();
  };

  // Lote__c lo arma el módulo Terminales como "d/m/aaaa - <Solución de Logicalis>".
  L.parseLote = function (lote) {
    const base = L.quitarSufijo(lote);
    const m = base.match(/^(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(.+)$/);
    // Sin "fecha - ": si la terminal esta ROTA, el texto completo del Lote es la descripcion de la falla
    return { base: base, fecha: m ? m[1] : '', falla: m ? m[2].trim() : base };
  };

  // Valor final de Lote__c. Conserva lo que ya había (la falla de Logicalis) y reemplaza
  // el sufijo de caja/pallet, así que se puede repetir sin duplicar.
  L.armarLote = function (o) {
    let base = L.quitarSufijo(o.loteActual);
    if (!base) base = String(o.falla || '').trim() || 'Irreparable';   // Lote vacio en SF: lo cargado en Falla / motivo
    const info = String(o.info || '').trim();
    if (info && base.toLowerCase().indexOf(info.toLowerCase()) === -1) base += ' - ' + info;
    const suf = ' | ' + o.caja + (o.pallet ? ' | ' + o.pallet : '');
    if (base.length + suf.length > L.LOTE_MAX) base = base.slice(0, L.LOTE_MAX - suf.length - 1).trimEnd() + '…';
    return base + suf;
  };

  // El endpoint /terminales/update-sf SIEMPRE pisa estos 4 campos (con defaults si vienen
  // vacíos). Por eso se reenvían idénticos, y si alguno está vacío en SF NO se graba.
  L.camposVacios = function (cur) {
    return L.CAMPOS_PROTEGIDOS.filter(function (k) {
      const v = cur && cur[k];
      return !v || v === '—';
    });
  };

  // Fechas: devuelve 'YYYY-MM-DD' o null. Acepta Date, serial de Excel, 'd/m/aaaa', 'd-m-aa' y 'aaaa-mm-dd'.
  L.parseFecha = function (v) {
    if (v == null || v === '' || v === '—') return null;
    const pad = function (n) { return String(n).padStart(2, '0'); };
    const ok = function (y, m, d) {
      if (y < 100) y += 2000;
      if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.getUTCMonth() === m - 1 ? y + '-' + pad(m) + '-' + pad(d) : null;
    };
    if (v instanceof Date) return isNaN(v) ? null : ok(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number') {
      if (v < 30000 || v > 80000) return null;
      const dt = new Date(Math.round((v - 25569) * 86400000));        // serial de Excel → UTC
      return ok(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
    const t = String(v).trim();
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return ok(+m[1], +m[2], +m[3]);
    m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (m) return ok(+m[3], +m[2], +m[1]);
    if (/^\d{5}(\.\d+)?$/.test(t)) return L.parseFecha(parseFloat(t));
    return null;
  };
  L.fmtDia = function (iso) {                                          // 'YYYY-MM-DD' → 'd/m/aaaa'
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (+m[3]) + '/' + (+m[2]) + '/' + m[1] : '—';
  };
  // Fecha del reporte de Logicalis dentro de una fila del detalle del RTO: columnas con "fecha"
  // en el encabezado; se prefieren las que hablan del informe/entrega/reparación.
  L.fechaDeFila = function (fila) {
    if (!fila) return null;
    const keys = Object.keys(fila).filter(function (k) { return /fecha/i.test(k); });
    keys.sort(function (a, b) {
      const pr = function (k) { return /report|inform|entrega|egreso|devol|repar|env[ií]|despach|recib/i.test(k) ? 0 : 1; };
      return pr(a) - pr(b);
    });
    for (const k of keys) { const f = L.parseFecha(fila[k]); if (f) return f; }
    return null;
  };

  L.esRota = function (estado) { return /rota/i.test(String(estado || '')); };

  // Detección de una terminal irreparable en una fila del detalle del RTO de Logicalis
  // (misma regla que el módulo Terminales: Solución que NO empieza con "Personalización").
  L.normTxt = function (s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  };
  L.esIrreparableSolucion = function (sol) {
    const n = L.normTxt(sol);
    return n !== '' && n.indexOf('personalizacion') !== 0;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  if (typeof window === 'undefined') return;   // en node solo se exporta la lógica

  /* ═════════════════ Módulo (browser) ═════════════════ */
  const AGENT = (typeof SF_AGENT_URL !== 'undefined' && SF_AGENT_URL) || 'https://alleata-agent-production.up.railway.app';
  const T_ITEMS = 'irreparables_items', T_CAJAS = 'irreparables_cajas', T_PALLETS = 'irreparables_pallets';
  const V_TRAZ = 'v_irreparables_trazabilidad', V_CAJAS = 'v_irreparables_cajas', V_PALLETS = 'v_irreparables_pallets';
  const esc = L.esc;

  const S = {
    ready: false, tab: 'escaneo',
    caja: null, items: [],            // caja activa + sus terminales
    pallet: null, cajasPallet: [],    // pallet activo + sus cajas
    alta: null,                       // terminal nueva esperando datos del operador
    log: [], cola: [], drenando: false,
    sel: {},                          // serie → true (selección para SF)
    abiertas: [],                     // otras cajas abiertas (destino de "Mover a…")
    comp: {}, faltan: [], pendSF: null, // Perfil / Batería elegidos por el operador (serie → {campo: valor})
  };
  function esAdmin() { try { return typeof currentProfile !== 'undefined' && !!currentProfile && currentProfile.rol === 'admin'; } catch (e) { return false; } }

  /* ── helpers ── */
  function $(id) { return document.getElementById(id); }
  function quien() {
    try { if (typeof currentProfile !== 'undefined' && currentProfile) return currentProfile.nombre || currentProfile.email || 'portal'; } catch (e) { /* noop */ }
    return 'portal';
  }
  async function dbq(p) {
    const r = await p;
    if (r.error) { const e = new Error(r.error.message || String(r.error)); e.code = r.error.code; throw e; }
    return r.data;
  }
  async function fetchAll(mk) {
    let out = [], from = 0; const step = 1000;
    for (;;) {
      const d = await dbq(mk(from, from + step - 1));
      out = out.concat(d || []);
      if (!d || d.length < step) break;
      from += step;
    }
    return out;
  }
  function falloTabla(e) { return /does not exist|schema cache|Could not find|relation .* does not exist/i.test((e && e.message) || ''); }
  function toast(msg) {
    if (typeof showToastPortal === 'function') return showToastPortal(msg);
    alert(msg);
  }
  function fmtFecha(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso; }
  }
  function guardarActiva() { try { localStorage.setItem('irr_caja_activa', S.caja ? S.caja.id : ''); } catch (e) { /* noop */ } }
  function leerActiva() { try { return localStorage.getItem('irr_caja_activa') || ''; } catch (e) { return ''; } }

  /* ── log de escaneos (más reciente arriba) ── */
  function log(tipo, msg) {
    S.log.unshift({ t: tipo, m: msg, h: new Date().toLocaleTimeString('es-AR') });
    S.log = S.log.slice(0, 12);
    renderLog();
    if (tipo === 'err') { try { beep(); } catch (e) { /* noop */ } }
  }
  function beep() {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const c = new C(), o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 220; g.gain.value = 0.08; o.connect(g); g.connect(c.destination);
    o.start(); setTimeout(function () { o.stop(); c.close(); }, 180);
  }

  /* ═════════ Carga de datos ═════════ */
  async function cargarCaja(id) {
    if (!id) { S.caja = null; S.items = []; S.abiertas = []; return; }
    const c = await dbq(sb.from(V_CAJAS).select('*').eq('id', id).maybeSingle());
    S.caja = c || null;
    S.items = c ? await fetchAll(function (a, b) {
      return sb.from(V_TRAZ).select('*').eq('caja_id', id).order('serie').range(a, b);
    }) : [];
    S.abiertas = c ? await dbq(sb.from(V_CAJAS).select('id,codigo,cant,capacidad').eq('estado', 'abierta').neq('id', id).order('codigo').limit(50)) : [];
    guardarActiva();
  }
  async function refreshCaja() { await cargarCaja(S.caja && S.caja.id); renderCajaBar(); renderCajaItems(); }

  async function cargarPallet(id) {
    if (!id) { S.pallet = null; S.cajasPallet = []; return; }
    const p = await dbq(sb.from(V_PALLETS).select('*').eq('id', id).maybeSingle());
    S.pallet = p || null;
    S.cajasPallet = p ? await dbq(sb.from(V_CAJAS).select('*').eq('pallet_id', id).order('codigo')) : [];
  }

  /* ═════════ Cajas ═════════ */
  async function nuevaCaja() {
    try {
      const c = await dbq(sb.from(T_CAJAS).insert({ created_by: quien() }).select('id').single());
      await cargarCaja(c.id);
      log('ok', 'Caja ' + S.caja.codigo + ' abierta. Escaneá las terminales.');
      renderCajaBar(); renderCajaItems(); focoScan();
    } catch (e) { errorGeneral(e); }
  }
  async function activarCaja(codigo) {
    const c = await dbq(sb.from(V_CAJAS).select('*').eq('codigo', codigo).maybeSingle());
    if (!c) return log('err', 'No existe la caja ' + codigo + '.');
    await cargarCaja(c.id);
    log('ok', 'Caja activa: ' + c.codigo + ' (' + c.cant + '/' + c.capacidad + ', ' + c.estado + ')');
    renderCajaBar(); renderCajaItems();
  }
  async function elegirCaja(id) { if (!id) return; try { await cargarCaja(id); renderCajaBar(); renderCajaItems(); focoScan(); } catch (e) { errorGeneral(e); } }

  async function cerrarCaja() {
    const c = S.caja;
    if (!c || c.estado !== 'abierta') return;
    if (c.cant === 0) return toast('La caja está vacía.');
    if (c.cant < c.capacidad && !confirm('La caja tiene ' + c.cant + ' de ' + c.capacidad + ' terminales. ¿Cerrarla igual?')) return;
    const w = abrirVentana();
    try {
      await dbq(sb.from(T_CAJAS).update({ estado: 'cerrada', closed_at: new Date().toISOString() }).eq('id', c.id));
      await refreshCaja();
      log('ok', 'Caja ' + c.codigo + ' cerrada con ' + c.cant + ' terminales.');
      await imprimirCaja(c.id, w);
    } catch (e) { if (w) w.close(); errorGeneral(e); }
  }
  async function reabrirCaja() {
    const c = S.caja;
    if (!c || c.estado !== 'cerrada') return;
    if (c.pallet_estado === 'enviado') return toast('La caja está en el pallet ' + c.pallet_codigo + ', que ya fue enviado: no se puede modificar.');
    if (c.pallet_id && !confirm('La caja está en el pallet ' + c.pallet_codigo + '. Si la modificás, tenés que volver a cerrarla y reimprimir su rótulo y el del pallet. ¿Reabrirla?')) return;
    try {
      await dbq(sb.from(T_CAJAS).update({ estado: 'abierta', closed_at: null }).eq('id', c.id));
      await refreshCaja();
    } catch (e) { errorGeneral(e); }
  }
  // Las terminales ya asentadas en SF con su caja anterior quedan marcadas para re-asentar
  async function marcarReasentar(ids) {
    if (!ids || !ids.length) return;
    await dbq(sb.from(T_ITEMS).update({ sf_sync_ok: false, sf_sync_msg: 'Re-asentar: cambió la caja' }).in('id', ids).eq('sf_sync_ok', true));
  }
  async function quitarItem(itemId) {
    if (!S.caja || S.caja.estado !== 'abierta') return;
    try {
      await dbq(sb.from(T_ITEMS).update({ caja_id: null, caja_at: null, caja_by: null }).eq('id', itemId));
      await marcarReasentar([itemId]);
      await refreshCaja();
    } catch (e) { errorGeneral(e); }
  }
  // Mueve una terminal a otra caja abierta con lugar
  async function moverItem(itemId, destinoId) {
    if (!destinoId) return;
    const c = S.caja; if (!c || c.estado !== 'abierta') return;
    const dest = S.abiertas.find(function (x) { return x.id === destinoId; });
    if (!dest) return toast('La caja de destino ya no está abierta.');
    if (dest.cant >= dest.capacidad) { await refreshCaja(); return toast(dest.codigo + ' está llena.'); }
    try {
      const upd = await dbq(sb.from(T_ITEMS).update({ caja_id: dest.id, caja_at: new Date().toISOString(), caja_by: quien() })
        .eq('id', itemId).eq('caja_id', c.id).select('id'));
      if (!upd || !upd.length) { await refreshCaja(); return toast('La terminal ya no está en esta caja.'); }
      await marcarReasentar([itemId]);
      log('ok', 'Terminal movida a ' + dest.codigo);
      await refreshCaja();
    } catch (e) { errorGeneral(e); }
  }
  // Modifica notas y capacidad de la caja activa
  async function editarCaja() {
    const c = S.caja; if (!c) return;
    if (c.pallet_estado === 'enviado') return toast('La caja está en un pallet enviado: no se puede modificar.');
    const notas = prompt('Notas de la caja ' + c.codigo + ' (vacío = sin notas):', c.notas || '');
    if (notas === null) return;
    const capTxt = prompt('Capacidad de la caja (mínimo ' + Math.max(1, c.cant) + ', máximo 60):', String(c.capacidad));
    if (capTxt === null) return;
    const cap = parseInt(capTxt, 10);
    if (!(cap >= Math.max(1, c.cant) && cap <= 60)) return toast('Capacidad inválida: tiene que estar entre ' + Math.max(1, c.cant) + ' y 60.');
    try {
      await dbq(sb.from(T_CAJAS).update({ notas: notas.trim() || null, capacidad: cap }).eq('id', c.id));
      await refreshCaja();
      log('ok', 'Caja ' + c.codigo + ' actualizada.');
    } catch (e) { errorGeneral(e); }
  }

  /* ═════════ Eliminar (solo administradores; la base también lo exige por RLS) ═════════ */
  // Quita " | CJ | PL" del Lote__c en SF (deja la falla de Logicalis). Devuelve { ok, fallo[] }
  async function limpiarSF(filas) {
    const res = { ok: 0, fallo: [] };
    const prev = await sfPreview(filas.map(function (f) { return f.serie; }));
    const porSerie = {}; prev.forEach(function (r) { porSerie[r.serie] = r; });
    const records = [], esperado = {}, antes = {};
    filas.forEach(function (f) {
      const p = porSerie[f.serie];
      if (!p || !p.found) return res.fallo.push({ serie: f.serie, motivo: 'No existe en Salesforce' });
      const vac = L.camposVacios(p.current);
      if (vac.length) return res.fallo.push({ serie: f.serie, motivo: 'Campos vacíos en SF (' + vac.join(', ') + ')' });
      const lote = L.quitarSufijo(p.current.Lote__c);
      if (lote === String(p.current.Lote__c || '').trim()) return res.ok++;
      if (!lote) return res.fallo.push({ serie: f.serie, motivo: 'El Lote quedaría vacío: revisalo en SF' });
      const fields = { Lote__c: lote };
      L.CAMPOS_PROTEGIDOS.forEach(function (k) { fields[k] = p.current[k]; });
      records.push({ serie: f.serie, fields: fields }); esperado[f.serie] = lote; antes[f.serie] = p.current;
    });
    const upd = {};
    for (let i = 0; i < records.length; i += 25) {
      const j = await sfFetch('/terminales/update-sf', { records: records.slice(i, i + 25) });
      (j.results || []).forEach(function (r) { upd[r.serie] = r; });
    }
    const grabadas = Object.keys(upd).filter(function (s) { return upd[s].ok; });
    const post = grabadas.length ? await sfPreview(grabadas) : [];
    const postMap = {}; post.forEach(function (r) { postMap[r.serie] = r; });
    records.forEach(function (rec) {
      const s = rec.serie, u = upd[s], c = postMap[s] && postMap[s].current;
      if (!u || !u.ok) return res.fallo.push({ serie: s, motivo: (u && u.error) || 'Sin respuesta del agente' });
      if (!c || c.Lote__c !== esperado[s]) return res.fallo.push({ serie: s, motivo: 'Grabó pero la verificación no coincide — revisar en SF' });
      if (L.CAMPOS_PROTEGIDOS.some(function (k) { return c[k] !== antes[s][k]; })) return res.fallo.push({ serie: s, motivo: 'Cambió otro campo — revisar en SF' });
      res.ok++;
    });
    return res;
  }
  // Pregunta si también se limpia SF. Devuelve false si el usuario cancela todo.
  async function limpiezaSFOpcional(filas) {
    const asentadas = filas.filter(function (f) { return f.sf_sync_ok === true || f.sf_lote_grabado; });
    if (!asentadas.length) return true;
    if (!confirm(asentadas.length + ' terminal(es) ya tienen la caja grabada en Salesforce (Lote__c).\n\n' +
      'Aceptar = quitar también " | caja | pallet" del Lote en SF (producción).\nCancelar = elegir si seguir sin tocar SF.')) {
      return confirm('¿Eliminar igual, SIN tocar Salesforce? En SF quedará el código de caja en el Lote.');
    }
    toast('⏳ Limpiando Salesforce…');
    const r = await limpiarSF(asentadas);
    if (r.fallo.length) {
      return confirm('No se pudo limpiar SF en ' + r.fallo.length + ' terminal(es):\n' +
        r.fallo.slice(0, 5).map(function (x) { return x.serie + ' — ' + x.motivo; }).join('\n') + '\n\n¿Eliminar igual?');
    }
    return true;
  }
  // La FK (on delete set null) ya les saca la caja; acá se limpia el resto de su rastro
  async function soltarItems(itemIds) {
    for (let i = 0; i < itemIds.length; i += 100) {
      await dbq(sb.from(T_ITEMS).update({ caja_id: null, caja_at: null, caja_by: null, sf_sync_ok: null, sf_sync_msg: null, sf_lote_grabado: null, sf_sync_at: null }).in('id', itemIds.slice(i, i + 100)));
    }
  }
  async function eliminarCaja(id) {
    if (!esAdmin()) return toast('Solo un administrador puede eliminar cajas.');
    id = id || (S.caja && S.caja.id);
    try {
      const c = await dbq(sb.from(V_CAJAS).select('*').eq('id', id).maybeSingle());
      if (!c) return toast('La caja ya no existe.');
      if (c.pallet_estado === 'enviado') return toast(c.codigo + ' está en un pallet ya enviado: no se puede eliminar.');
      const items = await fetchAll(function (a, b) { return sb.from(V_TRAZ).select('*').eq('caja_id', id).order('serie').range(a, b); });
      if (!confirm('¿ELIMINAR la caja ' + c.codigo + '?\n\n' + items.length + ' terminal(es) quedan sin caja (siguen registradas como irreparables, no se borran).' +
        (c.pallet_codigo ? '\nLa caja sale del pallet ' + c.pallet_codigo + '.' : '') + '\n\nEsto no se puede deshacer.')) return;
      if (!(await limpiezaSFOpcional(items))) return;
      const del = await dbq(sb.from(T_CAJAS).delete().eq('id', id).select('id')).catch(function (e) { return e; });
      if (!del || del instanceof Error || !del.length) {
        await marcarReasentar(items.map(function (x) { return x.id; })).catch(function () { /* noop */ });   // SF pudo quedar sin la caja
        throw (del instanceof Error ? del : new Error('La base no permitió eliminar (solo administradores).'));
      }
      await soltarItems(items.map(function (x) { return x.id; }));
      Object.keys(S.sel).forEach(function (s) { delete S.sel[s]; });
      if (S.caja && S.caja.id === id) { S.caja = null; S.items = []; S.abiertas = []; guardarActiva(); }
      toast('Caja ' + c.codigo + ' eliminada');
      await setTab(S.tab);
    } catch (e) { errorGeneral(e); }
  }
  async function eliminarItem(itemId) {
    if (!esAdmin()) return toast('Solo un administrador puede eliminar terminales.');
    const it = S.items.find(function (x) { return x.id === itemId; });
    if (!it) return;
    if (it.pallet_estado === 'enviado') return toast('La terminal está en un pallet ya enviado: no se puede eliminar.');
    try {
      if (!confirm('¿ELIMINAR del módulo la terminal ' + it.serie + '?\n\nSe borra su registro (falla, info del operador, caja). Si está en un reporte RTO, se vuelve a dar de alta al recargarlo. No se puede deshacer.')) return;
      if (!(await limpiezaSFOpcional([it]))) return;
      const del = await dbq(sb.from(T_ITEMS).delete().eq('id', itemId).select('id')).catch(function (e) { return e; });
      if (!del || del instanceof Error || !del.length) {
        await marcarReasentar([itemId]).catch(function () { /* noop */ });
        throw (del instanceof Error ? del : new Error('La base no permitió eliminar (solo administradores).'));
      }
      delete S.sel[it.serie];
      toast('Terminal eliminada');
      await refreshCaja();
    } catch (e) { errorGeneral(e); }
  }
  async function eliminarPallet() {
    if (!esAdmin()) return toast('Solo un administrador puede eliminar pallets.');
    const p = S.pallet; if (!p) return;
    if (p.estado === 'enviado') return toast(p.codigo + ' ya fue enviado: no se puede eliminar.');
    try {
      if (!confirm('¿ELIMINAR el pallet ' + p.codigo + '?\n\nSus ' + p.cant_cajas + ' caja(s) quedan sin pallet (no se borran ni se abren). ' +
        'Si ya asentaste el pallet en SF, el Lote seguirá mostrando "' + p.codigo + '" hasta que vuelvas a asentar cada caja.\n\nNo se puede deshacer.')) return;
      const ids = S.cajasPallet.map(function (c) { return c.id; });
      if (ids.length) {
        const its = await dbq(sb.from(T_ITEMS).select('id').in('caja_id', ids).eq('sf_sync_ok', true));
        await marcarReasentar((its || []).map(function (x) { return x.id; }));
      }
      const del = await dbq(sb.from(T_PALLETS).delete().eq('id', p.id).select('id'));
      if (!del || !del.length) throw new Error('La base no permitió eliminar (solo administradores).');
      S.pallet = null; S.cajasPallet = [];
      toast('Pallet eliminado');
      await renderPalletTab();
    } catch (e) { errorGeneral(e); }
  }
  async function guardarInfo(itemId, campo, valor) {
    try {
      const patch = {}; patch[campo] = campo === 'operativa' ? !!valor : (String(valor).trim() || null);
      await dbq(sb.from(T_ITEMS).update(patch).eq('id', itemId));
      const it = S.items.find(function (x) { return x.id === itemId; });
      if (it) it[campo] = patch[campo];
      toast('Guardado');
    } catch (e) { errorGeneral(e); }
  }

  /* ═════════ Escaneo (cola secuencial: el lector puede mandar varias lecturas seguidas) ═════════ */
  function scan(inp) {
    const raw = (inp.value || '').trim(); inp.value = '';
    if (!raw) return;
    S.cola.push(raw); drenar();
  }
  async function drenar() {
    if (S.drenando) return;
    S.drenando = true;
    try { while (S.cola.length) { await procesarScan(S.cola.shift()); } }
    finally { S.drenando = false; focoScan(); }
  }
  async function procesarScan(raw) {
    const t = L.tipoEscaneo(raw);
    if (!t) return log('err', 'Código no reconocido: ' + raw);
    try {
      if (t.tipo === 'caja') return await activarCaja(t.codigo);
      if (t.tipo === 'pallet') return log('err', t.codigo + ' es un pallet: las cajas se agregan en la pestaña Pallets.');
      return await agregarSerie(t.serie);
    } catch (e) { log('err', (falloTabla(e) ? 'Falta correr setup_irreparables.sql en Supabase. ' : '') + e.message); }
  }

  async function agregarSerie(serie) {
    const caja = S.caja;
    if (!caja) return log('err', 'Primero abrí una caja (➕ Nueva caja) o escaneá el código de una caja abierta.');
    if (caja.estado !== 'abierta') return log('err', 'La caja ' + caja.codigo + ' está cerrada. Reabrila o abrí otra.');
    if (caja.cant >= caja.capacidad) return log('err', 'La caja ' + caja.codigo + ' está llena (' + caja.capacidad + '). Cerrala e imprimí el rótulo.');
    if (S.alta) return log('err', 'Terminá de cargar los datos de ' + S.alta.serie + ' antes de seguir.');

    let item = await dbq(sb.from(T_ITEMS).select('*').eq('serie', serie).maybeSingle());
    if (item) {
      if (item.caja_id === caja.id) return log('warn', serie + ' ya está en esta caja.');
      if (item.caja_id) {
        const c = await dbq(sb.from(T_CAJAS).select('codigo').eq('id', item.caja_id).maybeSingle());
        return log('err', serie + ' ya está en la caja ' + (c ? c.codigo : '?') + '.');
      }
      await completarFecha(item);
      return asignar(item);
    }

    // No registrada: se consulta Salesforce (falla = lo que informó Logicalis en Lote__c)
    const r = await sfPreview([serie]);
    const sf = r[0];
    if (!sf || !sf.found) return log('err', serie + ': no existe en Salesforce. Revisá la lectura.');
    const cur = sf.current || {};
    if (cur.Tipo_de_producto__c && cur.Tipo_de_producto__c !== '—' && cur.Tipo_de_producto__c !== 'TERMINAL')
      return log('err', serie + ': en SF figura como ' + cur.Tipo_de_producto__c + ', no es una terminal.');
    const pl = L.parseLote(cur.Lote__c);
    if (L.esRota(cur.Estado__c) && pl.falla) {
      item = await crearItem({ serie: serie, origen: 'sf', falla_logicalis: pl.falla, fecha_reporte: L.parseFecha(pl.fecha), sf_id: sf.sfId, sf_estado_ingreso: cur.Estado__c });
      return asignar(item);
    }
    // Operativa (ej. pantalla rayada) o sin falla informada → decide el operador
    S.alta = { serie: serie, sfId: sf.sfId, estadoSF: cur.Estado__c, perfil: cur.Perfil__c, loteSF: cur.Lote__c, fallaSug: pl.falla || pl.base || '', fechaRep: L.parseFecha(pl.fecha) };
    log('warn', serie + ': en SF está ' + (cur.Estado__c || '—') + ' / ' + (cur.Perfil__c || '—') + '. Cargá la falla para sumarla.');
    renderAlta();
  }

  // Terminales registradas antes de existir la columna (o sin fecha): se completa con la fecha del Lote en SF.
  // Nunca bloquea el escaneo.
  async function completarFecha(item) {
    if (item.fecha_reporte) return;
    try {
      const sf = (await sfPreview([item.serie]))[0];
      const f = sf && sf.found && sf.current ? L.parseFecha(L.parseLote(sf.current.Lote__c).fecha) : null;
      if (!f) return;
      await dbq(sb.from(T_ITEMS).update({ fecha_reporte: f }).eq('id', item.id).is('fecha_reporte', null));
      item.fecha_reporte = f;
    } catch (e) { /* sin fecha por ahora */ }
  }
  async function crearItem(o) {
    o.created_by = quien();
    try { return await dbq(sb.from(T_ITEMS).insert(o).select('*').single()); }
    catch (e) {
      if (e.code === '23505') return await dbq(sb.from(T_ITEMS).select('*').eq('serie', o.serie).single());  // la dio de alta otro a la vez
      throw e;
    }
  }
  async function asignar(item) {
    const caja = S.caja;
    const upd = await dbq(sb.from(T_ITEMS).update({ caja_id: caja.id, caja_at: new Date().toISOString(), caja_by: quien() })
      .eq('id', item.id).is('caja_id', null).select('id'));
    if (!upd || !upd.length) return log('err', item.serie + ': otro operador la acaba de asignar a una caja.');
    log('ok', item.serie + ' → ' + caja.codigo + (item.falla_logicalis ? '  ·  ' + item.falla_logicalis : ''));
    await refreshCaja();
    if (S.caja.cant >= S.caja.capacidad) log('warn', '✅ ' + S.caja.codigo + ' completa (' + S.caja.capacidad + '). Cerrala e imprimí el rótulo.');
  }
  async function confirmarAlta() {
    const a = S.alta; if (!a) return;
    const falla = ($('irrAltaFalla').value || '').trim();
    const info = ($('irrAltaInfo').value || '').trim();
    const operativa = $('irrAltaOper').checked;
    if (!falla) return toast('Indicá la falla (es lo que se asienta en SF).');
    try {
      const item = await crearItem({
        serie: a.serie, origen: L.esRota(a.estadoSF) ? 'sf' : 'manual', falla_logicalis: falla, fecha_reporte: a.fechaRep || null,
        info_operador: info || null, operativa: operativa, sf_id: a.sfId, sf_estado_ingreso: a.estadoSF,
      });
      S.alta = null; renderAlta();
      await asignar(item);
    } catch (e) { errorGeneral(e); }
    focoScan();
  }
  function cancelarAlta() { S.alta = null; renderAlta(); focoScan(); }

  /* ═════════ Salesforce ═════════ */
  async function sfFetch(path, body) {
    const r = await fetch(AGENT + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }
  async function sfPreview(series) {
    let out = [];
    for (let i = 0; i < series.length; i += 50) {
      const j = await sfFetch('/terminales/preview-sf', { series: series.slice(i, i + 50) });
      out = out.concat(j.results || []);
    }
    return out;
  }

  // Graba caja/pallet en Product2.Lote__c. filas = filas de v_irreparables_trazabilidad.
  async function asentarSF(filas, opts) {
    opts = opts || {};
    const validas = filas.filter(function (f) { return f.caja; });
    if (!validas.length) return toast('No hay terminales con caja para asentar.');
    if (!opts.sinConfirmar && !confirm('Vas a grabar en SALESFORCE (producción) ' + validas.length + ' terminal(es).\n\n' +
      'Se modifica SOLO Product2.Lote__c: se agrega " | caja | pallet" al final (la falla de Logicalis se conserva). ' +
      'Ubicación, Estado, Perfil y Batería se reenvían sin cambios.\n\n¿Continuar?')) return;
    const msg = $('irrSfMsg'); if (msg) msg.innerHTML = '<span style="color:var(--text-muted)">⏳ Consultando Salesforce…</span>';
    const hoy = new Date().toLocaleDateString('es-AR');
    const res = { ok: 0, igual: 0, fallo: [] };
    let faltanFinal = [];
    try {
      const prev = await sfPreview(validas.map(function (f) { return f.serie; }));
      const porSerie = {}; prev.forEach(function (r) { porSerie[r.serie] = r; });
      const records = [], esperado = {}, antes = {}, faltan = [];
      faltanFinal = faltan;
      validas.forEach(function (f) {
        f._pend = false;
        const p = porSerie[f.serie];
        if (!p || !p.found) return res.fallo.push({ serie: f.serie, motivo: 'No existe en Salesforce' });
        const vac = L.camposVacios(p.current);
        const noCompletables = vac.filter(function (k) { return L.COMPLETABLES.indexOf(k) < 0; });
        if (noCompletables.length) return res.fallo.push({ serie: f.serie, motivo: 'Campos vacíos en SF (' + noCompletables.join(', ') + '): completalos en SF y reintentá' });
        // Perfil / Batería vacíos: los elige el operador (se graban en SF junto con el Lote)
        const cur = Object.assign({}, p.current), pend = [];
        vac.forEach(function (k) { const v = (S.comp[f.serie] || {})[k]; if (v) cur[k] = v; else pend.push(k); });
        if (pend.length) { f._pend = true; return faltan.push({ serie: f.serie, campos: pend }); }
        const lote = L.armarLote({ loteActual: p.current.Lote__c, falla: f.falla_logicalis, info: f.info_operador, caja: f.caja, pallet: f.pallet, hoy: hoy });
        if (lote === p.current.Lote__c && !vac.length) { res.igual++; f._ok = { sfId: p.sfId, lote: lote, igual: true }; return; }
        const fields = { Lote__c: lote };
        L.CAMPOS_PROTEGIDOS.forEach(function (k) { fields[k] = cur[k]; });
        records.push({ serie: f.serie, fields: fields });
        esperado[f.serie] = lote; antes[f.serie] = cur; f._sfId = p.sfId;
      });

      const upd = {};
      for (let i = 0; i < records.length; i += 25) {
        if (msg) msg.innerHTML = '<span style="color:var(--text-muted)">⏳ Grabando ' + Math.min(i + 25, records.length) + ' / ' + records.length + '…</span>';
        const j = await sfFetch('/terminales/update-sf', { records: records.slice(i, i + 25) });
        (j.results || []).forEach(function (r) { upd[r.serie] = r; });
      }
      // Verificación: se vuelve a leer y se compara contra lo esperado
      const grabadas = Object.keys(upd).filter(function (s) { return upd[s].ok; });
      const post = grabadas.length ? await sfPreview(grabadas) : [];
      const postMap = {}; post.forEach(function (r) { postMap[r.serie] = r; });
      records.forEach(function (rec) {
        const s = rec.serie, u = upd[s];
        if (!u || !u.ok) return res.fallo.push({ serie: s, motivo: (u && u.error) || 'Sin respuesta del agente' });
        const c = postMap[s] && postMap[s].current;
        const cambioOtro = c && L.CAMPOS_PROTEGIDOS.some(function (k) { return c[k] !== antes[s][k]; });
        if (!c || c.Lote__c !== esperado[s]) return res.fallo.push({ serie: s, motivo: 'Grabó pero la verificación no coincide — revisar en SF' });
        if (cambioOtro) return res.fallo.push({ serie: s, motivo: '⚠ Cambió otro campo (Ubicación/Estado/Perfil/Batería) — revisar en SF' });
        res.ok++;
        const f = validas.find(function (x) { return x.serie === s; }); if (f) f._ok = { sfId: u.sfId, lote: esperado[s] };
      });

      // Resultado en la base
      const ahora = new Date().toISOString();
      const fallos = {}; res.fallo.forEach(function (x) { fallos[x.serie] = x.motivo; });
      for (const f of validas) {
        if (f._pend) continue;                       // espera que el operador elija Perfil / Batería
        const patch = { sf_sync_at: ahora };
        if (f._ok) { delete S.comp[f.serie]; patch.sf_sync_ok = true; patch.sf_sync_msg = f._ok.igual ? 'Ya estaba asentado' : 'OK'; patch.sf_lote_grabado = f._ok.lote; if (f._ok.sfId) patch.sf_id = f._ok.sfId; }
        else { patch.sf_sync_ok = false; patch.sf_sync_msg = (fallos[f.serie] || 'Error').slice(0, 300); }
        await dbq(sb.from(T_ITEMS).update(patch).eq('id', f.id));
      }
    } catch (e) {
      if (msg) msg.innerHTML = '<span style="color:var(--red,#ef4444)">⛔ ' + esc(e.message) + '</span>';
      return;
    }
    const lineas = ['✅ ' + res.ok + ' grabada(s) y verificada(s)'];
    if (res.igual) lineas.push('= ' + res.igual + ' ya estaban asentadas');
    const resumenHtml = '<div style="color:var(--teal)">' + lineas.join(' · ') + '</div>' +
      (res.fallo.length ? '<div style="color:var(--red,#ef4444);margin-top:4px">⛔ ' + res.fallo.length + ' con problema:<br>' +
        res.fallo.map(function (x) { return '<span class="irr-mono">' + esc(x.serie) + '</span> — ' + esc(x.motivo); }).join('<br>') + '</div>' : '');
    // Se refresca primero y recién después se escribe el resumen (el refresco re-dibuja la pantalla)
    try {
      if (S.tab === 'escaneo') await refreshCaja();
      if (S.tab === 'pallets') await renderPalletTab();
    } catch (e) { /* el resumen se muestra igual */ }
    const m2 = $('irrSfMsg'); if (m2) m2.innerHTML = resumenHtml;
    // Las terminales con Perfil / Batería vacíos en SF quedaron sin grabar: se pregunta con qué completarlas
    if (faltanFinal.length) { S.pendSF = validas.filter(function (f) { return f._pend; }); renderComplemento(faltanFinal, true); }
  }
  /* ── Perfil / Batería vacíos en SF: el operador los elige con un click ── */
  function renderComplemento(faltan, agregar) {
    const el = $('irrSfMsg'); if (!el) return;
    S.faltan = faltan;
    const selP = function (serie) { return '<select class="irr-in" style="width:auto" onchange="Irr.comp(\'' + esc(serie) + '\',\'Perfil__c\',this.value)"><option value="">Perfil…</option>' + L.OPC_PERFIL.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join('') + '</select>'; };
    const selB = function (serie) { return '<select class="irr-in" style="width:auto" onchange="Irr.comp(\'' + esc(serie) + '\',\'CAMBIO_DE_BATERIA__c\',this.value)"><option value="">Batería…</option>' + L.OPC_BATERIA.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join('') + '</select>'; };
    const hayP = faltan.some(function (f) { return f.campos.indexOf('Perfil__c') >= 0; });
    const hayB = faltan.some(function (f) { return f.campos.indexOf('CAMBIO_DE_BATERIA__c') >= 0; });
    const html = '<div class="card" style="border:1.5px solid #f59e0b;margin:8px 0">' +
      '<div style="font-size:12px;font-weight:700;color:#f59e0b;margin-bottom:4px">⚠ ' + faltan.length + ' terminal(es) con datos vacíos en Salesforce — elegí con qué completarlos</div>' +
      '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Salesforce exige Perfil y Cambio de batería al grabar. Lo que elijas se graba en SF junto con el Lote. Todavía no se escribió nada.</div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px"><span style="font-size:11px;font-weight:700">Para todas:</span>' +
      (hayP ? '<select class="irr-in" style="width:auto" onchange="Irr.compTodas(\'Perfil__c\',this.value)"><option value="">Perfil…</option>' + L.OPC_PERFIL.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join('') + '</select>' : '') +
      (hayB ? '<select class="irr-in" style="width:auto" onchange="Irr.compTodas(\'CAMBIO_DE_BATERIA__c\',this.value)"><option value="">Batería…</option>' + L.OPC_BATERIA.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join('') + '</select>' : '') + '</div>' +
      '<div style="max-height:260px;overflow:auto"><table class="irr-tbl"><tbody>' + faltan.map(function (f) {
        return '<tr data-serie="' + esc(f.serie) + '"><td class="irr-mono">' + esc(f.serie) + '</td><td>' +
          (f.campos.indexOf('Perfil__c') >= 0 ? selP(f.serie) : '') + '</td><td>' + (f.campos.indexOf('CAMBIO_DE_BATERIA__c') >= 0 ? selB(f.serie) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div style="margin-top:10px;display:flex;gap:8px"><button class="btn btn-sm" onclick="Irr.compAplicar()">📤 Asentar en SF con estos datos</button>' +
      '<button class="btn btn-sm" style="background:transparent;border:1px solid var(--border);color:var(--text-muted)" onclick="Irr.compCancelar()">Cancelar</button></div></div>';
    if (agregar) el.insertAdjacentHTML('beforeend', html); else el.innerHTML = html;
  }
  function compSet(serie, campo, valor) { S.comp[serie] = S.comp[serie] || {}; if (valor) S.comp[serie][campo] = valor; else delete S.comp[serie][campo]; }
  function compTodas(campo, valor) {
    (S.faltan || []).forEach(function (f) { if (f.campos.indexOf(campo) >= 0) compSet(f.serie, campo, valor); });
    document.querySelectorAll('#irrSfMsg tr[data-serie]').forEach(function (tr) {
      const s = tr.getAttribute('data-serie');
      tr.querySelectorAll('select').forEach(function (sel) {
        const oc = sel.getAttribute('onchange') || '';
        if (oc.indexOf("'" + campo + "'") >= 0) sel.value = (S.comp[s] || {})[campo] || '';
      });
    });
  }
  function compAplicar() {
    const sin = (S.faltan || []).filter(function (f) { return f.campos.some(function (k) { return !(S.comp[f.serie] || {})[k]; }); });
    if (sin.length) return toast('Falta elegir Perfil / Batería en ' + sin.length + ' terminal(es).');
    const filas = S.pendSF || [];
    asentarSF(filas, { sinConfirmar: true });
  }
  function compCancelar() { S.faltan = []; S.pendSF = null; const el = $('irrSfMsg'); if (el) el.innerHTML = ''; }
  function asentarSeleccion() {
    const filas = S.items.filter(function (i) { return S.sel[i.serie]; });
    if (!filas.length) return toast('Marcá al menos una terminal (o usá "Seleccionar todas").');
    asentarSF(filas);
  }
  function selTodas(v) { S.items.forEach(function (i) { S.sel[i.serie] = !!v; }); renderCajaItems(); }

  /* ═════════ Pallets ═════════ */
  async function nuevoPallet() {
    try {
      const p = await dbq(sb.from(T_PALLETS).insert({ created_by: quien() }).select('id').single());
      await cargarPallet(p.id); await renderPalletTab();
    } catch (e) { errorGeneral(e); }
  }
  async function elegirPallet(id) { try { await cargarPallet(id); await renderPalletTab(); } catch (e) { errorGeneral(e); } }
  async function agregarCajaAPallet(raw) {
    const t = L.tipoEscaneo(raw); const p = S.pallet;
    if (!p) return toast('Primero abrí un pallet.');
    if (p.estado !== 'abierto') return toast('El pallet ' + p.codigo + ' no está abierto.');
    if (!t || t.tipo !== 'caja') return toast('Escaneá el código de una caja (CJ-xxxx).');
    try {
      const c = await dbq(sb.from(V_CAJAS).select('*').eq('codigo', t.codigo).maybeSingle());
      if (!c) return toast('No existe la caja ' + t.codigo);
      if (c.estado !== 'cerrada') return toast(t.codigo + ' sigue abierta: cerrala antes de ponerla en un pallet.');
      if (c.pallet_id === p.id) return toast(t.codigo + ' ya está en este pallet.');
      if (c.pallet_id) return toast(t.codigo + ' ya está en el pallet ' + c.pallet_codigo + '.');
      if (p.cant_cajas >= L.CAP_PALLET_CAJAS && !confirm('El pallet ya tiene ' + p.cant_cajas + ' cajas (~' + L.CAP_PALLET_CAJAS * L.CAP_CAJA + ' terminales). ¿Agregar igual?')) return;
      await dbq(sb.from(T_CAJAS).update({ pallet_id: p.id }).eq('id', c.id).is('pallet_id', null));
      await cargarPallet(p.id); await renderPalletTab();
    } catch (e) { errorGeneral(e); }
  }
  async function quitarCajaDePallet(cajaId) {
    if (!S.pallet || S.pallet.estado !== 'abierto') return;
    try { await dbq(sb.from(T_CAJAS).update({ pallet_id: null }).eq('id', cajaId)); await cargarPallet(S.pallet.id); await renderPalletTab(); }
    catch (e) { errorGeneral(e); }
  }
  async function cerrarPallet() {
    const p = S.pallet; if (!p || p.estado !== 'abierto') return;
    if (!p.cant_cajas) return toast('El pallet no tiene cajas.');
    if (!confirm('¿Cerrar el pallet ' + p.codigo + ' con ' + p.cant_cajas + ' cajas / ' + p.cant_terminales + ' terminales?')) return;
    const w = abrirVentana();
    try {
      await dbq(sb.from(T_PALLETS).update({ estado: 'cerrado', closed_at: new Date().toISOString() }).eq('id', p.id));
      await cargarPallet(p.id); await renderPalletTab();
      await imprimirPallet(p.id, w);
    } catch (e) { if (w) w.close(); errorGeneral(e); }
  }
  async function reabrirPallet() {
    const p = S.pallet; if (!p || p.estado !== 'cerrado') return;
    try { await dbq(sb.from(T_PALLETS).update({ estado: 'abierto', closed_at: null }).eq('id', p.id)); await cargarPallet(p.id); await renderPalletTab(); }
    catch (e) { errorGeneral(e); }
  }
  async function enviarPallet() {
    const p = S.pallet; if (!p || p.estado !== 'cerrado') return toast('Cerrá el pallet antes de marcarlo como enviado.');
    const remito = prompt('N° de remito / referencia del envío a ' + p.destino + ' (opcional):', p.remito || '');
    if (remito === null) return;
    try {
      await dbq(sb.from(T_PALLETS).update({ estado: 'enviado', remito: remito.trim() || null, enviado_at: new Date().toISOString() }).eq('id', p.id));
      await cargarPallet(p.id); await renderPalletTab();
    } catch (e) { errorGeneral(e); }
  }
  async function itemsDePallet(palletId) {
    return fetchAll(function (a, b) { return sb.from(V_TRAZ).select('*').eq('pallet_id', palletId).order('caja').order('serie').range(a, b); });
  }
  async function asentarPallet() {
    if (!S.pallet) return;
    try { asentarSF(await itemsDePallet(S.pallet.id)); } catch (e) { errorGeneral(e); }
  }
  async function exportarPacking(palletId) {
    try {
      if (typeof XLSX === 'undefined') return toast('La librería Excel no cargó. Recargá la página.');
      const id = palletId || (S.pallet && S.pallet.id);
      const p = await dbq(sb.from(V_PALLETS).select('*').eq('id', id).single());
      const items = await itemsDePallet(id);
      const rows = items.map(function (i) {
        return {
          'Pallet': i.pallet, 'Caja': i.caja, 'Serie': i.serie, 'Modelo': i.modelo || '',
          'Falla Logicalis': i.falla_logicalis || '', 'Fecha reporte': i.fecha_reporte ? L.fmtDia(i.fecha_reporte) : '', 'Info operador': i.info_operador || '',
          'Operativa': i.operativa ? 'SÍ' : '', 'Origen': i.origen, 'RTO / Factura': i.rto_ref || '',
          'Asentado en SF': i.sf_sync_ok ? 'SÍ' : '', 'Lote SF': i.sf_lote_grabado || '',
        };
      });
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [10, 10, 28, 12, 40, 14, 40, 9, 8, 14, 12, 50].map(function (w) { return { wch: w }; });
      XLSX.utils.book_append_sheet(wb, ws, 'Packing list');
      const resumen = [['Pallet', p.codigo], ['Estado', p.estado], ['Destino', p.destino], ['Remito', p.remito || ''],
        ['Cajas', p.cant_cajas], ['Terminales', p.cant_terminales], ['Enviado', p.enviado_at ? fmtFecha(p.enviado_at) : ''],
        ['Generado', fmtFecha(new Date().toISOString())], ['Por', quien()]];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen');
      XLSX.writeFile(wb, 'PackingList_' + p.codigo + '.xlsx');
    } catch (e) { errorGeneral(e); }
  }

  /* ═════════ Impresión (SATO, 100x150 mm) ═════════ */
  function abrirVentana() {
    const w = window.open('', '_blank', 'width=460,height=700');
    if (w) w.document.write('<p style="font-family:Arial;padding:20px">Generando rótulo…</p>');
    return w;
  }
  const CSS_ROTULO = [
    '@page{size:100mm 150mm portrait;margin:0}', '*{margin:0;padding:0;box-sizing:border-box}',
    "html,body{width:100mm;font-family:Arial,sans-serif;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}",
    '.rotulo{width:100mm;height:150mm;padding:3mm;display:flex;flex-direction:column;overflow:hidden}',
    '.hdr{display:flex;align-items:center;justify-content:space-between;border-bottom:1.5px solid #000;padding-bottom:1.5mm;margin-bottom:2mm}',
    '.logo{font-size:18px;font-weight:900;letter-spacing:-1px;color:#1dbf8e!important}.hdr small{font-size:7px;color:#444;text-align:right;line-height:1.4}',
    '.tag{background:#000!important;color:#fff!important;text-align:center;font-weight:900;font-size:12px;letter-spacing:1.5px;padding:1.6mm;margin-bottom:2mm}',
    '.code{font-size:40px;font-weight:900;text-align:center;letter-spacing:-1px;line-height:1.05;border:2.5px solid #000;padding:1.5mm;margin-bottom:2mm}',
    '.codes{display:flex;gap:3mm;align-items:center;margin-bottom:2mm;padding-right:7mm}.codes img.bc{flex:1;min-width:0;height:17mm;object-fit:contain}.codes img.qr{width:20mm;height:20mm;flex:none}',
    '.info{display:grid;grid-template-columns:1fr 1fr;gap:1.2mm 3mm;margin-bottom:2mm}',
    '.k{font-size:7px;font-weight:700;color:#555;text-transform:uppercase}.v{font-size:12px;font-weight:900}',
    '.lst-h{font-size:8px;font-weight:700;text-transform:uppercase;color:#555;border-top:1.5px solid #000;padding-top:1.2mm;margin-bottom:1mm}',
    ".lst{display:grid;grid-template-columns:1fr 1fr;gap:0 3mm;font-family:'Courier New',monospace;font-size:8.2px;font-weight:700;line-height:1.42}",
    '.lst3{grid-template-columns:1fr 1fr 1fr;font-size:9.5px}',
    '.foot{margin-top:auto;border-top:1.5px solid #000;padding-top:1.2mm;font-size:7px;color:#333}',
    '.btn{display:block;width:95mm;margin:6px auto 0;padding:9px;background:#1dbf8e;color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;border-radius:5px}',
    '@media print{.btn{display:none!important}}',
  ].join('');
  function urlBarcode(t) { return 'https://barcode.tec-it.com/barcode.ashx?data=' + encodeURIComponent(t) + '&code=Code128&dpi=200&imagetype=Png'; }
  function urlQR(t) { return 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=1&data=' + encodeURIComponent(t); }
  function escribir(w, titulo, cuerpo) {
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + esc(titulo) + '</title><style>' + CSS_ROTULO + '</style></head><body>' +
      cuerpo + '<button class="btn" onclick="window.print()">🖨️ Imprimir</button></body></html>';
    if (!w || w.closed) { toast('El navegador bloqueó la ventana de impresión. Permití popups para este sitio.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }
  async function imprimirCaja(id, w) {
    w = w || abrirVentana();
    try {
      const c = await dbq(sb.from(V_CAJAS).select('*').eq('id', id).single());
      const items = await fetchAll(function (a, b) { return sb.from(V_TRAZ).select('serie').eq('caja_id', id).order('serie').range(a, b); });
      const lista = items.map(function (i, n) { return '<div>' + String(n + 1).padStart(2, '0') + ' ' + esc(i.serie) + '</div>'; }).join('');
      escribir(w, 'Rótulo ' + c.codigo,
        '<div class="rotulo"><div class="hdr"><span class="logo">alleata</span><small>Andrés Moretti e Hijos S.A.<br>California 2082, CABA</small></div>' +
        '<div class="tag">TERMINALES IRREPARABLES</div><div class="code">' + esc(c.codigo) + '</div>' +
        '<div class="codes"><img class="bc" src="' + urlBarcode(c.codigo) + '"><img class="qr" src="' + urlQR(c.codigo) + '"></div>' +
        '<div class="info"><div><div class="k">Cantidad</div><div class="v">' + c.cant + ' terminales</div></div>' +
        '<div><div class="k">Cerrada</div><div class="v">' + esc(c.closed_at ? fmtFecha(c.closed_at) : '—') + '</div></div>' +
        '<div><div class="k">Destino</div><div class="v">SPP</div></div>' +
        '<div><div class="k">Pallet</div><div class="v">' + esc(c.pallet_codigo || '________') + '</div></div></div>' +
        '<div class="lst-h">Series en esta caja</div><div class="lst">' + lista + '</div>' +
        '<div class="foot">Origen: Barracas · Impreso ' + esc(fmtFecha(new Date().toISOString())) + ' · ' + esc(quien()) + '</div></div>');
    } catch (e) { if (w) w.close(); errorGeneral(e); }
  }
  async function imprimirPallet(id, w) {
    w = w || abrirVentana();
    try {
      const p = await dbq(sb.from(V_PALLETS).select('*').eq('id', id).single());
      const cajas = await dbq(sb.from(V_CAJAS).select('codigo,cant').eq('pallet_id', id).order('codigo'));
      const lista = cajas.map(function (c) { return '<div>' + esc(c.codigo) + ' · ' + c.cant + ' u.</div>'; }).join('');
      escribir(w, 'Etiqueta ' + p.codigo,
        '<div class="rotulo"><div class="hdr"><span class="logo">alleata</span><small>Andrés Moretti e Hijos S.A.<br>California 2082, CABA</small></div>' +
        '<div class="tag">PALLET · TERMINALES IRREPARABLES</div><div class="code">' + esc(p.codigo) + '</div>' +
        '<div class="codes"><img class="bc" src="' + urlBarcode(p.codigo) + '"><img class="qr" src="' + urlQR(p.codigo) + '"></div>' +
        '<div class="info"><div><div class="k">Cajas</div><div class="v">' + p.cant_cajas + '</div></div>' +
        '<div><div class="k">Terminales</div><div class="v">' + p.cant_terminales + '</div></div>' +
        '<div><div class="k">Destino</div><div class="v">' + esc(p.destino) + '</div></div>' +
        '<div><div class="k">Remito</div><div class="v">' + esc(p.remito || '________') + '</div></div></div>' +
        '<div class="lst-h">Cajas en este pallet</div><div class="lst lst3">' + lista + '</div>' +
        '<div class="foot">Origen: Barracas · Impreso ' + esc(fmtFecha(new Date().toISOString())) + ' · ' + esc(quien()) + '</div></div>');
    } catch (e) { if (w) w.close(); errorGeneral(e); }
  }
  function reimprimirCaja(id) { imprimirCaja(id, abrirVentana()); }
  function reimprimirPallet(id) { imprimirPallet(id, abrirVentana()); }

  /* ═════════ Render ═════════ */
  function errorGeneral(e) {
    console.error('[Irreparables]', e);
    const falta = falloTabla(e);
    toast('⛔ ' + (falta ? 'Falta correr setup_irreparables.sql en Supabase' : e.message));
    if (falta) { const r = $('irrBody'); if (r) r.innerHTML = '<div class="card" style="color:var(--red,#ef4444)">Faltan las tablas del módulo. Ejecutá <b>doc/setup_irreparables.sql</b> en el SQL Editor de Supabase y recargá.</div>'; }
  }
  function focoScan() { const i = $('irrScan') || $('irrScanPallet') || $('irrBuscar'); if (i) setTimeout(function () { i.focus(); }, 30); }
  function badge(txt, color) {
    return '<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;background:' + color + '22;color:' + color + ';border:1px solid ' + color + '55;white-space:nowrap">' + esc(txt) + '</span>';
  }
  const ESTADO_COLOR = { pendiente: '#94a3b8', en_caja: '#f59e0b', en_pallet: '#1a9fd4', enviado_spp: '#1dbf8e' };
  const ESTADO_TXT = { pendiente: 'Sin caja', en_caja: 'En caja', en_pallet: 'En pallet', enviado_spp: 'Enviado a SPP' };

  function ensureCss() {
    if ($('irrCss')) return;
    const st = document.createElement('style'); st.id = 'irrCss';
    st.textContent = '.irr-mono{font-family:"JetBrains Mono",monospace;font-size:11px}' +
      '.irr-tab{padding:7px 14px;border-radius:8px;border:1px solid var(--border);background:var(--navy-800);color:var(--text-muted);font-size:12px;font-weight:700;cursor:pointer}' +
      '.irr-tab.on{background:rgba(29,191,142,.15);color:var(--teal);border-color:rgba(29,191,142,.4)}' +
      '.irr-tbl{width:100%;border-collapse:collapse;font-size:11px}.irr-tbl th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);padding:6px 8px;border-bottom:1px solid var(--border)}' +
      '.irr-tbl td{padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:middle}' +
      '.irr-scan{width:100%;font-size:18px;padding:12px 14px;font-family:"JetBrains Mono",monospace;border:2px solid var(--teal);border-radius:10px;background:var(--navy-700);color:var(--text)}' +
      '.irr-big{font-size:34px;font-weight:900;line-height:1}.irr-in{width:100%;padding:4px 6px;font-size:11px;background:var(--navy-700);border:1px solid var(--border);border-radius:5px;color:var(--text)}';
    document.head.appendChild(st);
  }

  function skeleton() {
    const m = $('mod-irreparables'); if (!m) return false;
    ensureCss();
    m.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">' +
      '<div><div style="font-size:16px;font-weight:900;color:var(--text)">🧰 Irreparables — trazabilidad a SPP</div>' +
      '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Terminal → caja (30) → pallet → depósito SPP · falla de Logicalis + info del operador · se asienta en Salesforce</div></div></div>' +
      '<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">' +
      ['escaneo|📥 Escaneo / Caja', 'pallets|🏗️ Pallets', 'cajas|📦 Cajas', 'consulta|🔎 Consulta'].map(function (t) {
        const p = t.split('|'); return '<button class="irr-tab" id="irrT_' + p[0] + '" onclick="Irr.tab(\'' + p[0] + '\')">' + p[1] + '</button>';
      }).join('') + '</div><div id="irrBody"></div>';
    return true;
  }
  async function setTab(t) {
    S.tab = t;
    ['escaneo', 'pallets', 'cajas', 'consulta'].forEach(function (k) { const b = $('irrT_' + k); if (b) b.classList.toggle('on', k === t); });
    const body = $('irrBody'); if (!body) return;
    try {
      if (t === 'escaneo') renderEscaneoSkeleton();
      else if (t === 'pallets') await renderPalletTab();
      else if (t === 'cajas') await renderCajasTab();
      else await renderConsultaTab();
    } catch (e) { errorGeneral(e); }
  }

  /* ── Tab Escaneo ── */
  function renderEscaneoSkeleton() {
    $('irrBody').innerHTML = '<div id="irrCajaBar"></div>' +
      '<input id="irrScan" class="irr-scan" autocomplete="off" placeholder="Escaneá una terminal  ·  o el código de una caja (CJ-xxxx) para activarla" onkeydown="if(event.key===\'Enter\')Irr.scan(this)">' +
      '<div id="irrScanLog" style="margin:8px 0"></div><div id="irrAlta"></div><div id="irrSfMsg" style="font-size:11px;margin:6px 0"></div><div id="irrCajaItems"></div>';
    renderCajaBar(); renderLog(); renderAlta(); renderCajaItems(); focoScan();
  }
  function renderCajaBar() {
    const el = $('irrCajaBar'); if (!el) return;
    const c = S.caja;
    const sel = '<select class="input" style="max-width:230px" onchange="Irr.elegirCaja(this.value)"><option value="">Elegir caja abierta…</option></select>';
    if (!c) {
      el.innerHTML = '<div class="card" style="margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div style="flex:1;color:var(--text-muted);font-size:12px">No hay caja activa.</div>' +
        '<button class="btn btn-sm" onclick="Irr.nuevaCaja()">➕ Nueva caja</button>' + sel + '</div>';
      cargarSelectCajas(); return;
    }
    const llena = c.cant >= c.capacidad, pct = Math.min(100, Math.round(c.cant / c.capacidad * 100));
    el.innerHTML = '<div class="card" style="margin-bottom:10px"><div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">' +
      '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Caja activa</div><div class="irr-big" style="color:var(--teal)">' + esc(c.codigo) + '</div></div>' +
      '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Terminales</div><div class="irr-big" style="color:' + (llena ? '#f59e0b' : 'var(--text)') + '">' + c.cant + '<span style="font-size:18px;color:var(--text-muted)"> / ' + c.capacidad + '</span></div></div>' +
      '<div>' + badge(c.estado === 'abierta' ? 'ABIERTA' : 'CERRADA', c.estado === 'abierta' ? '#1dbf8e' : '#94a3b8') + (c.pallet_codigo ? ' ' + badge(c.pallet_codigo, '#1a9fd4') : '') + '</div>' +
      '<div style="flex:1"></div><div style="display:flex;gap:6px;flex-wrap:wrap">' +
      (c.estado === 'abierta' ? '<button class="btn btn-sm" onclick="Irr.cerrarCaja()">✅ Cerrar e imprimir rótulo</button>' : '<button class="btn btn-sm" onclick="Irr.reimprimirCaja(\'' + c.id + '\')">🖨️ Reimprimir</button>' + (c.pallet_estado !== 'enviado' ? '<button class="btn btn-sm" onclick="Irr.reabrirCaja()">↩ Reabrir para modificar</button>' : '')) +
      (c.pallet_estado !== 'enviado' ? '<button class="btn btn-sm" onclick="Irr.editarCaja()">✏️ Editar caja</button>' : '') +
      (esAdmin() && c.pallet_estado !== 'enviado' ? '<button class="btn btn-sm" style="background:transparent;border:1px solid #ef4444;color:#ef4444" onclick="Irr.eliminarCaja()">🗑 Eliminar caja</button>' : '') +
      '<button class="btn btn-sm" onclick="Irr.nuevaCaja()">➕ Nueva caja</button></div></div>' +
      (c.notas ? '<div style="font-size:11px;color:var(--text-muted);margin-top:8px">📝 ' + esc(c.notas) + '</div>' : '') +
      '<div style="height:6px;background:var(--navy-700);border-radius:4px;margin-top:10px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + (llena ? '#f59e0b' : 'var(--teal)') + '"></div></div></div>';
  }
  async function cargarSelectCajas() {
    try {
      const abiertas = await dbq(sb.from(V_CAJAS).select('id,codigo,cant,capacidad').eq('estado', 'abierta').order('created_at', { ascending: false }).limit(50));
      const s = document.querySelector('#irrCajaBar select'); if (!s) return;
      s.innerHTML = '<option value="">Elegir caja abierta…</option>' + abiertas.map(function (c) { return '<option value="' + c.id + '">' + esc(c.codigo) + ' (' + c.cant + '/' + c.capacidad + ')</option>'; }).join('');
    } catch (e) { errorGeneral(e); }
  }
  function renderLog() {
    const el = $('irrScanLog'); if (!el) return;
    const col = { ok: '#1dbf8e', err: '#ef4444', warn: '#f59e0b', info: '#94a3b8' };
    el.innerHTML = S.log.slice(0, 6).map(function (l, i) {
      return '<div style="font-size:' + (i === 0 ? 13 : 11) + 'px;font-weight:' + (i === 0 ? 700 : 400) + ';color:' + col[l.t] + ';opacity:' + (i === 0 ? 1 : .65) + ';padding:1px 0"><span style="opacity:.6">' + esc(l.h) + '</span> ' + esc(l.m) + '</div>';
    }).join('');
  }
  function renderAlta() {
    const el = $('irrAlta'); if (!el) return;
    const a = S.alta;
    if (!a) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="card" style="border:1.5px solid #f59e0b;margin-bottom:10px"><div style="font-size:12px;font-weight:700;color:#f59e0b;margin-bottom:6px">⚠ Terminal no registrada como irreparable — <span class="irr-mono">' + esc(a.serie) + '</span></div>' +
      '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">En SF hoy: Estado <b>' + esc(a.estadoSF || '—') + '</b> · Perfil <b>' + esc(a.perfil || '—') + '</b> · Lote <b>' + esc(a.loteSF || '—') + '</b>. ' +
      'Si está operativa (ej. pantalla rayada) tildá “Operativa”: no se cambia su Estado/Perfil en SF, solo se asienta la falla y la caja.</div>' +
      '<div style="display:grid;grid-template-columns:2fr 2fr auto;gap:8px;align-items:end">' +
      '<div><div style="font-size:10px;color:var(--text-muted)">Falla / motivo *</div><input id="irrAltaFalla" class="input" value="' + esc(a.fallaSug) + '" onkeydown="if(event.key===\'Enter\')Irr.confirmarAlta()"></div>' +
      '<div><div style="font-size:10px;color:var(--text-muted)">Info del operador</div><input id="irrAltaInfo" class="input" onkeydown="if(event.key===\'Enter\')Irr.confirmarAlta()"></div>' +
      '<label style="font-size:11px;color:var(--text);white-space:nowrap"><input type="checkbox" id="irrAltaOper"> Operativa</label></div>' +
      '<div style="margin-top:10px;display:flex;gap:8px"><button class="btn btn-sm" onclick="Irr.confirmarAlta()">Agregar a la caja</button><button class="btn btn-sm" style="background:transparent;border:1px solid var(--border);color:var(--text-muted)" onclick="Irr.cancelarAlta()">Cancelar</button></div></div>';
    const f = $('irrAltaFalla'); if (f) f.focus();
  }
  function renderCajaItems() {
    const el = $('irrCajaItems'); if (!el) return;
    const c = S.caja;
    if (!c) { el.innerHTML = ''; return; }
    const abierta = c.estado === 'abierta';
    if (!S.items.length) { el.innerHTML = '<div class="card" style="text-align:center;color:var(--text-muted);font-size:12px;padding:24px">Caja vacía. Escaneá la primera terminal.</div>'; return; }
    el.innerHTML = '<div class="card"><div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;align-items:center">' +
      '<button class="btn btn-sm" onclick="Irr.asentarSeleccion()" title="Agrega caja/pallet al Lote de las terminales tildadas, directo en Salesforce producción">📤 Asentar tildadas en SF</button>' +
      '<button class="btn btn-sm" style="background:transparent;border:1px solid var(--border);color:var(--text-muted)" onclick="Irr.selTodas(true)">Tildar todas</button>' +
      '<button class="btn btn-sm" style="background:transparent;border:1px solid var(--border);color:var(--text-muted)" onclick="Irr.selTodas(false)">Destildar</button></div>' +
      '<div style="overflow-x:auto"><table class="irr-tbl"><thead><tr><th></th><th>#</th><th>Serie</th><th>Falla (Logicalis)</th><th>Fecha reporte</th><th style="min-width:200px">Info del operador</th><th>Operativa</th><th>SF</th><th></th></tr></thead><tbody>' +
      S.items.map(function (i, n) {
        const sf = i.sf_sync_ok === true ? badge('✓ ' + fmtFecha(i.sf_sync_at), '#1dbf8e') : i.sf_sync_ok === false ? '<span title="' + esc(i.sf_sync_msg) + '">' + (/^Re-asentar/i.test(i.sf_sync_msg || '') ? badge('↻ re-asentar', '#f59e0b') : badge('⚠ error', '#ef4444')) + '</span>' : '<span style="color:var(--text-muted)">—</span>';
        return '<tr><td><input type="checkbox" ' + (S.sel[i.serie] ? 'checked' : '') + ' onchange="Irr.sel(\'' + esc(i.serie) + '\',this.checked)"></td><td style="color:var(--text-muted)">' + (n + 1) + '</td>' +
          '<td class="irr-mono">' + esc(i.serie) + '</td><td>' + esc(i.falla_logicalis || '—') + ' ' + (i.origen === 'manual' ? badge('manual', '#f59e0b') : '') + '</td>' +
          '<td style="white-space:nowrap">' + esc(L.fmtDia(i.fecha_reporte)) + '</td>' +
          '<td><input class="irr-in" value="' + esc(i.info_operador || '') + '" placeholder="ej. pantalla rayada" onchange="Irr.guardar(\'' + i.id + '\',\'info_operador\',this.value)"></td>' +
          '<td><input type="checkbox" ' + (i.operativa ? 'checked' : '') + ' onchange="Irr.guardar(\'' + i.id + '\',\'operativa\',this.checked)"></td><td>' + sf + '</td>' +
          '<td style="white-space:nowrap">' +
          (abierta && S.abiertas.length ? '<select class="irr-in" style="width:auto;margin-right:4px" title="Mover a otra caja abierta" onchange="Irr.mover(\'' + i.id + '\',this.value)"><option value="">Mover a…</option>' +
            S.abiertas.filter(function (x) { return x.cant < x.capacidad; }).map(function (x) { return '<option value="' + x.id + '">' + esc(x.codigo) + ' (' + x.cant + '/' + x.capacidad + ')</option>'; }).join('') + '</select>' : '') +
          (abierta ? '<button title="Sacar de la caja" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px" onclick="Irr.quitar(\'' + i.id + '\')">✕</button>' : '') +
          (esAdmin() && i.pallet_estado !== 'enviado' ? '<button title="Eliminar terminal (admin)" style="background:none;border:none;cursor:pointer;font-size:13px" onclick="Irr.eliminarItem(\'' + i.id + '\')">🗑</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  /* ── Tab Cajas ── */
  async function renderCajasTab() {
    $('irrBody').innerHTML = '<div class="card"><div style="font-size:12px;color:var(--text-muted)">⏳ Cargando…</div></div>';
    const cajas = await dbq(sb.from(V_CAJAS).select('*').order('created_at', { ascending: false }).limit(300));
    $('irrBody').innerHTML = '<div class="card"><div style="font-size:13px;font-weight:700;margin-bottom:8px">📦 Cajas (' + cajas.length + ')</div>' +
      (cajas.length ? '<div style="overflow-x:auto"><table class="irr-tbl"><thead><tr><th>Caja</th><th>Estado</th><th>Terminales</th><th>Pallet</th><th>Creada</th><th>Por</th><th></th></tr></thead><tbody>' +
        cajas.map(function (c) {
          return '<tr><td class="irr-mono"><b>' + esc(c.codigo) + '</b></td><td>' + badge(c.estado, c.estado === 'abierta' ? '#1dbf8e' : '#94a3b8') + '</td><td>' + c.cant + ' / ' + c.capacidad + '</td>' +
            '<td>' + (c.pallet_codigo ? badge(c.pallet_codigo, '#1a9fd4') : '—') + '</td><td>' + esc(fmtFecha(c.created_at)) + '</td><td>' + esc(c.created_by || '') + '</td>' +
            '<td style="white-space:nowrap"><button class="btn btn-sm" onclick="Irr.verCaja(\'' + c.id + '\')">Abrir</button> <button class="btn btn-sm" onclick="Irr.reimprimirCaja(\'' + c.id + '\')">🖨️</button>' +
              (esAdmin() && c.pallet_estado !== 'enviado' ? ' <button class="btn btn-sm" title="Eliminar caja (admin)" style="background:transparent;border:1px solid #ef4444;color:#ef4444" onclick="Irr.eliminarCaja(\'' + c.id + '\')">🗑</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div style="color:var(--text-muted);font-size:12px">Todavía no hay cajas.</div>') + '</div>';
  }
  async function verCaja(id) { await cargarCaja(id); await setTab('escaneo'); }

  /* ── Tab Pallets ── */
  async function renderPalletTab() {
    const pallets = await dbq(sb.from(V_PALLETS).select('*').order('created_at', { ascending: false }).limit(100));
    if (!S.pallet && pallets.length) { const ab = pallets.find(function (p) { return p.estado === 'abierto'; }); if (ab) await cargarPallet(ab.id); }
    else if (S.pallet) await cargarPallet(S.pallet.id);
    const sinPallet = await dbq(sb.from(V_CAJAS).select('id,codigo,cant').eq('estado', 'cerrada').is('pallet_id', null).order('codigo'));
    const p = S.pallet;
    let html = '<div class="card" style="margin-bottom:10px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn btn-sm" onclick="Irr.nuevoPallet()">➕ Nuevo pallet</button>' +
      '<select class="input" style="max-width:260px" onchange="Irr.elegirPallet(this.value)"><option value="">Elegir pallet…</option>' +
      pallets.map(function (x) { return '<option value="' + x.id + '"' + (p && p.id === x.id ? ' selected' : '') + '>' + esc(x.codigo) + ' · ' + x.cant_cajas + ' cajas · ' + esc(x.estado) + '</option>'; }).join('') + '</select>' +
      '<span style="font-size:11px;color:var(--text-muted)">' + sinPallet.length + ' caja(s) cerrada(s) sin pallet</span></div></div>';
    if (p) {
      const ab = p.estado === 'abierto';
      html += '<div class="card" style="margin-bottom:10px"><div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">' +
        '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Pallet</div><div class="irr-big" style="color:var(--teal)">' + esc(p.codigo) + '</div></div>' +
        '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Cajas</div><div class="irr-big">' + p.cant_cajas + '<span style="font-size:16px;color:var(--text-muted)"> / ~' + L.CAP_PALLET_CAJAS + '</span></div></div>' +
        '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Terminales</div><div class="irr-big">' + p.cant_terminales + '</div></div>' +
        '<div>' + badge(p.estado.toUpperCase(), ab ? '#1dbf8e' : p.estado === 'enviado' ? '#1a9fd4' : '#94a3b8') + (p.remito ? ' ' + badge('Remito ' + p.remito, '#94a3b8') : '') + '</div><div style="flex:1"></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        (ab ? '<button class="btn btn-sm" onclick="Irr.cerrarPallet()">✅ Cerrar e imprimir etiqueta</button>' : '<button class="btn btn-sm" onclick="Irr.reimprimirPallet(\'' + p.id + '\')">🖨️ Etiqueta</button>') +
        (p.estado === 'cerrado' ? '<button class="btn btn-sm" onclick="Irr.enviarPallet()">🚚 Marcar enviado a ' + esc(p.destino) + '</button><button class="btn btn-sm" onclick="Irr.reabrirPallet()">↩ Reabrir</button>' : '') +
        '<button class="btn btn-sm" onclick="Irr.exportar()">📊 Packing list (Excel)</button><button class="btn btn-sm" onclick="Irr.asentarPallet()">📤 Asentar pallet en SF</button>' +
        (esAdmin() && p.estado !== 'enviado' ? '<button class="btn btn-sm" style="background:transparent;border:1px solid #ef4444;color:#ef4444" onclick="Irr.eliminarPallet()">🗑 Eliminar pallet</button>' : '') + '</div></div></div>';
      if (ab) {
        html += '<div class="card" style="margin-bottom:10px"><input id="irrScanPallet" class="irr-scan" autocomplete="off" placeholder="Escaneá el rótulo de una caja (CJ-xxxx) para ponerla en ' + esc(p.codigo) + '" onkeydown="if(event.key===\'Enter\'){Irr.cajaAPallet(this.value);this.value=\'\'}">' +
          (sinPallet.length ? '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">Cerradas sin pallet: ' + sinPallet.map(function (c) { return '<a href="#" class="irr-mono" onclick="Irr.cajaAPallet(\'' + c.codigo + '\');return false" style="color:var(--teal)">' + esc(c.codigo) + ' (' + c.cant + ')</a>'; }).join(' · ') + '</div>' : '') + '</div>';
      }
      html += '<div id="irrSfMsg" style="font-size:11px;margin:6px 0"></div><div class="card"><table class="irr-tbl"><thead><tr><th>Caja</th><th>Terminales</th><th></th></tr></thead><tbody>' +
        (S.cajasPallet.length ? S.cajasPallet.map(function (c) {
          return '<tr><td class="irr-mono"><b>' + esc(c.codigo) + '</b></td><td>' + c.cant + '</td><td>' + (ab ? '<button style="background:none;border:none;color:#ef4444;cursor:pointer" onclick="Irr.sacarCaja(\'' + c.id + '\')">✕ sacar</button>' : '') + '</td></tr>';
        }).join('') : '<tr><td colspan="3" style="color:var(--text-muted)">Sin cajas todavía.</td></tr>') + '</tbody></table></div>';
    } else html += '<div class="card" style="color:var(--text-muted);font-size:12px">Abrí un pallet para empezar a sumar cajas.</div>';
    $('irrBody').innerHTML = html; focoScan();
  }

  /* ── Tab Consulta ── */
  async function renderConsultaTab() {
    const cnt = async function (q) { const r = await q; if (r.error) throw r.error; return r.count || 0; };
    let k = {};
    try {
      k.pend = await cnt(sb.from(V_TRAZ).select('id', { count: 'exact', head: true }).eq('estado_trazabilidad', 'pendiente'));
      k.caja = await cnt(sb.from(V_TRAZ).select('id', { count: 'exact', head: true }).eq('estado_trazabilidad', 'en_caja'));
      k.pal = await cnt(sb.from(V_TRAZ).select('id', { count: 'exact', head: true }).eq('estado_trazabilidad', 'en_pallet'));
      k.env = await cnt(sb.from(V_TRAZ).select('id', { count: 'exact', head: true }).eq('estado_trazabilidad', 'enviado_spp'));
    } catch (e) { throw new Error(e.message || 'Error leyendo contadores'); }
    const card = function (n, t, c) { return '<div class="card" style="text-align:center"><div class="irr-big" style="color:' + c + '">' + n + '</div><div style="font-size:10px;color:var(--text-muted);margin-top:4px;text-transform:uppercase">' + t + '</div></div>'; };
    $('irrBody').innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px">' +
      card(k.pend, 'Sin caja (en RTO/SF)', ESTADO_COLOR.pendiente) + card(k.caja, 'En caja', ESTADO_COLOR.en_caja) + card(k.pal, 'En pallet', ESTADO_COLOR.en_pallet) + card(k.env, 'Enviadas a SPP', ESTADO_COLOR.enviado_spp) + '</div>' +
      '<div class="card" style="margin-bottom:10px"><input id="irrBuscar" class="irr-scan" autocomplete="off" placeholder="Serie, caja (CJ-xxxx) o pallet (PL-xxxx)" onkeydown="if(event.key===\'Enter\')Irr.buscar(this.value)"></div><div id="irrRes"></div>';
    focoScan();
  }
  async function buscar(raw) {
    const t = L.tipoEscaneo(raw); const out = $('irrRes');
    if (!t) { out.innerHTML = '<div class="card" style="color:#ef4444">Código no reconocido.</div>'; return; }
    try {
      if (t.tipo === 'serie') {
        const r = await dbq(sb.from(V_TRAZ).select('*').eq('serie', t.serie).maybeSingle());
        if (!r) { out.innerHTML = '<div class="card" style="color:var(--text-muted)">' + esc(t.serie) + ' no está registrada como irreparable en el módulo.</div>'; return; }
        out.innerHTML = '<div class="card"><div class="irr-mono" style="font-size:15px;font-weight:700;margin-bottom:8px">' + esc(r.serie) + ' ' + badge(ESTADO_TXT[r.estado_trazabilidad], ESTADO_COLOR[r.estado_trazabilidad]) + '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;font-size:12px">' +
          fila('Falla (Logicalis)', r.falla_logicalis) + fila('Fecha del reporte', L.fmtDia(r.fecha_reporte)) + fila('Info del operador', r.info_operador) + fila('Operativa', r.operativa ? 'Sí' : 'No') +
          fila('Caja', r.caja) + fila('Pallet', r.pallet) + fila('Destino', r.destino) + fila('Remito', r.remito) + fila('RTO / Factura', r.rto_ref) +
          fila('Origen del alta', r.origen) + fila('Asentado en SF', r.sf_sync_ok ? fmtFecha(r.sf_sync_at) : (r.sf_sync_ok === false ? '⚠ ' + (r.sf_sync_msg || 'error') : 'No')) + fila('Lote en SF', r.sf_lote_grabado) + '</div></div>';
      } else if (t.tipo === 'caja') {
        const c = await dbq(sb.from(V_CAJAS).select('*').eq('codigo', t.codigo).maybeSingle());
        if (!c) { out.innerHTML = '<div class="card" style="color:var(--text-muted)">No existe ' + t.codigo + '.</div>'; return; }
        const items = await fetchAll(function (a, b) { return sb.from(V_TRAZ).select('*').eq('caja_id', c.id).order('serie').range(a, b); });
        out.innerHTML = '<div class="card"><div style="font-weight:700;margin-bottom:8px">' + esc(c.codigo) + ' · ' + c.cant + ' terminales · ' + badge(c.estado, '#94a3b8') + (c.pallet_codigo ? ' ' + badge(c.pallet_codigo, '#1a9fd4') : '') + '</div>' + tablaItems(items) + '</div>';
      } else {
        const p = await dbq(sb.from(V_PALLETS).select('*').eq('codigo', t.codigo).maybeSingle());
        if (!p) { out.innerHTML = '<div class="card" style="color:var(--text-muted)">No existe ' + t.codigo + '.</div>'; return; }
        const cajas = await dbq(sb.from(V_CAJAS).select('*').eq('pallet_id', p.id).order('codigo'));
        out.innerHTML = '<div class="card"><div style="font-weight:700;margin-bottom:8px">' + esc(p.codigo) + ' · ' + p.cant_cajas + ' cajas · ' + p.cant_terminales + ' terminales · ' + badge(p.estado, '#94a3b8') + '</div>' +
          cajas.map(function (c) { return '<span class="irr-mono" style="margin-right:10px">' + esc(c.codigo) + ' (' + c.cant + ')</span>'; }).join('') + '</div>';
      }
    } catch (e) { errorGeneral(e); }
  }
  function fila(k, v) { return '<div><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">' + esc(k) + '</div><div style="font-weight:700">' + esc(v == null || v === '' ? '—' : v) + '</div></div>'; }
  function tablaItems(items) {
    return '<div style="overflow-x:auto"><table class="irr-tbl"><thead><tr><th>Serie</th><th>Falla</th><th>Fecha reporte</th><th>Info operador</th><th>SF</th></tr></thead><tbody>' +
      items.map(function (i) { return '<tr><td class="irr-mono">' + esc(i.serie) + '</td><td>' + esc(i.falla_logicalis || '—') + '</td><td>' + esc(L.fmtDia(i.fecha_reporte)) + '</td><td>' + esc(i.info_operador || '') + '</td><td>' + (i.sf_sync_ok ? '✓' : '—') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }

  /* ═════════ Init ═════════ */
  async function init() {
    if (!skeleton()) return;
    S.ready = true;
    try {
      const id = S.caja ? S.caja.id : leerActiva();
      if (id) { try { await cargarCaja(id); } catch (e) { if (falloTabla(e)) throw e; S.caja = null; } }
      await setTab(S.tab || 'escaneo');
    } catch (e) { errorGeneral(e); }
  }

  window.Irr = {
    init: init, tab: setTab, scan: scan, nuevaCaja: nuevaCaja, elegirCaja: elegirCaja, cerrarCaja: cerrarCaja, reabrirCaja: reabrirCaja,
    editarCaja: editarCaja, mover: moverItem, eliminarCaja: eliminarCaja, eliminarItem: eliminarItem, eliminarPallet: eliminarPallet,
    quitar: quitarItem, guardar: guardarInfo, confirmarAlta: confirmarAlta, cancelarAlta: cancelarAlta,
    sel: function (s, v) { S.sel[s] = v; }, selTodas: selTodas, asentarSeleccion: asentarSeleccion,
    reimprimirCaja: reimprimirCaja, reimprimirPallet: reimprimirPallet, verCaja: verCaja,
    nuevoPallet: nuevoPallet, elegirPallet: elegirPallet, cajaAPallet: agregarCajaAPallet, sacarCaja: quitarCajaDePallet,
    cerrarPallet: cerrarPallet, reabrirPallet: reabrirPallet, enviarPallet: enviarPallet, asentarPallet: asentarPallet,
    exportar: function () { exportarPacking(); }, buscar: buscar,
    comp: compSet, compTodas: compTodas, compAplicar: compAplicar, compCancelar: compCancelar,
    _logic: L,
  };
})();
