// ================================
// CONFIG
// ================================

const SF_DESINSTALACIONES_REPORT =
  "https://alleata.lightning.force.com/lightning/r/Report/00ORm00000CRTa5MAH/view";

const ALLY_API_BASE = "https://alleata-agent-production.up.railway.app";

let ultimaHojaRutaSugerida = null;


// ================================
// HELPERS
// ================================

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getHojaRutaContainer() {
  let contenedor = document.getElementById("resultadoHojaRuta");

  if (!contenedor) {
    contenedor = document.createElement("div");
    contenedor.id = "resultadoHojaRuta";
    contenedor.style.marginTop = "16px";

    const zonaBotones =
      document.querySelector("#btn-hoja-ruta-desinst")?.parentElement ||
      document.querySelector('[onclick*="autoTracking"]')?.parentElement ||
      document.querySelector('[onclick*="export"]')?.parentElement ||
      document.body;

    zonaBotones.appendChild(contenedor);
  }

  return contenedor;
}

function renderResumenZonas(resumen = {}) {
  const entries = Object.entries(resumen);

  if (!entries.length) return "";

  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      ${entries.map(([zona, total]) => `
        <span class="badge badge-blue">
          ${escapeHtml(zona)}: ${escapeHtml(total)}
        </span>
      `).join("")}
    </div>
  `;
}

function renderHojaRuta(data) {
  const contenedor = getHojaRutaContainer();

  if (!data?.ok) {
    contenedor.innerHTML = `
      <div class="alert alert-err">
        Error generando hoja de ruta: ${escapeHtml(data?.error || "Error desconocido")}
      </div>
    `;
    return;
  }

  if (!data.ots || data.ots.length === 0) {
    contenedor.innerHTML = `
      <div class="card" style="margin-top:14px;border-left:3px solid var(--yellow)">
        <div class="card-title">🚚 Hoja de ruta sugerida</div>
        <div style="color:var(--text-muted);font-size:13px">
          No hay OTs candidatas para hoja de ruta.
        </div>
      </div>
    `;
    return;
  }

  ultimaHojaRutaSugerida = data;

  contenedor.innerHTML = `
    <div class="card" style="margin-top:14px;border-left:3px solid var(--teal)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px">
        <div>
          <div class="card-title" style="margin-bottom:4px">🚚 Hoja de ruta sugerida</div>
          <div style="font-size:13px;color:var(--text-muted)">
            Zona elegida:
            <b style="color:var(--teal)">${escapeHtml(data.zona || "Sin zona")}</b>
            · ${escapeHtml(data.total || 0)} OT
            · Capacidad máx: ${escapeHtml(data.capacidad_maxima || 10)}
          </div>
        </div>

        <button class="btn btn-sm" style="width:auto" onclick="confirmarHojaRutaDesdeDash()">
          ✅ Confirmar hoja
        </button>
      </div>

      ${renderResumenZonas(data.resumen_zonas)}

      <div class="table-wrap" style="margin-top:14px">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>OT</th>
              <th>Comercio</th>
              <th>Ciudad</th>
              <th>Dirección</th>
              <th>Zona</th>
              <th>Origen zona</th>
              <th>Gestión</th>
            </tr>
          </thead>
          <tbody>
            ${data.ots.map((ot) => `
              <tr>
                <td>${escapeHtml(ot.orden)}</td>
                <td class="mono">${escapeHtml(ot.ot)}</td>
                <td>${escapeHtml(ot.comercio)}</td>
                <td>${escapeHtml(ot.ciudad)}</td>
                <td>${escapeHtml(ot.direccion)}</td>
                <td>
                  <span class="badge badge-green">
                    ${escapeHtml(ot.zona_sugerida || "Sin zona")}
                  </span>
                </td>
                <td>${escapeHtml(ot.zona_origen || "—")}</td>
                <td>${escapeHtml(ot.status_gestion_retiros || "Sin gestión")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderHojaConfirmada(result) {
  const contenedor = getHojaRutaContainer();

  if (!result?.ok) {
    contenedor.insertAdjacentHTML("afterbegin", `
      <div class="alert alert-err">
        Error confirmando hoja: ${escapeHtml(result?.error || "Error desconocido")}
      </div>
    `);
    return;
  }

  contenedor.innerHTML = `
    <div class="card" style="margin-top:14px;border-left:3px solid var(--green)">
      <div class="card-title">✅ Hoja de ruta confirmada</div>

      <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">
        Zona: <b style="color:var(--green)">${escapeHtml(result.zona)}</b>
        · Responsable: ${escapeHtml(result.responsable)}
        · Total: ${escapeHtml(result.total)}
      </div>

      <pre style="
        white-space:pre-wrap;
        background:var(--navy-900);
        border:1px solid var(--border);
        border-radius:10px;
        padding:14px;
        color:var(--text);
        font-family:'Inter',sans-serif;
        font-size:13px;
        line-height:1.55;
      ">${escapeHtml(result.mensaje || "")}</pre>

      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm" style="width:auto" onclick="copiarMensajeHojaRuta()">
          📋 Copiar mensaje
        </button>
        <button class="btn-ghost btn-sm" style="width:auto" onclick="sugerirHojaRutaDesdeDash()">
          🔄 Sugerir próxima hoja
        </button>
      </div>
    </div>
  `;

  window.ultimoMensajeHojaRuta = result.mensaje || "";
}


// ================================
// SALESFORCE
// ================================

function abrirReporteSF() {
  try {
    window.open(SF_DESINSTALACIONES_REPORT, "_blank", "noopener,noreferrer");
  } catch (error) {
    console.error("Error al abrir reporte SF:", error);
  }
}


// ================================
// HOJA DE RUTA
// ================================

async function sugerirHojaRutaDesdeDash() {
  const contenedor = getHojaRutaContainer();

  contenedor.innerHTML = `
    <div class="card" style="margin-top:14px;border-left:3px solid var(--blue)">
      <div class="card-title">🚚 Calculando hoja de ruta...</div>
      <div style="font-size:13px;color:var(--text-muted)">
        Validando zonas por CP/localidad para logística Alleata.
      </div>
    </div>
  `;

  try {
    const res = await fetch(`${ALLY_API_BASE}/api/desinstalaciones/hoja-ruta/sugerir`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({})
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }

    renderHojaRuta(data);
  } catch (error) {
    console.error("[HojaRuta] Error sugerir:", error);

    contenedor.innerHTML = `
      <div class="alert alert-err">
        No se pudo sugerir hoja de ruta: ${escapeHtml(error.message)}
      </div>
    `;
  }
}

async function confirmarHojaRutaDesdeDash() {
  const contenedor = getHojaRutaContainer();

  if (!ultimaHojaRutaSugerida?.ots?.length) {
    contenedor.insertAdjacentHTML("afterbegin", `
      <div class="alert alert-err">
        Primero generá una sugerencia de hoja de ruta.
      </div>
    `);
    return;
  }

  const responsable =
    window.currentUser?.nombre ||
    window.currentUser?.name ||
    "Marcelo";

  const ots = ultimaHojaRutaSugerida.ots.map(item => item.ot);

  const confirmado = window.confirm(
    `Confirmar hoja de ruta ${ultimaHojaRutaSugerida.zona} con ${ots.length} OT?`
  );

  if (!confirmado) return;

  try {
    const res = await fetch(`${ALLY_API_BASE}/api/desinstalaciones/hoja-ruta/confirmar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ots,
        zona: ultimaHojaRutaSugerida.zona,
        responsable,
      })
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result?.error || `HTTP ${res.status}`);
    }

    renderHojaConfirmada(result);

    if (typeof cargarDesinstalaciones === "function") {
      cargarDesinstalaciones();
    }
  } catch (error) {
    console.error("[HojaRuta] Error confirmar:", error);

    contenedor.insertAdjacentHTML("afterbegin", `
      <div class="alert alert-err">
        No se pudo confirmar hoja de ruta: ${escapeHtml(error.message)}
      </div>
    `);
  }
}

