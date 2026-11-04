/*
 * insumos.js — Módulo INSUMOS (alta 04/11/2026)
 *
 *  - ABM de insumos (código INS-0001, categoría, unidad, ubicación, proveedor) con stock
 *    CRÍTICO / MÍNIMO / MÁXIMO cargado en el propio alta.
 *  - Rótulo 100x150 mm para la SATO (código de barras Code128 + QR al portal).
 *  - Movimientos (entrada / salida / ajuste) con lector de barras. El stock es la suma de los movimientos.
 *  - Avisos de compra: lo que está en mínimo o crítico, con cantidad sugerida hasta el máximo (Excel / texto).
 *  - Consumo mensual: salidas por mes, promedio y meses de cobertura.
 *
 * Datos: Supabase (insumos_items / insumos_movimientos, vistas v_insumos_*), ver doc/setup_insumos.sql.
 * Globales del portal que usa: sb (supabase), currentProfile, XLSX.
 */
(function () {
  'use strict';

  /* ═════════════════ Lógica pura (testeable en node) ═════════════════ */
  const L = {};
  L.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  L.num = function (v) {                       // acepta "1.5" y "1,5"; devuelve NaN si no es número
    if (typeof v === 'number') return v;
    const s = String(v == null ? '' : v).trim().replace(',', '.');
    return s === '' ? NaN : Number(s);
  };
  L.fmt = function (n) {
    const x = Number(n) || 0;
    return x.toLocaleString('es-AR', { maximumFractionDigits: 2 });
  };
  L.pad4 = function (n) { return String(n).padStart(4, '0'); };
  // Código escaneado: "INS-0001", "INS0001" o el link del QR (...?ins=INS-0001). Si no, devuelve null.
  L.parseCodigo = function (raw) {
    const s = String(raw == null ? '' : raw).trim();
    const m = s.match(/INS\D{0,3}(\d{1,6})\s*$/i);
    return m ? 'INS-' + L.pad4(parseInt(m[1], 10)) : null;
  };
  // Validación de umbrales: crítico <= mínimo <= máximo
  L.validarUmbrales = function (crit, min, max) {
    if ([crit, min, max].some(function (x) { return isNaN(x) || x < 0; })) return 'Stock crítico, mínimo y máximo deben ser números mayores o iguales a 0.';
    if (min < crit) return 'El stock mínimo no puede ser menor que el crítico.';
    if (max < min) return 'El stock máximo no puede ser menor que el mínimo.';
    return '';
  };
  L.nivel = function (stock, i) {
    if (stock <= i.stock_critico) return 'critico';
    if (stock <= i.stock_min) return 'minimo';
    if (i.stock_max > 0 && stock > i.stock_max) return 'exceso';
    return 'ok';
  };
  L.NIVEL = {
    critico: { t: 'CRÍTICO', c: '#ef4444', o: 0 }, minimo: { t: 'REPONER', c: '#f59e0b', o: 1 },
    ok: { t: 'OK', c: '#1dbf8e', o: 2 }, exceso: { t: 'EXCESO', c: '#60a5fa', o: 3 },
  };
  // Promedio mensual de consumo sobre los meses indicados (incluye meses en cero)
  L.promedio = function (porMes, meses) {
    if (!meses.length) return 0;
    return meses.reduce(function (a, m) { return a + (porMes[m] || 0); }, 0) / meses.length;
  };
  L.cobertura = function (stock, prom) { return prom > 0 ? stock / prom : null; };
  // Últimos n meses (YYYY-MM) terminando en `hoy`, del más viejo al más nuevo
  L.ultimosMeses = function (n, hoy) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), 1), out = [];
    for (let k = 0; k < n; k++) {
      out.unshift(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
      d.setMonth(d.getMonth() - 1);
    }
    return out;
  };
  L.mesLabel = function (ym) {
    const N = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const p = ym.split('-'); return N[Number(p[1]) - 1] + ' ' + p[0].slice(2);
  };
  L.textoCompra = function (items, fecha) {
    const lin = items.map(function (i) {
      return '• ' + i.nombre + ' (' + i.codigo + '): stock ' + L.fmt(i.stock_actual) + ' ' + i.unidad +
        ' → pedir ' + L.fmt(i.a_comprar) + (i.proveedor ? ' · ' + i.proveedor : '') + (i.nivel === 'critico' ? ' ⚠️ CRÍTICO' : '');
    });
    return 'Aviso de compra de insumos — ' + fecha + '\n' + lin.join('\n');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  if (typeof window === 'undefined') return;

  /* ═════════════════ Módulo (browser) ═════════════════ */
  const T_ITEMS = 'insumos_items', T_MOV = 'insumos_movimientos', V_STOCK = 'v_insumos_stock', V_CONSUMO = 'v_insumos_consumo_mensual';
  const esc = L.esc;
  const S = { ready: false, tab: 'stock', items: [], q: '', fNivel: '', fCat: '', sel: {}, consumo: null };

  function $(id) { return document.getElementById(id); }
  function esAdmin() { try { return typeof currentProfile !== 'undefined' && !!currentProfile && currentProfile.rol === 'admin'; } catch (e) { return false; } }
  function quien() {
    try { if (typeof currentProfile !== 'undefined' && currentProfile) return currentProfile.nombre || currentProfile.email || 'portal'; } catch (e) { /* noop */ }
    return 'portal';
  }
  async function dbq(p) {
    const r = await p;
    if (r.error) { const e = new Error(r.error.message || String(r.error)); e.code = r.error.code; throw e; }
    return r.data;
  }
  function toast(msg) { if (typeof showToastPortal === 'function') return showToastPortal(msg); alert(msg); }
  function fmtFecha(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso; }
  }
  function falloTabla(e) { return /does not exist|schema cache|Could not find/i.test((e && e.message) || ''); }
  function errorGeneral(e) {
    console.error('[Insumos]', e);
    const c = $('insBody');
    const msg = falloTabla(e)
      ? 'Faltan las tablas de Insumos en Supabase. Ejecutá <b>doc/setup_insumos.sql</b> en el SQL Editor y recargá.'
      : esc(e.message || e);
    if (c) c.innerHTML = '<div style="padding:20px;color:#ef4444">' + msg + '</div>'; else toast(e.message || String(e));
  }

  /* ── datos ── */
  async function cargarItems() {
    S.items = (await dbq(sb.from(V_STOCK).select('*').order('nombre'))) || [];
    S.items.forEach(function (i) { i.stock_actual = Number(i.stock_actual) || 0; i.a_comprar = Number(i.a_comprar) || 0; });
  }
  function porCodigo(cod) { return S.items.find(function (i) { return i.codigo === cod; }); }

  /* ── estilos ── */
  const ST = {
    card: 'background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px 16px',
    inp: 'background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:8px 10px;font-size:13px;font-family:inherit',
    th: 'text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);border-bottom:1px solid var(--border);white-space:nowrap',
    td: 'padding:8px 10px;border-bottom:1px solid var(--border);font-size:13px',
    mini: 'background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:4px 8px;font-size:12px;cursor:pointer',
  };
  function badge(nivel) { const n = L.NIVEL[nivel]; return '<span style="background:' + n.c + '22;color:' + n.c + ';border:1px solid ' + n.c + '66;border-radius:999px;padding:2px 9px;font-size:10px;font-weight:700">' + n.t + '</span>'; }

  /* ── esqueleto + tabs ── */
  function skeleton() {
    const m = $('mod-insumos'); if (!m) return false;
    if ($('insBody')) return true;
    m.innerHTML = '<div style="padding:20px 24px">' +
      '<div style="font-size:20px;font-weight:800">📦 Insumos</div>' +
      '<div style="font-size:12px;color:var(--text-muted);margin:2px 0 14px">ABM con stock crítico / mínimo / máximo · rótulos · movimientos · avisos de compra · consumo mensual</div>' +
      '<div id="insTabs" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px"></div><div id="insBody"></div></div>';
    return true;
  }
  const TABS = [['stock', '📋 Stock'], ['mov', '🔁 Movimientos'], ['compras', '🛒 Compras'], ['consumo', '📈 Consumo']];
  function renderTabs() {
    $('insTabs').innerHTML = TABS.map(function (t) {
      const on = S.tab === t[0];
      return '<button onclick="Ins.tab(\'' + t[0] + '\')" style="' + ST.inp + ';cursor:pointer;font-weight:700;' + (on ? 'border-color:var(--teal);color:var(--teal);background:rgba(29,191,142,.1)' : '') + '">' + t[1] + '</button>';
    }).join('');
  }
  async function setTab(t) {
    S.tab = t; renderTabs();
    try {
      if (t === 'stock') renderStock();
      else if (t === 'mov') await renderMov();
      else if (t === 'compras') renderCompras();
      else if (t === 'consumo') await renderConsumo();
    } catch (e) { errorGeneral(e); }
  }
  async function init() {
    if (!skeleton()) return;
    try { await cargarItems(); S.ready = true; await setTab(S.tab); } catch (e) { renderTabs(); errorGeneral(e); }
  }

  /* ═════════ Tab Stock ═════════ */
  function filtrados() {
    const q = S.q.toLowerCase();
    return S.items.filter(function (i) {
      if (!i.activo && S.fNivel !== 'inactivo') return false;
      if (S.fNivel === 'inactivo') return !i.activo;
      if (S.fNivel && i.nivel !== S.fNivel) return false;
      if (S.fCat && (i.categoria || '') !== S.fCat) return false;
      if (!q) return true;
      return [i.codigo, i.nombre, i.categoria, i.ubicacion, i.proveedor].join(' ').toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) { return L.NIVEL[a.nivel].o - L.NIVEL[b.nivel].o || a.nombre.localeCompare(b.nombre); });
  }
  function kpi(t, v, c, nivel) {
    return '<div onclick="Ins.filtroNivel(\'' + (nivel || '') + '\')" style="' + ST.card + ';cursor:pointer;min-width:120px"><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">' + t + '</div><div style="font-size:24px;font-weight:800;color:' + c + '">' + v + '</div></div>';
  }
  function renderStock() {
    const act = S.items.filter(function (i) { return i.activo; });
    const n = function (x) { return act.filter(function (i) { return i.nivel === x; }).length; };
    const cats = Array.from(new Set(S.items.map(function (i) { return i.categoria || ''; }).filter(Boolean))).sort();
    const lista = filtrados();
    const sel = Object.keys(S.sel).filter(function (k) { return S.sel[k]; }).length;
    $('insBody').innerHTML =
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">' +
      kpi('Insumos activos', act.length, 'var(--text)', '') + kpi('Críticos', n('critico'), '#ef4444', 'critico') +
      kpi('A reponer', n('minimo'), '#f59e0b', 'minimo') + kpi('OK', n('ok'), '#1dbf8e', 'ok') + kpi('Exceso', n('exceso'), '#60a5fa', 'exceso') + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">' +
      '<input id="insQ" placeholder="Buscar código, nombre, ubicación…" value="' + esc(S.q) + '" oninput="Ins.buscar(this.value)" style="' + ST.inp + ';min-width:260px">' +
      '<select onchange="Ins.filtroCat(this.value)" style="' + ST.inp + '"><option value="">Todas las categorías</option>' + cats.map(function (c) { return '<option' + (S.fCat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<select onchange="Ins.filtroNivel(this.value)" style="' + ST.inp + '"><option value="">Todos los niveles</option>' +
      ['critico', 'minimo', 'ok', 'exceso', 'inactivo'].map(function (k) { return '<option value="' + k + '"' + (S.fNivel === k ? ' selected' : '') + '>' + (k === 'inactivo' ? 'Inactivos' : L.NIVEL[k].t) + '</option>'; }).join('') + '</select>' +
      '<span style="flex:1"></span>' +
      '<button class="btn btn-sm" onclick="Ins.rotularSel()" ' + (sel ? '' : 'disabled style="opacity:.5"') + '>🏷️ Rótulos (' + sel + ')</button>' +
      '<button class="btn btn-sm" style="background:var(--grad);color:#fff" onclick="Ins.editar()">+ Nuevo insumo</button></div>' +
      '<div style="' + ST.card + ';padding:0;overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr>' +
      '<th style="' + ST.th + '"><input type="checkbox" onchange="Ins.selTodos(this.checked)"></th>' +
      ['Código', 'Insumo', 'Categoría', 'Ubicación', 'Stock', 'Crít.', 'Mín.', 'Máx.', 'Nivel', ''].map(function (h) { return '<th style="' + ST.th + '">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (lista.map(function (i) {
        const c = L.NIVEL[i.nivel].c;
        return '<tr' + (i.activo ? '' : ' style="opacity:.5"') + '><td style="' + ST.td + '"><input type="checkbox" ' + (S.sel[i.id] ? 'checked' : '') + ' onchange="Ins.sel(\'' + i.id + '\',this.checked)"></td>' +
          '<td style="' + ST.td + ';font-family:\'JetBrains Mono\',monospace;font-weight:700">' + esc(i.codigo) + '</td>' +
          '<td style="' + ST.td + ';font-weight:600">' + esc(i.nombre) + (i.proveedor ? '<div style="font-size:10px;color:var(--text-muted)">' + esc(i.proveedor) + '</div>' : '') + '</td>' +
          '<td style="' + ST.td + '">' + esc(i.categoria || '—') + '</td><td style="' + ST.td + '">' + esc(i.ubicacion || '—') + '</td>' +
          '<td style="' + ST.td + ';font-weight:800;color:' + c + '">' + L.fmt(i.stock_actual) + ' <span style="font-weight:400;font-size:11px;color:var(--text-muted)">' + esc(i.unidad) + '</span></td>' +
          '<td style="' + ST.td + '">' + L.fmt(i.stock_critico) + '</td><td style="' + ST.td + '">' + L.fmt(i.stock_min) + '</td><td style="' + ST.td + '">' + L.fmt(i.stock_max) + '</td>' +
          '<td style="' + ST.td + '">' + badge(i.nivel) + '</td>' +
          '<td style="' + ST.td + ';white-space:nowrap"><button style="' + ST.mini + '" title="Registrar movimiento" onclick="Ins.irMov(\'' + i.codigo + '\')">±</button> ' +
          '<button style="' + ST.mini + '" title="Editar" onclick="Ins.editar(\'' + i.id + '\')">✏️</button> ' +
          '<button style="' + ST.mini + '" title="Rótulo" onclick="Ins.rotular([\'' + i.id + '\'])">🏷️</button></td></tr>';
      }).join('') || '<tr><td colspan="11" style="' + ST.td + ';text-align:center;color:var(--text-muted);padding:24px">Sin insumos. Creá el primero con “+ Nuevo insumo”.</td></tr>') +
      '</tbody></table></div>';
  }
  function buscar(v) { S.q = v; renderStock(); const el = $('insQ'); if (el) { el.focus(); el.setSelectionRange(v.length, v.length); } }
  function filtroNivel(v) { S.fNivel = v; if (S.tab !== 'stock') return setTab('stock'); renderStock(); }
  function filtroCat(v) { S.fCat = v; renderStock(); }
  function selUno(id, v) { S.sel[id] = v; renderStock(); }
  function selTodos(v) { filtrados().forEach(function (i) { S.sel[i.id] = v; }); renderStock(); }

  /* ═════════ ABM (modal) ═════════ */
  function cerrarModal() { const m = $('insModal'); if (m) m.remove(); }
  function editar(id) {
    const i = id ? S.items.find(function (x) { return x.id === id; }) : null;
    const cats = Array.from(new Set(S.items.map(function (x) { return x.categoria || ''; }).filter(Boolean))).sort();
    const f = function (lbl, inner, ex) { return '<label style="display:block;' + (ex || '') + '"><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">' + lbl + '</div>' + inner + '</label>'; };
    const inp = function (k, v, t, ph) { return '<input id="insF_' + k + '" type="' + (t || 'text') + '" value="' + esc(v == null ? '' : v) + '" placeholder="' + esc(ph || '') + '" style="' + ST.inp + ';width:100%">'; };
    cerrarModal();
    const d = document.createElement('div');
    d.id = 'insModal';
    d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    d.innerHTML = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px;width:560px;max-width:100%;max-height:92vh;overflow:auto">' +
      '<div style="font-size:16px;font-weight:800;margin-bottom:14px">' + (i ? '✏️ Editar ' + esc(i.codigo) : '➕ Nuevo insumo') + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      f('Nombre *', inp('nombre', i && i.nombre, 'text', 'Ej. Rollo térmico 57mm'), 'grid-column:1/3') +
      f('Categoría', inp('categoria', i && i.categoria, 'text', 'Ej. Papelería') + '<datalist id="insCats">' + cats.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>') +
      f('Unidad', inp('unidad', i ? i.unidad : 'un', 'text', 'un, caja, rollo…')) +
      f('Ubicación', inp('ubicacion', i && i.ubicacion, 'text', 'Ej. Barracas · Estante B2')) +
      f('Proveedor', inp('proveedor', i && i.proveedor)) +
      '<div style="grid-column:1/3;font-size:11px;font-weight:700;color:var(--teal);margin-top:4px">NIVELES DE STOCK (crítico ≤ mínimo ≤ máximo)</div>' +
      f('Stock crítico', inp('crit', i ? i.stock_critico : 0, 'number')) + f('Stock mínimo (avisa compra)', inp('min', i ? i.stock_min : 0, 'number')) +
      f('Stock máximo (objetivo)', inp('max', i ? i.stock_max : 0, 'number')) +
      (i ? f('Estado', '<select id="insF_activo" style="' + ST.inp + ';width:100%"><option value="1"' + (i.activo ? ' selected' : '') + '>Activo</option><option value="0"' + (i.activo ? '' : ' selected') + '>Inactivo</option></select>')
        : f('Stock inicial', inp('inicial', 0, 'number'))) +
      f('Notas', '<textarea id="insF_notas" rows="2" style="' + ST.inp + ';width:100%">' + esc(i && i.notas || '') + '</textarea>', 'grid-column:1/3') +
      '</div><div id="insFErr" style="color:#ef4444;font-size:12px;margin-top:10px;min-height:16px"></div>' +
      '<div style="display:flex;gap:8px;justify-content:space-between;margin-top:8px"><div>' +
      (i && esAdmin() ? '<button class="btn btn-sm" style="color:#ef4444;border:1px solid #ef444466" onclick="Ins.eliminar(\'' + i.id + '\')">🗑️ Eliminar</button>' : '') + '</div><div style="display:flex;gap:8px">' +
      '<button class="btn btn-sm" onclick="Ins.cerrarModal()">Cancelar</button>' +
      '<button class="btn btn-sm" style="background:var(--grad);color:#fff" onclick="Ins.guardar(' + (i ? '\'' + i.id + '\'' : '') + ')">Guardar</button></div></div></div>';
    document.body.appendChild(d);
    const nom = $('insF_nombre'); if (nom) nom.focus();
    const cat = $('insF_categoria'); if (cat) cat.setAttribute('list', 'insCats');
  }
  async function guardar(id) {
    const v = function (k) { const e = $('insF_' + k); return e ? e.value : ''; };
    const err = function (m) { $('insFErr').textContent = m; };
    const nombre = v('nombre').trim();
    if (!nombre) return err('Falta el nombre.');
    const crit = L.num(v('crit')), min = L.num(v('min')), max = L.num(v('max'));
    const eu = L.validarUmbrales(crit, min, max); if (eu) return err(eu);
    const unidad = v('unidad').trim() || 'un';
    const dup = S.items.find(function (x) { return x.id !== id && x.nombre.trim().toLowerCase() === nombre.toLowerCase(); });
    if (dup && !confirm('Ya existe "' + dup.nombre + '" (' + dup.codigo + '). ¿Crear igual?')) return;
    const row = { nombre: nombre, categoria: v('categoria').trim() || null, unidad: unidad, ubicacion: v('ubicacion').trim() || null,
      proveedor: v('proveedor').trim() || null, stock_critico: crit, stock_min: min, stock_max: max, notas: v('notas').trim() || null };
    try {
      if (id) {
        row.activo = v('activo') !== '0';
        await dbq(sb.from(T_ITEMS).update(row).eq('id', id));
        toast('Insumo actualizado');
      } else {
        const ini = L.num(v('inicial') || 0);
        if (isNaN(ini) || ini < 0) return err('El stock inicial debe ser un número ≥ 0.');
        row.created_by = quien();
        const nuevo = await dbq(sb.from(T_ITEMS).insert(row).select('id,codigo').single());
        if (ini > 0) await dbq(sb.from(T_MOV).insert({ insumo_id: nuevo.id, tipo: 'ajuste', delta: ini, motivo: 'Stock inicial', created_by: quien() }));
        toast('Insumo creado: ' + nuevo.codigo);
        S.sel[nuevo.id] = true;   // queda tildado para rotularlo enseguida
      }
      cerrarModal(); await cargarItems(); await setTab(S.tab);
    } catch (e) { err(e.message || String(e)); }
  }
  async function eliminar(id) {
    const i = S.items.find(function (x) { return x.id === id; }); if (!i) return;
    if (!confirm('¿Eliminar ' + i.codigo + ' · ' + i.nombre + ' y TODO su historial de movimientos?\nSi solo querés dejar de usarlo, marcalo como Inactivo.')) return;
    try {
      const del = await dbq(sb.from(T_ITEMS).delete().eq('id', id).select('id'));
      if (!del || !del.length) throw new Error('No se pudo eliminar (solo administradores).');
      cerrarModal(); toast('Insumo eliminado'); await cargarItems(); await setTab(S.tab);
    } catch (e) { toast(e.message || String(e)); }
  }

  /* ═════════ Tab Movimientos ═════════ */
  let _movPre = '';
  function irMov(cod) { _movPre = cod; setTab('mov'); }
  async function renderMov() {
    const hist = (await dbq(sb.from(T_MOV).select('*').order('created_at', { ascending: false }).limit(100))) || [];
    const porId = {}; S.items.forEach(function (i) { porId[i.id] = i; });
    $('insBody').innerHTML =
      '<div style="' + ST.card + ';margin-bottom:14px"><div style="font-size:13px;font-weight:700;margin-bottom:10px">Registrar movimiento</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">' +
      '<label><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px">Insumo (escaneá el código o escribilo)</div>' +
      '<input id="insMovCod" list="insMovList" placeholder="INS-0001" autocomplete="off" onkeydown="if(event.key===\'Enter\'){event.preventDefault();Ins.movElegir()}" onchange="Ins.movElegir()" style="' + ST.inp + ';min-width:280px">' +
      '<datalist id="insMovList">' + S.items.filter(function (i) { return i.activo; }).map(function (i) { return '<option value="' + esc(i.codigo) + '">' + esc(i.nombre) + '</option>'; }).join('') + '</datalist></label>' +
      '<label><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px">Tipo</div><select id="insMovTipo" style="' + ST.inp + '">' +
      '<option value="salida">➖ Salida (consumo)</option><option value="entrada">➕ Entrada (compra / ingreso)</option><option value="ajuste+">⚖️ Ajuste +</option><option value="ajuste-">⚖️ Ajuste −</option></select></label>' +
      '<label><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px">Cantidad</div><input id="insMovCant" type="number" min="0" step="any" value="1" onkeydown="if(event.key===\'Enter\'){event.preventDefault();Ins.movGuardar()}" style="' + ST.inp + ';width:100px"></label>' +
      '<label style="flex:1;min-width:180px"><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:3px">Motivo / destino (opcional)</div><input id="insMovMotivo" style="' + ST.inp + ';width:100%" placeholder="Ej. Oficina, Remito 123…"></label>' +
      '<button class="btn btn-sm" style="background:var(--grad);color:#fff;padding:9px 16px" onclick="Ins.movGuardar()">Registrar</button></div>' +
      '<div id="insMovInfo" style="margin-top:10px;font-size:12px;color:var(--text-muted);min-height:18px"></div></div>' +
      '<div style="' + ST.card + ';padding:0;overflow-x:auto"><div style="padding:12px 16px;font-weight:700;font-size:13px">Últimos movimientos</div><table style="width:100%;border-collapse:collapse"><thead><tr>' +
      ['Fecha', 'Insumo', 'Tipo', 'Cantidad', 'Motivo', 'Usuario', ''].map(function (h) { return '<th style="' + ST.th + '">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (hist.map(function (m) {
        const i = porId[m.insumo_id], d = Number(m.delta), c = d > 0 ? '#1dbf8e' : '#ef4444';
        return '<tr><td style="' + ST.td + '">' + fmtFecha(m.created_at) + '</td><td style="' + ST.td + '">' + (i ? esc(i.codigo + ' · ' + i.nombre) : '—') + '</td>' +
          '<td style="' + ST.td + '">' + esc(m.tipo) + '</td><td style="' + ST.td + ';font-weight:800;color:' + c + '">' + (d > 0 ? '+' : '') + L.fmt(d) + ' ' + esc(i ? i.unidad : '') + '</td>' +
          '<td style="' + ST.td + '">' + esc(m.motivo || '') + '</td><td style="' + ST.td + '">' + esc(m.created_by || '') + '</td>' +
          '<td style="' + ST.td + '">' + (esAdmin() ? '<button style="' + ST.mini + '" title="Borrar movimiento (solo admin)" onclick="Ins.borrarMov(\'' + m.id + '\')">🗑️</button>' : '') + '</td></tr>';
      }).join('') || '<tr><td colspan="7" style="' + ST.td + ';text-align:center;color:var(--text-muted);padding:20px">Todavía no hay movimientos.</td></tr>') + '</tbody></table></div>';
    const cod = $('insMovCod'); if (cod) { if (_movPre) { cod.value = _movPre; _movPre = ''; movElegir(); $('insMovCant').focus(); } else cod.focus(); }
  }
  function movResolver() {
    const raw = ($('insMovCod').value || '').trim();
    if (!raw) return null;
    const cod = L.parseCodigo(raw);
    if (cod) return porCodigo(cod) || null;
    const q = raw.toLowerCase();
    const c = S.items.filter(function (i) { return i.activo && i.nombre.toLowerCase().indexOf(q) !== -1; });
    return c.length === 1 ? c[0] : null;
  }
  function movElegir() {
    const i = movResolver(), el = $('insMovInfo'); if (!el) return;
    if (!i) { el.innerHTML = $('insMovCod').value.trim() ? '<span style="color:#ef4444">No se encontró ese insumo.</span>' : ''; return; }
    el.innerHTML = '<b style="color:var(--text)">' + esc(i.nombre) + '</b> · stock actual <b style="color:' + L.NIVEL[i.nivel].c + '">' + L.fmt(i.stock_actual) + ' ' + esc(i.unidad) + '</b> · ' + badge(i.nivel) +
      ' · crít ' + L.fmt(i.stock_critico) + ' / mín ' + L.fmt(i.stock_min) + ' / máx ' + L.fmt(i.stock_max);
    $('insMovCant').focus(); $('insMovCant').select();
  }
  async function movGuardar() {
    const i = movResolver(); if (!i) return toast('Elegí un insumo válido (escaneá el código o escribilo).');
    const cant = L.num($('insMovCant').value);
    if (isNaN(cant) || cant <= 0) return toast('La cantidad debe ser mayor a 0.');
    const t = $('insMovTipo').value;
    const tipo = t.indexOf('ajuste') === 0 ? 'ajuste' : t, delta = (t === 'salida' || t === 'ajuste-') ? -cant : cant;
    if (delta < 0 && i.stock_actual + delta < 0 && !confirm('El stock quedaría negativo (' + L.fmt(i.stock_actual + delta) + '). ¿Registrar igual?')) return;
    try {
      await dbq(sb.from(T_MOV).insert({ insumo_id: i.id, tipo: tipo, delta: delta, motivo: $('insMovMotivo').value.trim() || null, created_by: quien() }));
      await cargarItems();
      const n = porCodigo(i.codigo);
      toast((delta > 0 ? '+' : '') + L.fmt(delta) + ' ' + i.unidad + ' · ' + i.nombre + ' → stock ' + L.fmt(n.stock_actual) +
        (n.nivel === 'critico' ? ' ⚠️ CRÍTICO' : n.nivel === 'minimo' ? ' · llegó al mínimo, reponer' : ''));
      await renderMov();
    } catch (e) { toast(e.message || String(e)); }
  }
  async function borrarMov(id) {
    if (!confirm('¿Borrar este movimiento? El stock se recalcula. (Para corregir sin perder historial, usá un ajuste.)')) return;
    try {
      const del = await dbq(sb.from(T_MOV).delete().eq('id', id).select('id'));
      if (!del || !del.length) throw new Error('No se pudo borrar (solo administradores).');
      await cargarItems(); await renderMov();
    } catch (e) { toast(e.message || String(e)); }
  }

  /* ═════════ Tab Compras ═════════ */
  function aComprar() {
    return S.items.filter(function (i) { return i.activo && (i.nivel === 'critico' || i.nivel === 'minimo'); })
      .sort(function (a, b) { return L.NIVEL[a.nivel].o - L.NIVEL[b.nivel].o || a.nombre.localeCompare(b.nombre); });
  }
  function renderCompras() {
    const l = aComprar();
    $('insBody').innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px"><div style="font-size:13px;color:var(--text-muted)">Insumos en nivel mínimo o crítico. Cantidad sugerida = stock máximo − stock actual.</div><span style="flex:1"></span>' +
      '<button class="btn btn-sm" onclick="Ins.copiarCompra()" ' + (l.length ? '' : 'disabled') + '>📋 Copiar texto</button>' +
      '<button class="btn btn-sm" style="background:#0e6b39;color:#fff" onclick="Ins.excelCompra()" ' + (l.length ? '' : 'disabled') + '>📊 Excel</button></div>' +
      '<div style="' + ST.card + ';padding:0;overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr>' +
      ['Nivel', 'Código', 'Insumo', 'Proveedor', 'Stock', 'Mín.', 'Máx.', 'Pedir'].map(function (h) { return '<th style="' + ST.th + '">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (l.map(function (i) {
        return '<tr><td style="' + ST.td + '">' + badge(i.nivel) + '</td><td style="' + ST.td + ';font-family:\'JetBrains Mono\',monospace">' + esc(i.codigo) + '</td><td style="' + ST.td + ';font-weight:600">' + esc(i.nombre) + '</td>' +
          '<td style="' + ST.td + '">' + esc(i.proveedor || '—') + '</td><td style="' + ST.td + ';font-weight:800;color:' + L.NIVEL[i.nivel].c + '">' + L.fmt(i.stock_actual) + ' ' + esc(i.unidad) + '</td>' +
          '<td style="' + ST.td + '">' + L.fmt(i.stock_min) + '</td><td style="' + ST.td + '">' + L.fmt(i.stock_max) + '</td>' +
          '<td style="' + ST.td + ';font-weight:800">' + (i.a_comprar > 0 ? L.fmt(i.a_comprar) + ' ' + esc(i.unidad) : '<span style="color:var(--text-muted);font-weight:400" title="Sin stock máximo cargado">definir máx.</span>') + '</td></tr>';
      }).join('') || '<tr><td colspan="8" style="' + ST.td + ';text-align:center;color:var(--text-muted);padding:24px">✅ Nada para comprar: todos los insumos están por encima del mínimo.</td></tr>') + '</tbody></table></div>';
  }
  function copiarCompra() {
    const txt = L.textoCompra(aComprar(), new Date().toLocaleDateString('es-AR'));
    const ok = function () { toast('Aviso de compra copiado'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, function () { prompt('Copiá el texto:', txt); });
    else prompt('Copiá el texto:', txt);
  }
  function excelCompra() {
    if (typeof XLSX === 'undefined') return toast('La librería Excel no cargó.');
    const rows = aComprar().map(function (i) {
      return { 'Nivel': L.NIVEL[i.nivel].t, 'Código': i.codigo, 'Insumo': i.nombre, 'Categoría': i.categoria || '', 'Proveedor': i.proveedor || '',
        'Unidad': i.unidad, 'Stock actual': i.stock_actual, 'Mínimo': i.stock_min, 'Máximo': i.stock_max, 'Cantidad a pedir': i.a_comprar };
    });
    const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [10, 10, 34, 16, 20, 8, 12, 9, 9, 16].map(function (w) { return { wch: w }; });
    XLSX.utils.book_append_sheet(wb, ws, 'Compra');
    XLSX.writeFile(wb, 'AvisoCompra_Insumos_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

  /* ═════════ Tab Consumo ═════════ */
  async function renderConsumo() {
    const meses = L.ultimosMeses(6, new Date());
    const data = (await dbq(sb.from(V_CONSUMO).select('*').gte('mes', meses[0]))) || [];
    const mapa = {};
    data.forEach(function (r) { (mapa[r.insumo_id] = mapa[r.insumo_id] || {})[r.mes] = Number(r.consumido) || 0; });
    S.consumo = { meses: meses, mapa: mapa };
    const l = S.items.filter(function (i) { return i.activo; }).map(function (i) {
      const pm = mapa[i.id] || {}, prom = L.promedio(pm, meses);
      return { i: i, pm: pm, prom: prom, cob: L.cobertura(i.stock_actual, prom) };
    }).sort(function (a, b) { return b.prom - a.prom || a.i.nombre.localeCompare(b.i.nombre); });
    const tot = meses.map(function (m) { return l.reduce(function (a, r) { return a + (r.pm[m] || 0); }, 0); });
    $('insBody').innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><div style="font-size:13px;color:var(--text-muted)">Unidades consumidas (salidas) por mes · promedio de los últimos 6 meses · cobertura = stock actual ÷ promedio.</div><span style="flex:1"></span>' +
      '<button class="btn btn-sm" style="background:#0e6b39;color:#fff" onclick="Ins.excelConsumo()">📊 Excel</button></div>' +
      '<div style="' + ST.card + ';padding:0;overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr>' +
      '<th style="' + ST.th + '">Insumo</th>' + meses.map(function (m) { return '<th style="' + ST.th + ';text-align:right">' + L.mesLabel(m) + '</th>'; }).join('') +
      ['Prom./mes', 'Stock', 'Cobertura'].map(function (h) { return '<th style="' + ST.th + ';text-align:right">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (l.map(function (r) {
        const cobTxt = r.cob == null ? '—' : (r.cob < 1 ? '< 1 mes' : L.fmt(r.cob) + ' meses'), cobC = r.cob != null && r.cob < 1 ? '#ef4444' : (r.cob != null && r.cob < 2 ? '#f59e0b' : 'var(--text)');
        return '<tr><td style="' + ST.td + ';font-weight:600">' + esc(r.i.nombre) + '<div style="font-size:10px;color:var(--text-muted)">' + esc(r.i.codigo) + ' · ' + esc(r.i.unidad) + '</div></td>' +
          meses.map(function (m) { const v = r.pm[m] || 0; return '<td style="' + ST.td + ';text-align:right;' + (v ? '' : 'color:var(--text-muted)') + '">' + (v ? L.fmt(v) : '·') + '</td>'; }).join('') +
          '<td style="' + ST.td + ';text-align:right;font-weight:800">' + L.fmt(r.prom) + '</td><td style="' + ST.td + ';text-align:right;color:' + L.NIVEL[r.i.nivel].c + ';font-weight:700">' + L.fmt(r.i.stock_actual) + '</td>' +
          '<td style="' + ST.td + ';text-align:right;font-weight:700;color:' + cobC + '">' + cobTxt + '</td></tr>';
      }).join('') || '<tr><td colspan="10" style="' + ST.td + ';text-align:center;color:var(--text-muted);padding:24px">Sin insumos.</td></tr>') +
      '</tbody><tfoot><tr><td style="' + ST.td + ';font-weight:800">Total unidades</td>' + tot.map(function (v) { return '<td style="' + ST.td + ';text-align:right;font-weight:800">' + L.fmt(v) + '</td>'; }).join('') + '<td colspan="3" style="' + ST.td + '"></td></tr></tfoot></table></div>' +
      '<div style="font-size:11px;color:var(--text-muted);margin-top:8px">El promedio incluye los meses sin consumo. Las unidades de distintos insumos se suman solo como referencia.</div>';
    S._consumoRows = l;
  }
  function excelConsumo() {
    if (typeof XLSX === 'undefined') return toast('La librería Excel no cargó.');
    const c = S.consumo, l = S._consumoRows; if (!c || !l) return;
    const rows = l.map(function (r) {
      const o = { 'Código': r.i.codigo, 'Insumo': r.i.nombre, 'Unidad': r.i.unidad };
      c.meses.forEach(function (m) { o[L.mesLabel(m)] = r.pm[m] || 0; });
      o['Promedio/mes'] = Math.round(r.prom * 100) / 100; o['Stock actual'] = r.i.stock_actual; o['Cobertura (meses)'] = r.cob == null ? '' : Math.round(r.cob * 10) / 10;
      return o;
    });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Consumo');
    XLSX.writeFile(wb, 'ConsumoMensual_Insumos_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

  /* ═════════ Rótulos (SATO, 100x150 mm) ═════════ */
  const CSS_ROTULO = [
    '@page{size:100mm 150mm portrait;margin:0}', '*{margin:0;padding:0;box-sizing:border-box}',
    'html,body{width:100mm;font-family:Arial,sans-serif;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.rotulo{width:100mm;height:150mm;padding:3mm;display:flex;flex-direction:column;overflow:hidden;page-break-after:always;break-after:page}',
    '.hdr{display:flex;align-items:center;justify-content:space-between;border-bottom:1.5px solid #000;padding-bottom:1.5mm;margin-bottom:2mm}',
    '.logo{font-size:18px;font-weight:900;letter-spacing:-1px;color:#1dbf8e!important}.hdr small{font-size:7px;color:#444;text-align:right;line-height:1.4}',
    '.tag{background:#000!important;color:#fff!important;text-align:center;font-weight:900;font-size:12px;letter-spacing:1.5px;padding:1.6mm;margin-bottom:2mm}',
    '.code{font-size:40px;font-weight:900;text-align:center;letter-spacing:-1px;line-height:1.05;border:2.5px solid #000;padding:1.5mm;margin-bottom:2mm}',
    '.nom{font-size:19px;font-weight:900;text-align:center;line-height:1.15;margin:1mm 0 2mm;min-height:22mm;display:flex;align-items:center;justify-content:center}',
    '.codes{display:flex;gap:3mm;align-items:center;margin-bottom:2mm;padding-right:7mm}.codes img.bc{flex:1;min-width:0;height:17mm;object-fit:contain}.codes img.qr{width:24mm;height:24mm;flex:none}',
    '.info{display:grid;grid-template-columns:1fr 1fr;gap:1.6mm 3mm;margin-bottom:2mm;border-top:1.5px solid #000;padding-top:2mm}',
    '.k{font-size:7px;font-weight:700;color:#555;text-transform:uppercase}.v{font-size:13px;font-weight:900}',
    '.foot{margin-top:auto;border-top:1.5px solid #000;padding-top:1.2mm;font-size:7px;color:#333}',
    '.btn{display:block;width:95mm;margin:6px auto 0;padding:9px;background:#1dbf8e;color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;border-radius:5px}',
    '@media print{.btn{display:none!important}}',
  ].join('');
  function urlBarcode(t) { return 'https://barcode.tec-it.com/barcode.ashx?data=' + encodeURIComponent(t) + '&code=Code128&dpi=200&imagetype=Png'; }
  function linkPortal(cod) { try { return location.origin + location.pathname + '?ins=' + encodeURIComponent(cod); } catch (e) { return cod; } }
  function urlQR(t) { return 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=1&data=' + encodeURIComponent(t); }
  function rotuloHtml(i) {
    return '<div class="rotulo"><div class="hdr"><span class="logo">alleata</span><small>Andrés Moretti e Hijos S.A.<br>California 2082, CABA</small></div>' +
      '<div class="tag">INSUMO' + (i.categoria ? ' · ' + esc(String(i.categoria).toUpperCase()) : '') + '</div><div class="code">' + esc(i.codigo) + '</div>' +
      '<div class="nom">' + esc(i.nombre) + '</div>' +
      '<div class="codes"><img class="bc" src="' + urlBarcode(i.codigo) + '"><img class="qr" src="' + urlQR(linkPortal(i.codigo)) + '"></div>' +
      '<div class="info"><div><div class="k">Unidad</div><div class="v">' + esc(i.unidad) + '</div></div>' +
      '<div><div class="k">Ubicación</div><div class="v">' + esc(i.ubicacion || '________') + '</div></div>' +
      '<div><div class="k">Stock mín. / máx.</div><div class="v">' + L.fmt(i.stock_min) + ' / ' + L.fmt(i.stock_max) + '</div></div>' +
      '<div><div class="k">Proveedor</div><div class="v" style="font-size:11px">' + esc(i.proveedor || '________') + '</div></div></div>' +
      '<div class="foot">Origen: Barracas · Impreso ' + esc(fmtFecha(new Date().toISOString())) + ' · ' + esc(quien()) + '</div></div>';
  }
  function rotular(ids) {
    const items = ids.map(function (id) { return S.items.find(function (i) { return i.id === id; }); }).filter(Boolean);
    if (!items.length) return;
    let copias = 1;
    if (items.length === 1) {
      const r = prompt('¿Cuántas copias de ' + items[0].codigo + '?', '1'); if (r === null) return;
      copias = Math.max(1, Math.min(50, parseInt(r, 10) || 1));
    }
    const w = window.open('', '_blank', 'width=460,height=700');
    if (!w) return toast('El navegador bloqueó la ventana de impresión. Permití popups para este sitio.');
    let cuerpo = '';
    items.forEach(function (i) { for (let k = 0; k < copias; k++) cuerpo += rotuloHtml(i); });
    w.document.open();
    w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Rótulos insumos</title><style>' + CSS_ROTULO + '</style></head><body>' + cuerpo + '<button class="btn" onclick="window.print()">🖨️ Imprimir</button></body></html>');
    w.document.close();
  }
  function rotularSel() {
    const ids = Object.keys(S.sel).filter(function (k) { return S.sel[k]; });
    if (!ids.length) return toast('Tildá al menos un insumo.');
    rotular(ids);
  }

  // Entrada desde el QR del rótulo (?ins=INS-0001): abre Movimientos con el insumo cargado
  async function abrir(codigo) {
    const c = L.parseCodigo(codigo); if (!c) return;
    S.tab = 'mov'; _movPre = c; await init();
  }

  window.Ins = {
    init: init, tab: setTab, abrir: abrir, buscar: buscar, filtroNivel: filtroNivel, filtroCat: filtroCat, sel: selUno, selTodos: selTodos,
    editar: editar, guardar: guardar, eliminar: eliminar, cerrarModal: cerrarModal,
    irMov: irMov, movElegir: movElegir, movGuardar: movGuardar, borrarMov: borrarMov,
    copiarCompra: copiarCompra, excelCompra: excelCompra, excelConsumo: excelConsumo,
    rotular: rotular, rotularSel: rotularSel, _logic: L,
  };
})();
