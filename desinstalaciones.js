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