async function copiarMensajeHojaRuta() {
  const texto = window.ultimoMensajeHojaRuta || "";

  if (!texto) {
    alert("No hay mensaje para copiar.");
    return;
  }

  try {
    await navigator.clipboard.writeText(texto);
    alert("Mensaje copiado.");
  } catch (error) {
    alert("No se pudo copiar automáticamente.");
  }
}


// ================================
// UI INIT
// ================================

function insertarBotonHojaRuta() {
  if (document.getElementById("btn-hoja-ruta-desinst")) return;

  const btnAutoTracking =
    document.querySelector('[onclick*="autoTracking"]') ||
    document.querySelector('[onclick*="runAutoTracking"]') ||
    document.querySelector('[onclick*="desinstAutoTracking"]');

  const btnExportar =
    document.querySelector('[onclick*="export"]') ||
    document.querySelector('[onclick*="Export"]');

  const referencia = btnAutoTracking || btnExportar;

  if (!referencia || !referencia.parentElement) {
    console.warn("[Desinstalaciones] No encontré zona de botones para insertar hoja de ruta");
    return;
  }

  const btn = document.createElement("button");
  btn.id = "btn-hoja-ruta-desinst";
  btn.className = "btn-ghost btn-sm";
  btn.style.width = "auto";
  btn.style.marginLeft = "8px";
  btn.innerHTML = "🚚 Hoja de ruta";
  btn.onclick = sugerirHojaRutaDesdeDash;

  referencia.parentElement.insertBefore(btn, referencia.nextSibling);
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("Módulo desinstalaciones listo");

  const btnReporte = document.getElementById("btn-ver-reporte");
  if (btnReporte) {
    btnReporte.addEventListener("click", abrirReporteSF);
  }

  setTimeout(insertarBotonHojaRuta, 800);
});

