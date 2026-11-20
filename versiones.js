/*
 * versiones.js — Módulo VERSIONES (alta 19/11/2026)
 *
 *  Versión de la app (com.moretti.alleata) instalada en cada terminal, según el reporte "Terminal Apps Report"
 *  del TEM de Ingenico, cruzada contra Salesforce para saber a qué CUENTA corresponde cada terminal.
 *
 *  - Se cargan uno o varios reportes del TEM (.zip tal cual lo baja el TEM, o el .xlsx). Las terminales están
 *    repartidas en dos carpetas del TEM (NAPSE solo apps / TETRA-NAPSE-1_6_0): se cargan los dos archivos juntos.
 *  - El cruce con SF NO se reimplementa: se usa POST /automations/terminales/tem-match del agente (el serial de TEM
 *    son los últimos 16 dígitos del Name de Product2). El resultado se agrega a terminal_tem_historial (nunca se pisa
 *    lo anterior) y la pantalla lee la última foto por terminal de v_terminal_tem_ultimo.
 *  - Vistas: KPIs + distribución por versión, tabla filtrable por terminal, y agrupado por cuenta. Export a Excel.
 *
 *  Globales del portal que usa: sb (supabase), currentProfile, XLSX, JSZip, SF_AGENT_URL, showToastPortal.
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

  // TEM manda "MM/DD/YYYY HH:mm:ss" (formato US). Devuelve ISO sin zona, o null.
  L.parseFechaTem = function (s) {
    if (!s || typeof s !== 'string') return null;
    const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return null;
    return m[3] + '-' + m[1] + '-' + m[2] + 'T' + m[4] + ':' + m[5] + ':' + m[6];
  };

  // Filas de la hoja "globalReport" (sheet_to_json) → filas normalizadas. Ignora las que no traen serial.
  L.normalizarFilasTem = function (filas) {
    return (filas || [])
      .filter(function (f) { return f['Name'] || f['Signature']; })
      .map(function (f) {
        return {
          serie_tem: String(f['Name'] || f['Signature']).trim(),
          terminal_type: f['Terminal Type'] || null,
          last_call_date: L.parseFechaTem(f['lastCallDate']),
          next_call_date: L.parseFechaTem(f['nextCallDate']),
          application_id: f['Application Id'] || null,
          application_version: f['Application Version'] ? String(f['Application Version']).trim() : null,
        };
      });
  };

  // Une varios reportes (uno por carpeta del TEM). Si una terminal aparece en más de uno, gana la conexión más reciente.
  L.unirReportes = function (listas) {
    const mapa = new Map();
    let repetidas = 0;
    (listas || []).forEach(function (lista) {
      lista.forEach(function (r) {
        const prev = mapa.get(r.serie_tem);
        if (!prev) { mapa.set(r.serie_tem, r); return; }
        repetidas++;
        if ((r.last_call_date || '') > (prev.last_call_date || '')) mapa.set(r.serie_tem, r);
      });
    });
    return { filas: Array.from(mapa.values()), repetidas: repetidas };
  };

  // Compara versiones "2.5.13" vs "2.5.9" numéricamente. Vacío/null = más vieja que cualquiera.
  L.cmpVer = function (a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    const pa = String(a).split('.'), pb = String(b).split('.');
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
      const x = parseInt(pa[i], 10), y = parseInt(pb[i], 10);
      const xx = isNaN(x) ? 0 : x, yy = isNaN(y) ? 0 : y;
      if (xx !== yy) return xx < yy ? -1 : 1;
    }
    return 0;
  };

  // Versión objetivo por defecto: la más alta que ya tiene un mínimo de terminales (evita que una prueba
  // en 1 equipo se tome como "la actual"). El usuario la puede cambiar en pantalla.
  L.versionObjetivo = function (rows, minimo) {
    const min = minimo == null ? 5 : minimo;
    const cuenta = {};
    rows.forEach(function (r) { if (r.application_version) cuenta[r.application_version] = (cuenta[r.application_version] || 0) + 1; });
    const cand = Object.keys(cuenta).filter(function (v) { return cuenta[v] >= min; });
    const lista = cand.length ? cand : Object.keys(cuenta);
    lista.sort(L.cmpVer);
    return lista.length ? lista[lista.length - 1] : null;
  };

  // 'sin_version' | 'al_dia' (>= objetivo) | 'desactualizada' (< objetivo)
  L.estadoVersion = function (r, objetivo) {
    if (!r.application_version) return 'sin_version';
    if (!objetivo) return 'al_dia';
    return L.cmpVer(r.application_version, objetivo) >= 0 ? 'al_dia' : 'desactualizada';
  };

  L.sinContacto = function (r, dias, ahoraMs) {
    if (!r.last_call_date) return true;
    const t = new Date(r.last_call_date).getTime();
    if (isNaN(t)) return true;
    return (ahoraMs - t) > dias * 86400000;
  };

  L.cuentaDe = function (r) { return r.cuenta_en_momento || ''; };

  L.kpis = function (rows, objetivo, dias, ahoraMs) {
    const k = { total: rows.length, al_dia: 0, desactualizada: 0, sin_version: 0, sin_contacto: 0, sin_cuenta: 0, no_en_sf: 0 };
    rows.forEach(function (r) {
      k[L.estadoVersion(r, objetivo)]++;
      if (L.sinContacto(r, dias, ahoraMs)) k.sin_contacto++;
      if (!r.encontrada_en_sf) k.no_en_sf++;
      else if (!L.cuentaDe(r)) k.sin_cuenta++;
    });
    return k;
  };

  // [{version, n}] de mayor a menor versión; "(sin versión)" al final.
  L.porVersion = function (rows) {
    const c = {};
    rows.forEach(function (r) { const v = r.application_version || ''; c[v] = (c[v] || 0) + 1; });
    return Object.keys(c)
      .sort(function (a, b) { return L.cmpVer(b, a); })
      .map(function (v) { return { version: v, n: c[v] }; });
  };

  L.porCuenta = function (rows, objetivo) {
    const m = {};
    rows.forEach(function (r) {
      const nombre = r.encontrada_en_sf ? (L.cuentaDe(r) || '(sin cuenta asignada)') : '(no encontrada en SF)';
      const o = m[nombre] || (m[nombre] = { cuenta: nombre, total: 0, al_dia: 0, desactualizada: 0, sin_version: 0, versiones: {} });
      o.total++;
      o[L.estadoVersion(r, objetivo)]++;
      const v = r.application_version || '(sin versión)';
      o.versiones[v] = (o.versiones[v] || 0) + 1;
    });
    return Object.keys(m).map(function (k) { return m[k]; });
  };

  // f: { texto, version ('' = todas, '__sin__' = sin versión), tipo, perfil, estado ('', 'al_dia', 'desactualizada', 'sin_version'),
  //      conexion ('' | 'sin_contacto'), cuenta (nombre exacto), dias, objetivo, ahoraMs }
  L.filtrar = function (rows, f) {
    const q = String(f.texto || '').trim().toLowerCase();
    return rows.filter(function (r) {
      if (q) {
        const hay = [r.serie_tem, r.serial_sf, r.cuenta_en_momento].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      if (f.version === '__sin__') { if (r.application_version) return false; }
      else if (f.version && r.application_version !== f.version) return false;
      if (f.tipo && r.terminal_type !== f.tipo) return false;
      if (f.perfil === '__sin__') { if (r.perfil_en_momento) return false; }
      else if (f.perfil && r.perfil_en_momento !== f.perfil) return false;
      if (f.estado && L.estadoVersion(r, f.objetivo) !== f.estado) return false;
      if (f.conexion === 'sin_contacto' && !L.sinContacto(r, f.dias, f.ahoraMs)) return false;
      if (f.cuenta) {
        const nombre = r.encontrada_en_sf ? (L.cuentaDe(r) || '(sin cuenta asignada)') : '(no encontrada en SF)';
        if (nombre !== f.cuenta) return false;
      }
      return true;
    });
  };

  L.ordenar = function (rows, key, dir) {
    const mult = dir === 'desc' ? -1 : 1;
    const val = function (r) {
      if (key === 'version') return r.application_version || '';
      if (key === 'cuenta') return (L.cuentaDe(r) || '').toLowerCase();
      if (key === 'ultima') return r.last_call_date || '';
      if (key === 'tipo') return r.terminal_type || '';
      return String(r.serial_sf || r.serie_tem || '');
    };
    return rows.slice().sort(function (a, b) {
      if (key === 'version') return mult * L.cmpVer(a.application_version, b.application_version);
      const x = val(a), y = val(b);
      return x < y ? -mult : x > y ? mult : 0;
    });
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = L; return; }

  /* ═════════════════ UI ═════════════════ */
  const DIAS_SIN_CONTACTO = 30;
  const PAGINA = 200;
  const E = L.esc;

  const S = {
    montado: false, cargando: false, rows: [], objetivo: null, tab: 'terminales',
    f: { texto: '', version: '', tipo: '', perfil: '', estado: '', conexion: '', cuenta: '' },
    orden: { key: 'version', dir: 'asc' }, visibles: PAGINA, importMsg: '',
  };

  function ahora() { return Date.now(); }
  function esAdmin() { try { return currentProfile && currentProfile.rol === 'admin'; } catch (e) { return false; } }
  function agenteUrl() { return (typeof SF_AGENT_URL !== 'undefined' && SF_AGENT_URL) || 'https://alleata-agent-production.up.railway.app'; }
  function toast(t) { try { showToastPortal(t); } catch (e) { console.log(t); } }
  function fmtFecha(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
  }
  function $(id) { return document.getElementById(id); }

  function esqueleto() {
    const root = $('mod-versiones');
    if (!root) return false;
    root.innerHTML =
      '<div class="card" style="margin-bottom:14px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
          '<div><div style="font-size:14px;font-weight:700">🏷️ Versiones de la app por terminal</div>' +
          '<div id="verSub" style="font-size:11px;color:var(--text-muted);margin-top:2px"></div></div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
            '<label style="font-size:11px;color:var(--text-muted)">Versión objetivo ' +
              '<select class="input" id="verObjetivo" style="max-width:110px;display:inline-block" onchange="window.Ver.setObjetivo(this.value)"></select></label>' +
            '<button class="btn btn-sm" onclick="window.Ver.exportar()">⬇ Excel</button>' +
            '<span id="verAdminBar" style="display:none">' +
              '<input type="file" id="verFileInp" accept=".xlsx,.zip" multiple style="display:none" onchange="window.Ver.importar(this)">' +
              '<button class="btn btn-sm" style="background:rgba(29,191,142,.12);color:var(--teal);border:1px solid rgba(29,191,142,.3)" ' +
                'onclick="document.getElementById(\'verFileInp\').click()" ' +
                'title="Reportes del TEM (.zip o .xlsx). Elegí los de las dos carpetas a la vez.">📥 Cargar reportes TEM</button>' +
            '</span>' +
          '</div>' +
        '</div>' +
        '<div id="verImportMsg" style="font-size:11px;color:var(--text-muted);margin-top:8px"></div>' +
      '</div>' +
      '<div class="stats-row" id="verKpis" style="margin-bottom:12px"></div>' +
      '<div class="card" style="margin-bottom:14px" id="verDistCard"></div>' +
      '<div style="display:flex;gap:6px;margin-bottom:12px">' +
        '<button class="btn btn-sm" id="verTabTerminales" onclick="window.Ver.setTab(\'terminales\')">🖥️ Terminales</button>' +
        '<button class="btn btn-sm" id="verTabCuentas" onclick="window.Ver.setTab(\'cuentas\')">🏢 Por cuenta</button>' +
      '</div>' +
      '<div id="verPanelTerminales">' +
        '<div class="card" style="margin-bottom:12px"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<input class="input" id="verTexto" placeholder="Serial, signature o cuenta…" style="max-width:260px" oninput="window.Ver.setFiltro(\'texto\',this.value)">' +
          '<select class="input" id="verFVersion" style="max-width:150px" onchange="window.Ver.setFiltro(\'version\',this.value)"></select>' +
          '<select class="input" id="verFEstado" style="max-width:170px" onchange="window.Ver.setFiltro(\'estado\',this.value)">' +
            '<option value="">Estado — todos</option><option value="al_dia">Al día</option>' +
            '<option value="desactualizada">Desactualizadas</option><option value="sin_version">Sin versión</option></select>' +
          '<select class="input" id="verFTipo" style="max-width:150px" onchange="window.Ver.setFiltro(\'tipo\',this.value)"></select>' +
          '<select class="input" id="verFPerfil" style="max-width:150px" onchange="window.Ver.setFiltro(\'perfil\',this.value)"></select>' +
          '<select class="input" id="verFConexion" style="max-width:200px" onchange="window.Ver.setFiltro(\'conexion\',this.value)">' +
            '<option value="">Conexión — todas</option><option value="sin_contacto">Sin contacto &gt; ' + DIAS_SIN_CONTACTO + ' días</option></select>' +
          '<button class="btn btn-sm" onclick="window.Ver.limpiar()">Limpiar</button>' +
        '</div><div id="verFiltroInfo" style="font-size:11px;color:var(--text-muted);margin-top:8px"></div></div>' +
        '<div class="card" style="padding:0;overflow-x:auto"><table class="table" style="min-width:980px">' +
          '<thead><tr>' +
            '<th style="cursor:pointer" onclick="window.Ver.ordenarPor(\'serial\')">Terminal (SF)</th><th>Signature TEM</th>' +
            '<th style="cursor:pointer" onclick="window.Ver.ordenarPor(\'tipo\')">Tipo</th>' +
            '<th style="cursor:pointer" onclick="window.Ver.ordenarPor(\'cuenta\')">Cuenta</th>' +
            '<th style="cursor:pointer" onclick="window.Ver.ordenarPor(\'version\')">Versión</th>' +
            '<th style="cursor:pointer" onclick="window.Ver.ordenarPor(\'ultima\')">Última conexión</th><th>Perfil</th><th>Reporte del</th>' +
          '</tr></thead><tbody id="verBody"></tbody></table></div>' +
        '<div id="verMas" style="text-align:center;margin:12px 0"></div>' +
      '</div>' +
      '<div id="verPanelCuentas" style="display:none"><div class="card" style="padding:0;overflow-x:auto">' +
        '<table class="table" style="min-width:760px"><thead><tr><th>Cuenta</th><th>Terminales</th><th>Al día</th><th>Desactualizadas</th><th>Sin versión</th><th>Versiones</th></tr></thead>' +
        '<tbody id="verCuentasBody"></tbody></table></div></div>';
    return true;
  }

  async function cargarDatos() {
    if (S.cargando) return;
    S.cargando = true;
    const sub = $('verSub');
    if (sub) sub.textContent = 'Cargando…';
    try {
      // Supabase corta en 1000 filas por request: se pagina.
      let todas = [];
      for (let desde = 0; ; desde += 1000) {
        const res = await sb.from('v_terminal_tem_ultimo').select('*').order('serie_tem', { ascending: true }).range(desde, desde + 999);
        if (res.error) throw res.error;
        todas = todas.concat(res.data || []);
        if (!res.data || res.data.length < 1000) break;
      }
      S.rows = todas;
      if (!S.objetivo || !todas.some(function (r) { return r.application_version === S.objetivo; })) S.objetivo = L.versionObjetivo(todas, 5);
      pintar();
    } catch (e) {
      console.error('[Versiones]', e);
      if (sub) sub.innerHTML = '<span style="color:#f87171">⛔ ' + E(e.message || e) + '</span>';
    } finally { S.cargando = false; }
  }

  function llenarSelect(id, primera, opciones, valor) {
    const el = $(id);
    if (!el) return;
    el.innerHTML = '<option value="">' + E(primera) + '</option>' + opciones.map(function (o) {
      return '<option value="' + E(o.v) + '">' + E(o.t) + '</option>';
    }).join('');
    el.value = valor || '';
  }

  function pintar() {
    if (!S.montado) return;
    const rows = S.rows, t = ahora();
    const ultimoImport = rows.reduce(function (m, r) { return r.importado_en && r.importado_en > m ? r.importado_en : m; }, '');
    $('verSub').textContent = rows.length
      ? rows.length + ' terminales · último reporte cargado: ' + fmtFecha(ultimoImport)
      : 'Todavía no hay reportes del TEM cargados.';
    $('verAdminBar').style.display = esAdmin() ? '' : 'none';

    const versiones = L.porVersion(rows).filter(function (x) { return x.version; });
    const objSel = $('verObjetivo');
    objSel.innerHTML = versiones.map(function (x) { return '<option value="' + E(x.version) + '">' + E(x.version) + '</option>'; }).join('');
    if (S.objetivo) objSel.value = S.objetivo;

    // KPIs
    const k = L.kpis(rows, S.objetivo, DIAS_SIN_CONTACTO, t);
    const pct = function (n) { return k.total ? Math.round(100 * n / k.total) + '%' : ''; };
    const box = function (cls, num, label, sub, accion) {
      return '<div class="stat-box ' + cls + '" style="cursor:pointer" onclick="' + accion + '"><div class="stat-num">' + num + '</div><div class="stat-label">' + label + '</div>' +
        (sub ? '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">' + sub + '</div>' : '') + '</div>';
    };
    $('verKpis').innerHTML =
      box('s-purple', k.total, 'Terminales', 'en los reportes TEM', "window.Ver.atajo('')") +
      box('s-green', k.al_dia, 'Al día', S.objetivo ? '≥ ' + E(S.objetivo) + ' · ' + pct(k.al_dia) : '', "window.Ver.atajo('al_dia')") +
      box('s-orange', k.desactualizada, 'Desactualizadas', pct(k.desactualizada), "window.Ver.atajo('desactualizada')") +
      box('', k.sin_version, 'Sin versión', 'el TEM no informa la app', "window.Ver.atajo('sin_version')") +
      box('', k.sin_contacto, 'Sin contacto > ' + DIAS_SIN_CONTACTO + ' d', 'o sin fecha de conexión', "window.Ver.atajo('sin_contacto')") +
      box('', k.no_en_sf + k.sin_cuenta, 'Sin cuenta', k.no_en_sf + ' no están en SF · ' + k.sin_cuenta + ' sin cuenta asignada', "window.Ver.atajo('sin_cuenta')");

    // Distribución por versión (barras, click = filtrar)
    const max = versiones.reduce(function (m, x) { return Math.max(m, x.n); }, 1);
    const sinVer = rows.filter(function (r) { return !r.application_version; }).length;
    const barras = versiones.map(function (x) {
      const w = Math.max(2, Math.round(100 * x.n / max));
      const marca = x.version === S.objetivo ? ' ✓' : '';
      return '<div style="display:flex;align-items:center;gap:8px;margin:3px 0;cursor:pointer" onclick="window.Ver.filtrarVersion(\'' + E(x.version) + '\')">' +
        '<div class="mono" style="width:70px;font-size:12px">' + E(x.version) + marca + '</div>' +
        '<div style="flex:1;background:rgba(255,255,255,.05);border-radius:4px;height:14px"><div style="width:' + w + '%;height:100%;border-radius:4px;background:linear-gradient(90deg,var(--teal),var(--blue))"></div></div>' +
        '<div style="width:90px;font-size:11px;text-align:right">' + x.n + ' · ' + (k.total ? Math.round(100 * x.n / k.total) : 0) + '%</div></div>';
    }).join('');
    $('verDistCard').innerHTML = '<div style="font-size:13px;font-weight:700;margin-bottom:8px">Distribución por versión</div>' +
      (barras || '<div style="font-size:12px;color:var(--text-muted)">Sin datos.</div>') +
      (sinVer ? '<div style="font-size:11px;color:var(--text-muted);margin-top:6px">+ ' + sinVer + ' terminales sin versión informada</div>' : '');

    // Selectores de filtro
    llenarSelect('verFVersion', 'Versión — todas',
      versiones.map(function (x) { return { v: x.version, t: x.version + ' (' + x.n + ')' }; }).concat(sinVer ? [{ v: '__sin__', t: '(sin versión) (' + sinVer + ')' }] : []), S.f.version);
    const tipos = Array.from(new Set(rows.map(function (r) { return r.terminal_type; }).filter(Boolean))).sort();
    llenarSelect('verFTipo', 'Tipo — todos', tipos.map(function (x) { return { v: x, t: x }; }), S.f.tipo);
    const perfiles = Array.from(new Set(rows.map(function (r) { return r.perfil_en_momento; }).filter(Boolean))).sort();
    llenarSelect('verFPerfil', 'Perfil — todos', perfiles.map(function (x) { return { v: x, t: x }; }).concat([{ v: '__sin__', t: 'Sin perfil' }]), S.f.perfil);
    $('verFEstado').value = S.f.estado; $('verFConexion').value = S.f.conexion; $('verTexto').value = S.f.texto;

    pintarTabs();
    pintarTabla();
    pintarCuentas();
  }

  function filtrosActuales() {
    return Object.assign({}, S.f, { dias: DIAS_SIN_CONTACTO, objetivo: S.objetivo, ahoraMs: ahora() });
  }

  function pintarTabla() {
    if (!S.montado) return;
    let lista = L.filtrar(S.rows, filtrosActuales());
    // "Sin cuenta" (atajo del KPI) no es un filtro de la lib: se aplica acá.
    if (S.f.__sinCuenta) lista = lista.filter(function (r) { return !r.encontrada_en_sf || !L.cuentaDe(r); });
    lista = L.ordenar(lista, S.orden.key, S.orden.dir);
    const ultimoImport = S.rows.reduce(function (m, r) { return r.importado_en && r.importado_en > m ? r.importado_en : m; }, '');
    const ultMs = ultimoImport ? new Date(ultimoImport).getTime() : 0;
    const t = ahora();
    const trozo = lista.slice(0, S.visibles);
    $('verBody').innerHTML = trozo.length ? trozo.map(function (r) {
      const est = L.estadoVersion(r, S.objetivo);
      const color = est === 'al_dia' ? 'var(--teal)' : est === 'desactualizada' ? '#f59e0b' : 'var(--text-muted)';
      const sinC = L.sinContacto(r, DIAS_SIN_CONTACTO, t);
      const viejo = ultMs && r.importado_en && (ultMs - new Date(r.importado_en).getTime()) > 86400000;
      const cuenta = r.encontrada_en_sf ? (L.cuentaDe(r) || '<span style="color:var(--text-muted)">sin asignar</span>') : '<span style="color:#f87171">no está en SF</span>';
      return '<tr><td class="mono">' + E(r.serial_sf || '—') + '</td><td class="mono">' + E(r.serie_tem) + '</td><td>' + E(r.terminal_type || '—') + '</td>' +
        '<td>' + (r.encontrada_en_sf && L.cuentaDe(r) ? E(L.cuentaDe(r)) : cuenta) + '</td>' +
        '<td style="color:' + color + ';font-weight:600">' + E(r.application_version || '—') + '</td>' +
        '<td' + (sinC ? ' style="color:#f59e0b"' : '') + '>' + fmtFecha(r.last_call_date) + '</td>' +
        '<td>' + E(r.perfil_en_momento || '—') + '</td>' +
        '<td' + (viejo ? ' style="color:#f59e0b" title="No figuró en el último reporte cargado"' : '') + '>' + fmtFecha(r.importado_en) + '</td></tr>';
    }).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:18px">Sin resultados.</td></tr>';
    $('verFiltroInfo').textContent = lista.length + ' de ' + S.rows.length + ' terminales' + (S.f.cuenta ? ' · cuenta: ' + S.f.cuenta : '');
    $('verMas').innerHTML = lista.length > trozo.length
      ? '<button class="btn btn-sm" onclick="window.Ver.verMas()">Mostrar ' + Math.min(PAGINA, lista.length - trozo.length) + ' más (' + (lista.length - trozo.length) + ' restantes)</button>' : '';
  }

  function pintarCuentas() {
    if (!S.montado) return;
    const cuentas = L.porCuenta(S.rows, S.objetivo).sort(function (a, b) { return b.total - a.total || a.cuenta.localeCompare(b.cuenta); });
    $('verCuentasBody').innerHTML = cuentas.map(function (c) {
      const vers = Object.keys(c.versiones).sort(function (a, b) { return L.cmpVer(b, a); })
        .map(function (v) { return E(v) + ' (' + c.versiones[v] + ')'; }).join(' · ');
      return '<tr style="cursor:pointer" data-cuenta="' + E(c.cuenta) + '" onclick="window.Ver.filtrarCuenta(this.getAttribute(\'data-cuenta\'))">' +
        '<td>' + E(c.cuenta) + '</td><td>' + c.total + '</td><td style="color:var(--teal)">' + c.al_dia + '</td>' +
        '<td style="color:#f59e0b">' + c.desactualizada + '</td><td>' + c.sin_version + '</td><td style="font-size:11px">' + vers + '</td></tr>';
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:18px">Sin datos.</td></tr>';
  }

  function pintarTabs() {
    const a = S.tab === 'terminales';
    $('verPanelTerminales').style.display = a ? '' : 'none';
    $('verPanelCuentas').style.display = a ? 'none' : '';
    $('verTabTerminales').style.opacity = a ? '1' : '.6';
    $('verTabCuentas').style.opacity = a ? '.6' : '1';
  }

  /* ═════════════════ Acciones ═════════════════ */
  async function leerExcel(file) {
    let buffer;
    if (/\.zip$/i.test(file.name)) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const nombre = Object.keys(zip.files).find(function (n) { return /\.xlsx$/i.test(n) && !zip.files[n].dir; });
      if (!nombre) throw new Error('"' + file.name + '": el .zip no tiene ningún .xlsx adentro.');
      buffer = await zip.files[nombre].async('arraybuffer');
    } else {
      buffer = await file.arrayBuffer();
    }
    const wb = XLSX.read(buffer, { type: 'array' });
    const hoja = wb.Sheets['globalReport'] || wb.Sheets[wb.SheetNames[0]];
    if (!hoja) throw new Error('"' + file.name + '": no encontré ninguna hoja.');
    const filas = L.normalizarFilasTem(XLSX.utils.sheet_to_json(hoja, { defval: '' }));
    if (!filas.length) throw new Error('"' + file.name + '": no encontré filas con serial.');
    return filas;
  }

  async function importar(input) {
    const archivos = Array.from(input.files || []);
    input.value = '';
    if (!archivos.length) return;
    if (!esAdmin()) { toast('Solo un administrador puede cargar reportes del TEM'); return; }
    const msg = $('verImportMsg');
    try {
      msg.textContent = 'Leyendo ' + archivos.length + ' archivo(s)…';
      const listas = [];
      const detalle = [];
      for (const f of archivos) { const filas = await leerExcel(f); listas.push(filas); detalle.push(f.name + ': ' + filas.length); }
      const unido = L.unirReportes(listas);
      msg.textContent = 'Cruzando ' + unido.filas.length + ' terminales contra Salesforce…';
      const res = await fetch(agenteUrl() + '/automations/terminales/tem-match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: unido.filas }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error consultando Salesforce');
      msg.textContent = 'Guardando ' + data.resultados.length + ' registros en el historial…';
      const por = ((currentProfile && (currentProfile.nombre || currentProfile.email)) || '—').trim();
      const filas = data.resultados.map(function (r) { return Object.assign({}, r, { importado_por: por }); });
      for (let i = 0; i < filas.length; i += 500) {
        const { error } = await sb.from('terminal_tem_historial').insert(filas.slice(i, i + 500));
        if (error) throw error;
      }
      msg.textContent = '✅ ' + data.encontradas + '/' + data.resultados.length + ' terminales resueltas contra SF · ' + detalle.join(' · ') +
        (unido.repetidas ? ' · ' + unido.repetidas + ' repetidas entre archivos (quedó la conexión más reciente)' : '');
      toast('TEM cargado: ' + data.encontradas + '/' + data.resultados.length + ' resueltas contra SF');
      await cargarDatos();
    } catch (e) {
      console.error('[Versiones] importar', e);
      msg.innerHTML = '<span style="color:#f87171">⛔ ' + E(e.message || e) + '</span>';
    }
  }

  function exportar() {
    let lista = L.filtrar(S.rows, filtrosActuales());
    if (S.f.__sinCuenta) lista = lista.filter(function (r) { return !r.encontrada_en_sf || !L.cuentaDe(r); });
    lista = L.ordenar(lista, S.orden.key, S.orden.dir);
    if (!lista.length) { toast('No hay filas para exportar'); return; }
    const t = ahora();
    const filas = lista.map(function (r) {
      return {
        'Terminal (SF)': r.serial_sf || '', 'Signature TEM': r.serie_tem, 'Tipo': r.terminal_type || '',
        'Cuenta': r.encontrada_en_sf ? (L.cuentaDe(r) || 'sin asignar') : 'no está en SF',
        'Versión': r.application_version || '', 'Estado versión': { al_dia: 'Al día', desactualizada: 'Desactualizada', sin_version: 'Sin versión' }[L.estadoVersion(r, S.objetivo)],
        'Última conexión': r.last_call_date ? fmtFecha(r.last_call_date) : '', ['Sin contacto > ' + DIAS_SIN_CONTACTO + ' d']: L.sinContacto(r, DIAS_SIN_CONTACTO, t) ? 'Sí' : 'No',
        'Perfil': r.perfil_en_momento || '', 'Estado SF': r.estado_en_momento || '', 'Reporte del': r.importado_en ? fmtFecha(r.importado_en) : '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Versiones');
    XLSX.writeFile(wb, 'versiones_terminales_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

  const API = {
    init: function () {
      if (!S.montado) S.montado = esqueleto();
      if (S.montado) cargarDatos();
    },
    setTab: function (t) { S.tab = t; pintarTabs(); },
    setObjetivo: function (v) { S.objetivo = v || null; pintar(); },
    setFiltro: function (k, v) { S.f[k] = v; if (k !== 'texto') S.f.__sinCuenta = false; S.visibles = PAGINA; pintarTabla(); },
    limpiar: function () { S.f = { texto: '', version: '', tipo: '', perfil: '', estado: '', conexion: '', cuenta: '' }; S.visibles = PAGINA; pintar(); },
    ordenarPor: function (key) {
      S.orden = { key: key, dir: S.orden.key === key && S.orden.dir === 'asc' ? 'desc' : 'asc' };
      pintarTabla();
    },
    verMas: function () { S.visibles += PAGINA; pintarTabla(); },
    atajo: function (que) {
      S.f = { texto: '', version: '', tipo: '', perfil: '', estado: '', conexion: '', cuenta: '' };
      if (que === 'sin_contacto') S.f.conexion = 'sin_contacto';
      else if (que === 'sin_cuenta') S.f.__sinCuenta = true;
      else if (que) S.f.estado = que;
      S.tab = 'terminales'; S.visibles = PAGINA; pintar();
    },
    filtrarVersion: function (v) { S.f = { texto: '', version: v, tipo: '', perfil: '', estado: '', conexion: '', cuenta: '' }; S.tab = 'terminales'; S.visibles = PAGINA; pintar(); },
    filtrarCuenta: function (c) { S.f = { texto: '', version: '', tipo: '', perfil: '', estado: '', conexion: '', cuenta: c }; S.tab = 'terminales'; S.visibles = PAGINA; pintar(); },
    importar: importar,
    exportar: exportar,
    _L: L,
  };
  window.Ver = API;
})();
