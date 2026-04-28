// ================================
// CONFIG
// ================================

// Usar ENV si existe, sino fallback al link que pasaste
const SF_DESINSTALACIONES_REPORT =
  process.env.SF_DESINSTALACIONES_REPORT ||
  "https://alleata.lightning.force.com/lightning/r/Report/00ORm00000CRTa5MAH/view";


// ================================
// ABRIR REPORTE EN SALESFORCE
// ================================
function abrirReporteSF() {
  try {
    console.log("Abriendo reporte de Salesforce...");
    window.open(SF_DESINSTALACIONES_REPORT, "_blank");
  } catch (error) {
    console.error("Error al abrir reporte SF:", error);
  }
}


// ================================
// LIMPIAR TABLA (BACKEND CALL)
// ================================
async function limpiarDesinstalaciones() {
  try {
    const confirmacion = confirm(
      "⚠️ Esto borrará TODA la base de desinstalaciones. ¿Continuar?"
    );

    if (!confirmacion) return;

    const response = await fetch("/api/desinstalaciones/clear", {
      method: "POST",
    });

    const result = await response.json();

    console.log("Base limpiada:", result);
    alert("✅ Base de desinstalaciones limpiada correctamente");
  } catch (error) {
    console.error("Error limpiando base:", error);
    alert("❌ Error al limpiar la base");
  }
}


// ================================
// IMPORTAR ARCHIVO
// ================================
async function importarArchivo(file) {
  try {
    const formData = new FormData();
    formData.append("file", file);

    console.log("Importando archivo...");

    const response = await fetch("/api/desinstalaciones/import", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    console.log("Resultado importación:", result);

    alert(`✅ Importación completa: ${result.rows} filas cargadas`);
  } catch (error) {
    console.error("Error en importación:", error);
    alert("❌ Error al importar archivo");
  }
}


// ================================
// EVENTOS UI
// ================================
document.addEventListener("DOMContentLoaded", () => {
  console.log("Módulo desinstalaciones listo");

  // Botón ver reporte SF
  const btnReporte = document.getElementById("btn-ver-reporte");
  if (btnReporte) {
    btnReporte.addEventListener("click", abrirReporteSF);
  }

  // Botón limpiar base
  const btnLimpiar = document.getElementById("btn-limpiar");
  if (btnLimpiar) {
    btnLimpiar.addEventListener("click", limpiarDesinstalaciones);
  }

  // Input file
  const inputFile = document.getElementById("input-file");
  if (inputFile) {
    inputFile.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        console.log("Archivo seleccionado:", file.name);
        importarArchivo(file);
      }
    });
  }
});