window.abrirReporteSF = abrirReporteSF;
window.sugerirHojaRutaDesdeDash = sugerirHojaRutaDesdeDash;
window.confirmarHojaRutaDesdeDash = confirmarHojaRutaDesdeDash;
window.copiarMensajeHojaRuta = copiarMensajeHojaRuta;

// ══════════════════════════════════════════════════════════════
// DESINMODULE — Carga, filtro y render de desinstalaciones
// Lee de v_ordenes_con_sla (que apunta a sf_workorders)
// ══════════════════════════════════════════════════════════════

window.DesinModule = {
  datos: [],
  filtrados: [],
  cargado: false
};

// ── Clasificar logística ──────────────────────────────────────
function dsClasificarLogistica(log) {
  const l = (log || '').toUpperCase();
  if (l === 'ALLEATA') return 'Logística Alleata';
  if (l.includes('CORREO')) return 'Correo Argentino';
  return 'Logísticas Varias';
}

// ── Badge sidebar ─────────────────────────────────────────────
function dsActualizarBadge(n) {
  const el = document.getElementById('nb-desins');
  if (el) el.textContent = n;
}

// ── Render tabla principal ────────────────────────────────────
function dsRenderTabla(datos) {
  const tbody = document.getElementById('ds-tbody');
  if (!tbody) return;

  if (!datos || !datos.length) {
    tbody.innerHTML = '<tr><td colspan="16" style="text-align:center;padding:40px;color:var(--text-muted)">Sin resultados</td></tr>';
    return;
  }

  const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const estadoColor = est => {
    const e = (est || '').toLowerCase();
    if (e === 'pendiente') return '#f59e0b';
    if (e === 'en proceso') return '#1a9fd4';
    if (e === 'no responde') return '#f97316';
    if (e === 'extraviada') return '#ef4444';
    return 'var(--text-muted)';
  };

  tbody.innerHTML = datos.map(ot => {
    const zona  = typeof dsGetZona === 'function' ? dsGetZona(ot) : (ot.zona || '—');
    const color = estadoColor(ot.estado);
    const track = ot.tracking_envio || ot.nro_seguimiento || '';
    const esCA  = (ot.logistica||'').toUpperCase().includes('CORREO');
    const trackLink = track
      ? `<a href="https://www.correoargentino.com.ar/formularios/e-commerce?id=${esc(track)}" target="_blank" style="color:var(--blue);font-family:'JetBrains Mono',monospace;font-size:11px">${esc(track)}</a>`
      : '—';
    const lupaBtn = (esCA && track)
      ? `<button id="ds-track-btn-${esc(ot.id)}" onclick="event.stopPropagation();dsConsultarCA('${esc(ot.id)}','${esc(track)}','${esc(ot.ot)}')" title="Consultar estado CA" style="background:var(--surface2);border:1px solid var(--border2);color:var(--blue);font-size:11px;padding:3px 7px;border-radius:6px;cursor:pointer;margin-left:4px">🔍</button>`
      : '';
    const dias = ot.dias_transcurridos ?? ot.dias_calc ?? '—';
    const slaColor = ot.sla_estado_calc === 'critico' ? '#ef4444' : ot.sla_estado_calc === 'alerta' ? '#f59e0b' : '#10b981';

    return `<tr data-id="${esc(ot.id)}" data-ot="${esc(ot.ot)}" data-estado="${esc(ot.estado)}" data-zona="${esc(zona)}" style="cursor:pointer" onclick="dsAbrirModal('${esc(ot.id)}','${esc(ot.ot)}')">
      <td onclick="event.stopPropagation()"><input type="checkbox" class="ds-chk-ot" value="${esc(ot.ot)}" onclick="dsSelUpdate()" style="accent-color:var(--teal)"></td>
      <td style="font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--teal)">${esc(ot.ot)}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(ot.comercio||ot.cuenta)}">${esc(ot.comercio||ot.cuenta||'—')}</td>
      <td><div style="font-size:12px">${esc(ot.ciudad||'—')}</div><div style="font-size:10px;color:var(--text-muted)">${esc(zona)}</div></td>
      <td style="color:var(--text-muted);font-size:11px">—</td>
      <td style="font-size:11px">${esc(ot.logistica||'—')}</td>
      <td style="white-space:nowrap">${trackLink}${lupaBtn}</td>
      <td style="text-align:center">
        ${ot.contacto ? `<a href="https://wa.me/54${esc(ot.contacto).replace(/\D/g,'')}" target="_blank" title="${esc(ot.contacto)}" style="text-decoration:none;display:inline-flex;align-items:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></a>` : '—'}
      </td>
      <td style="max-width:180px;font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(ot.observacion_estado||ot.observaciones)}">${esc(ot.observacion_estado||ot.observaciones||'—')}</td>
      <td><span style="color:${color};font-weight:600;font-size:11px">${esc(ot.estado||'—')}</span></td>
      <td style="font-size:11px">${ot.costo_envio ? '$'+Number(ot.costo_envio).toLocaleString('es-AR') : '—'}</td>
      <td style="font-size:10px;color:var(--text-muted)">${ot.updated_at ? new Date(ot.updated_at).toLocaleDateString('es-AR') : '—'}</td>
      <td style="font-size:11px">—</td>
      <td style="font-size:11px">${ot.sla_ca_dias ?? '—'}</td>
      <td><span style="color:${slaColor};font-size:11px;font-weight:600">${ot.sla_estado_calc||'—'}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;font-weight:700;color:${slaColor}">${dias}</td>
    </tr>`;
  }).join('');
}

// ── filtrarDesins — aplica búsqueda + filtros ─────────────────
window.filtrarDesins = function() {
  const q     = (document.getElementById('ds-buscar')?.value || '').toLowerCase();
  const fResp = (document.getElementById('ds-f-resp')?.value || '').toLowerCase();
  const fEst  = (document.getElementById('ds-f-estado')?.value || '');
  const fZona = (document.getElementById('ds-f-zona')?.value || '');

  DesinModule.filtrados = (DesinModule.datos || []).filter(ot => {
    if (q) {
      const hay = [ot.ot, ot.comercio, ot.cuenta, ot.ciudad, ot.nro_seguimiento, ot.responsable]
        .map(v => (v || '').toLowerCase()).join(' ');
      if (!hay.includes(q)) return false;
    }
    if (fResp && !(ot.responsable || '').toLowerCase().includes(fResp)) return false;
    if (fEst  && ot.estado !== fEst) return false;
    if (fZona) {
      const zona = typeof dsGetZona === 'function' ? dsGetZona(ot) : (ot.zona || '');
      if (zona !== fZona) return false;
    }
    if (window._dsLogFiltro) {
      const g = typeof dsClasificarLogistica === 'function' ? dsClasificarLogistica(ot.logistica) : '';
      if (g !== window._dsLogFiltro) return false;
    }
    // Filtro subestado En Proceso
    if (window._dsSubestadoActivo) {
      const log = (ot.logistica||'').toUpperCase();
      const sg  = (ot.status_gestion_retiros||ot.status_gestion||'');
      const sub = window._dsSubestadoActivo;
      if (sub === 'visita'     && !(sg === 'Visita presencial' && log === 'ALLEATA'))              return false;
      if (sub === 'despachado' && !(sg === 'Despachado'        && log.includes('CORREO')))         return false;
      if (sub === 'rotulo'     && !(sg === 'Rótulo enviado'    && log.includes('CORREO')))         return false;
      if (sub === 'otros') {
        const esDefinido = (sg === 'Visita presencial' && log === 'ALLEATA') ||
                           (sg === 'Despachado' && log.includes('CORREO')) ||
                           (sg === 'Rótulo enviado' && log.includes('CORREO'));
        if (esDefinido) return false;
      }
    }
    return true;
  });

  if (typeof dsActualizarZonaCards === 'function') dsActualizarZonaCards(DesinModule.filtrados);
  if (typeof dsActualizarLogResumen === 'function') dsActualizarLogResumen(DesinModule.filtrados);
  dsRenderTabla(DesinModule.filtrados);
};

// ── cargarDesinstalaciones — query paginada a v_ordenes_con_sla ──
window.cargarDesinstalaciones = async function() {
  const tbody = document.getElementById('ds-tbody');
  if (!tbody) return;

  // Evitar doble carga
  if (DesinModule.cargado) { window.filtrarDesins(); return; }

  // Progress bar
  const bar = document.getElementById('ds-progress-bar');
  if (bar) { bar.style.width = '20%'; }

  try {
    const isAdmin = window.currentProfile?.rol === 'admin';
    const nombre  = window.currentProfile?.nombre || '';

    let allRows = [];
    let from = 0;
    const PAGE = 500;

    while (true) {
      let q = sb
        .from('v_ordenes_con_sla')
        .select('*')
        .eq('tipo', 'desinstalacion')
        .order('updated_at', { ascending: false })
        .range(from, from + PAGE - 1);

      if (!isAdmin && nombre) {
        q = q.ilike('operador_id', '%' + nombre.split(' ')[0] + '%');
      }

      const { data: pg, error } = await q;
      if (error) throw error;
      if (!pg || pg.length === 0) break;
      allRows.push(...pg);
      if (bar) bar.style.width = Math.min(90, 20 + allRows.length / 20) + '%';
      if (pg.length < PAGE) break;
      from += PAGE;
    }

    DesinModule.datos   = allRows;
    DesinModule.filtrados = allRows;
    DesinModule.cargado = true;

    if (bar) bar.style.width = '100%';

    // Actualizar badge sidebar
    dsActualizarBadge(allRows.length);

    // Popular selects de filtros
    dsPopularFiltros(allRows);

    // Render
    window.filtrarDesins();

    // KPIs
    if (typeof dsCargarKPIs === 'function') dsCargarKPIs();
    if (typeof dsGestion_ActualizarKPI === 'function') dsGestion_ActualizarKPI(allRows);

    console.log(`[Desinstalaciones] Cargadas: ${allRows.length} OTs`);

  } catch (err) {
    console.error('[Desinstalaciones] Error:', err.message);
    tbody.innerHTML = `<tr><td colspan="16" style="text-align:center;padding:40px;color:var(--red)">⚠ Error: ${err.message}</td></tr>`;
  }
};

// ── Popular selects de filtros ────────────────────────────────
function dsPopularFiltros(datos) {
  const respSel  = document.getElementById('ds-f-resp');
  const estSel   = document.getElementById('ds-f-estado');
  const zonaSel  = document.getElementById('ds-f-zona');

  if (respSel) {
    const resps = [...new Set(datos.map(o => o.responsable).filter(Boolean))].sort();
    const cur = respSel.value;
    respSel.innerHTML = '<option value="">Todos</option>';
    resps.forEach(r => respSel.innerHTML += `<option value="${r}"${r===cur?' selected':''}>${r}</option>`);
  }

  if (estSel) {
    const ests = [...new Set(datos.map(o => o.estado).filter(Boolean))].sort();
    const cur = estSel.value;
    estSel.innerHTML = '<option value="">Todos</option>';
    ests.forEach(e => estSel.innerHTML += `<option value="${e}"${e===cur?' selected':''}>${e}</option>`);
  }

  if (zonaSel) {
    const zonas = ['CABA','Zona Norte','Zona Sur','Zona Oeste','Fuera AMBA','Sin zona'];
    const cur = zonaSel.value;
    zonaSel.innerHTML = '<option value="">Todas</option>';
    zonas.forEach(z => zonaSel.innerHTML += `<option value="${z}"${z===cur?' selected':''}>${z}</option>`);
  }
}

// ── dsLimpiarFiltros ──────────────────────────────────────────
window.dsLimpiarFiltros = function() {
  ['ds-buscar','ds-f-resp','ds-f-estado','ds-f-zona','ds-f-sla','ds-f-gestion','ds-f-status-gestion']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  window._dsLogFiltro = '';
  window._dsFiltroGrupo = '';
  window.filtrarDesins();
};

// Exponer _dsLogFiltro como window para compatibilidad con dsFiltrarLogistica()
window._dsLogFiltro = '';

// ── dsAbrirModal — abre el modal de detalle de OT ────────────
window.dsAbrirModal = async function(id, otNum) {
  const modal = document.getElementById('dsModalOT');
  if (!modal) return;
  const ot = DesinModule.datos?.find(x => x.id === id || x.ot === otNum);
  if (!ot) return;

  const s = (elId, val) => { const el = document.getElementById(elId); if (el) el.textContent = val ?? '—'; };
  s('ds-m-ot',            ot.ot);
  s('ds-m-comercio',      ot.comercio || ot.cuenta);
  s('ds-m-cuenta',        ot.cuenta);
  s('ds-m-estado',        ot.estado);
  s('ds-m-resp',          ot.responsable);
  s('ds-m-logistica',     ot.logistica);
  s('ds-m-ciudad',        ot.ciudad);
  s('ds-m-zona',          typeof dsGetZona === 'function' ? dsGetZona(ot) : ot.zona);
  s('ds-m-calle',         ot.calle || ot.direccion);
  s('ds-m-provincia',     ot.provincia);
  s('ds-m-cp',            ot.cp);
  s('ds-m-contacto',      ot.contacto);
  s('ds-m-horario',       ot.horario);
  s('ds-m-motivo',        ot.motivo || ot.motivo_desinstalacion);
  s('ds-m-obs',           ot.observacion_estado || ot.observaciones);
  s('ds-m-gestion',       ot.gestion_retiros);
  s('ds-m-status-gestion',ot.status_gestion);
  s('ds-m-gest',          ot.gestion_retiros);
  s('ds-m-fecha',         ot.fecha_asignacion);

  modal._otId  = id;
  modal._otNum = otNum;
  modal.style.display = 'flex';
};

console.log('[Desinstalaciones] Módulo cargado ✓');