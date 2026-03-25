# ALLEATA OPS — Informe de Sesión
**Fecha:** Martes 25 de marzo de 2026  
**Duración:** ~8 horas  
**Versiones producidas:** index.html v2.2.2 · index.js v1.6.2 · supabase.js (fix) · wasender.js

---

## ✅ Resumen Ejecutivo

Sesión de desarrollo intensiva. Se resolvieron bugs críticos de módulos, se implementaron nuevas funcionalidades de importación de datos, se lanzó el grupo **Alleata-Ops Intelligence** con reporting ejecutivo por WhatsApp, y se sentaron las bases del sistema de notificaciones a propietarios de cuenta.

---

## 🔧 Fixes y Mejoras por Archivo

### `index.html` — v1.9.7 → v2.2.2

| Versión | Cambio |
|---------|--------|
| v2.0.9 | Fix módulo Desinstalaciones: agregado a MODS_DEF, createModPills, editModPills y sidebar lock |
| v2.1.0 | Default modulos incluye desinstalaciones para usuarios nuevos y fallback |
| v2.1.1 | Botón 🔄 Actualizar eliminado de Envíos y Desinstalaciones; filtro por operador en Desinstalaciones |
| v2.1.2 | Fix filtro Desinstalaciones: usa primer nombre ("Gonzalo" no "Gonzalo Marvaldi") |
| v2.1.3 | Barra de contadores por estado en Desinstalaciones (Total / Pendientes / En Proceso / Despachadas / Exitosas / Extraviadas) con botón Listar |
| v2.1.4 | Importación Pre-Colecta: mapeo completo de campos nuevos (Terminal, Simcard, Cajero, CUIT, Email, Horario, Contacto) |
| v2.1.5 | Fix SyntaxError: declaraciones duplicadas de iContacto/iHorario/iCalle |
| v2.1.6 | Fix DATOS TERMINAL: update separado post-upsert para siempre actualizar campos de terminal |
| v2.1.7 | Fix iSFId: soporta "Id. de orden de trabajo" y "Id. de orden" (dos formatos de Excel) |
| v2.1.8 | Estado default = Pre-Colecta (no "En tránsito") para OTs sin observaciones |
| v2.1.9 | Estado preservado en OTs existentes: solo se setea en OTs nuevas (null) |
| v2.2.0 | Fix filas vacías en importación: skip de subtotales y filas incompletas |
| v2.2.1 | Módulo Config. Ally: nav item, routing, MOD_INFO (solo Admin) |
| v2.2.2 | Módulo Config. Ally completo: 3 solapas (Contactos / Grupos / Reglas) con CRUD |

---

### `index.js` — v1.5.1 → v1.6.2 (Railway / alleata-agent)

| Versión | Cambio |
|---------|--------|
| v1.5.1 | Regex acepta "Credencial" y "Credenciales" OT XXXXX |
| v1.5.2 | Ally incluye 🚚 Logística en respuesta de OT |
| v1.5.3 | Ally incluye 🏦 Propietario cta en respuesta de OT |
| v1.6.0 | Grupo Alleata-Ops Intelligence: módulo completo de reporting ejecutivo |
| v1.6.1 | Fix scope: OPS_INTEL_GROUP, conversaciones, MESES, LOGISTICAS a nivel global |
| v1.6.2 | Fix handleOpsIntel y todas las funciones de reporte faltantes (reporteGastos, reporteStatusEnvios, reporteSLA, reporteDevoluciones) |

---

### `supabase.js` — fix getEnvioByOT

- `.single()` → `.limit(1).maybeSingle()` — no lanza error cuando no encuentra o hay múltiples resultados
- Padding automático: `"19994"` → busca `"00019994"` también

---

## 📱 Grupo Alleata-Ops Intelligence

**Group ID:** `120363429210714233@g.us`  
**Variable Railway:** `OPS_INTEL_GROUP_ID`

