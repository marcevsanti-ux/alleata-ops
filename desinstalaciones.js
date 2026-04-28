// ================================
// CONFIG
// ================================

// CORREGIDO: valor directo — process.env no existe en el browser
const SF_DESINSTALACIONES_REPORT =
  "https://alleata.lightning.force.com/lightning/r/Report/00ORm00000CRTa5MAH/view";


// ================================
// ABRIR REPORTE EN SALESFORCE
// ================================
function abrirReporteSF() {
  try {
    console.log("Abriendo reporte de Salesforce...");
    window.open(SF_DESINSTALACIONES_REPORT, "_blank", "noopener,noreferrer");
  } catch (error) {
    console.error("Error al abrir reporte SF:", error);
  }
}


// ================================
// EVENTOS UI
// ================================
// NOTA: importarArchivo() y limpiarDesinstalaciones() fueron eliminadas.
// El import vive en importDesinstalaciones(event) dentro de index.html
// y opera directo contra Supabase con SheetJS — no hay backend intermedio.
// El botón btn-ver-reporte abre el reporte SF en una pestaña nueva.
// ================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("Módulo desinstalaciones listo");

  const btnReporte = document.getElementById("btn-ver-reporte");
  if (btnReporte) {
    btnReporte.addEventListener("click", abrirReporteSF);
  } else {
    // En index.html el link ya tiene id="btn-ver-reporte" como <a href>,
    // este bloque es por si el archivo se carga en otro contexto
    console.warn("[Desinstalaciones] btn-ver-reporte no encontrado en el DOM");
  }
});