### Comandos disponibles:
| Comando | Respuesta |
|---------|-----------|
| `AYUDA` | Menú completo de comandos |
| `GASTOS LOGISTICA` | Flujo 2 pasos → logística → mes → resumen con costos |
| `STATUS ENVIOS` | Conteo por estado del lote completo |
| `SLA` | Desinstalaciones crítico/alerta/verde por operador |
| `STATUS DEVOLUCIONES` | Devoluciones por estado |
| `OT XXXXX` | Consulta OT (envíos + desinstalaciones) |
| `Credencial OT XXXXX` | DATOS TERMINAL (terminal, simcard, cajero, contraseña) |
| `CANCELAR` | Resetea flujo activo |

---

## 🗄️ Base de Datos — Columnas y Tablas Nuevas

### Columnas agregadas a `envios`:
```sql
usuario_cajero, password_cajero, nro_terminal, nro_simcard,
cuit, email_comercio, motivo_desinstalacion,
cuenta_seleccionada, propietario_cuenta (DEFAULT 'Jose Luis Cingolani')
```

### Tablas nuevas:
- `contactos` — personas con WhatsApp, rol, unidad de negocio
- `ally_grupos` — grupos WhatsApp con Group ID y tipo
- `ally_reglas` — reglas de notificación por estado de OT

### Datos iniciales insertados:
- Contactos: Angel Flores, Gonzalo Marvaldi, Andres Veyga, Luciana Galvao, Jose Luis Cingolani
- Grupos: TEST OPS, Alleata-Ops Intelligence
- Reglas: Entregado/Fallido/Devuelto → propietario_cuenta (activas); En tránsito (inactiva)

---

## 🔄 Flujo de Importación Excel (mejorado)

1. Detecta automáticamente el formato (SF clásico o Pre-Colecta todas las logísticas)
2. Filtra solo CORREO ARGENTINO, ignora ALLEATA/CABIFY/etc.
3. Skip de subtotales y filas incompletas
4. Upsert por `sf_id` — no duplica OTs existentes
5. **Nuevo:** Update separado de DATOS TERMINAL — siempre actualiza aunque la OT exista
6. Estado = Pre-Colecta para OTs nuevas; preserva estado manual en OTs existentes
7. `propietario_cuenta` = "Jose Luis Cingolani" en todas las OTs

---

## ⏳ Pendientes

| Prioridad | Tarea |
|-----------|-------|
| Alta | Fix Config. Ally — módulo no renderiza (pendiente debug consola) |
| Alta | Agregar Ally a grupos reales (Gonzalo, Angel, Andres) |
| Alta | Reunión devs Salesforce — Connected App + sandbox credentials |
| Media | API Correo Argentino tracking — esperar respuesta ejecutivo parámetros |
| Media | Notificaciones a propietario de cuenta al cambiar estado OT |
| Media | Campo "Cuenta Seleccionada" — agregar cuando SF lo incluya en el Excel |
| Baja | Sacar texto "Hoja de Ruta — Pre-Colecta" del card Logística Alleata |
| Baja | Módulo mobile completo (Envíos, Hoja de Ruta, Evidencia) |

---

## 📦 Archivos para Deployar

| Archivo | Repo | Estado |
|---------|------|--------|
| `index.html` v2.2.2 | alleata-ops | ⬆️ Subido |
| `index.js` v1.6.2 | alleata-agent | ⬆️ Subido |
| `supabase.js` | alleata-agent | ⬆️ Subido |

---

## 🏗️ Arquitectura Ally — Visión Target

```
CA cambia estado OT
        ↓
Railway recibe webhook CA
        ↓
Actualiza estado en Supabase
        ↓
Notifica grupo OPS (ya funciona)
        ↓
Busca propietario en tabla contactos
        ↓
Notifica propietario por WhatsApp personal
```

---

*Generado automáticamente al cierre de sesión · Alleata Ops Portal · 25 mar 2026*
