# ALLEATA OPS — Informe de Sesión
**Fecha:** Lunes 23 de marzo de 2026  
**Duración:** ~6 horas  
**Versión final producida:** index.html v2.0.6

---

## ✅ Resumen Ejecutivo

Sesión de arquitectura, desarrollo e integración completa. Se diseñó e implementó el módulo de Desinstalaciones dentro de Alleata Ops, unificando dos sistemas previamente separados (Supabase para AMBA y Google Sheets para Interior) en una única base de datos Supabase. Se resolvió una causa raíz estructural en el HTML del portal que hacía que la tabla de Envíos fuera visible en todos los módulos.

---

## 🏗️ Arquitectura definida

### Decisiones estratégicas
- **Salida de Google Sheets**: el sistema `distri.html` (portal de distribuidores) migra completamente a Supabase. Una sola fuente de verdad para todas las OTs.
- **Tabla unificada `ordenes_trabajo`**: altas y desinstalaciones conviven en la misma tabla, diferenciadas por el campo `tipo` (`alta` | `desinstalacion`).
- **SLA parametrizable**: tabla `sla_config` con umbrales por zona y tipo. Editable desde el portal sin tocar código.
- **Vista `v_ordenes_con_sla`**: calcula `dias_transcurridos` y `sla_estado` (`verde` / `alerta` / `critico` / `cerrada` / `sin_asignar`) directamente en Postgres.
- **`operador_id` provisional**: usa el nombre del operador (Angel, Andres, Gonzalo) hasta que Salesforce implemente la asignación automática.

---

## 🗄️ Base de Datos — Cambios ejecutados en Supabase

### Tablas creadas
| Tabla | Descripción |
|---|---|
| `ordenes_trabajo` | OTs unificadas (altas + desinstalaciones) |
| `distribuidores` | Reemplaza hoja de Google Sheets. Auth por `access_token` |
| `eventos_ot` | Log de cambios de estado con actor y timestamp |
| `sla_config` | Umbrales SLA por tipo y zona (parametrizables) |

### Vista creada
| Vista | Descripción |
|---|---|
| `v_ordenes_con_sla` | OTs con `dias_transcurridos` y `sla_estado` calculados en Postgres |

### Valores SLA por defecto cargados
| Tipo | Zona | Alerta | Crítico |
|---|---|---|---|
| desinstalacion | AMBA | 5d | 10d |
| desinstalacion | interior | 10d | 20d |
| alta | AMBA | 5d | 10d |
| alta | interior | 7d | 15d |

### Seed de prueba
- **30 OTs reales** del archivo `Desinstalaciones_Pendientes_3_3_26.xlsx` de Salesforce
- 10 OTs por operador: Angel, Andres, Gonzalo
- Fechas de asignación variadas para probar el semáforo SLA
- Resultado verificado: Andres 5 críticos / 1 alerta / 4 verdes · Angel 3/3/4 · Gonzalo 3/4/3

---

## 🔧 Módulo Desinstalaciones — index.html

### Cambios al portal (v1.9.7 → v2.0.6)

| Versión | Cambio |
|---|---|
| v1.9.8 | Módulo Desinstalaciones agregado al nav y al portal |
| v1.9.8 | Devoluciones eliminado del nav y del dashboard |
| v1.9.8 | `MOD_INFO` y `goTo()` actualizados |
| v1.9.9 | Fix `SyntaxError` en `dsArmarPills()` (comillas en innerHTML) |
| v2.0.0 | `dsArmarPills()` reescrita con `createElement` — sin escaping |
| v2.0.1 | Fix `showApp()`: null check en `envFecha` |
| v2.0.1 | Fix `loadBadges()`: null check en `nb-devs` (eliminado con Devoluciones) |
| v2.0.1 | Fix `goTo()`: `visibility:hidden` + `position:absolute` en módulos inactivos |
| v2.0.2 | Fix `forEach` en `showApp`: `devoluciones` → `desinstalaciones` + null check |
| v2.0.3 | CSS `.module{display:none!important}` para ganar sobre style inline de JS |
| v2.0.4 | CSS `.module.active{display:block!important}` — ambas reglas con `!important` |
| v2.0.5 | `goTo()` simplificado: `removeAttribute('style')` + confía en CSS |
| **v2.0.6** | **Fix causa raíz: `</div>` extra cerraba `mod-envios` prematuramente. Los filtros, barra PRE-COLECTA y `enviosTable` estaban sueltos en `div.content`, siempre visibles** |

### Causa raíz del bug principal
El HTML original tenía un `</div>` de más al final de `mod-envios`. Eso hacía que el módulo cerrara antes de tiempo, dejando los filtros, la barra "PRE-COLECTA ALLEATA" y la tabla `enviosTable` directamente dentro de `div.content` — fuera de cualquier `.module`. Por eso eran visibles en todos los módulos independientemente del CSS o JS aplicado. El fix fue quitar el `</div>` extra y mover el cierre del módulo al lugar correcto.

### Funcionalidades del módulo Desinstalaciones
- **KPIs** en tiempo real: Total, Críticos 🔴, Alerta 🟡, En término 🟢 (clickeables como filtro)
- **Filtros**: texto libre, estado, zona (AMBA/Interior), SLA, pills de operador (dinámicas)
- **Tabla** con 8 columnas ordenables: OT, Comercio, Ciudad/Zona, Logística, Operador, Estado, SLA, Días
- **Modal de detalle**: barra SLA coloreada, todos los datos del comercio, cambio de estado con 4 opciones, campo de observaciones
- **Log automático** en `eventos_ot` al guardar cambios
- **Badge en el nav** con conteo total de desinstalaciones

---

## 📊 Importador de CSV Salesforce

Archivo generado: `importar_desinstalaciones.js`

- Lee el `.xlsx` exportado de Salesforce (estructura real del archivo analizado)
- Mapea columnas SF → Supabase (`WorkOrderNumber` → `ot`, `Logistica__c` → `logistica`, etc.)
- Detecta zona automáticamente: `CABA/GBA` → `AMBA`, `PBA/INTERIOR` → `interior`
- Clasifica logística: ALLEATA + EXPRESS METROPOLITANA = gestión propia, resto = distribuidor externo
- Upsert por número de OT — re-importaciones no duplican
- **159 OTs con logística "Pendiente de completar"** — van a cola "sin asignar"

### Distribución real del archivo (1490 OTs · 3 mar 2026)
| Zona SF | OTs | Zona interna |
|---|---|---|
| INTERIOR | 1146 | interior |
| GBA | 236 | AMBA |
| PBA | 68 | interior |
| CABA | 40 | AMBA |

---

## ⏳ Pendientes

| Prioridad | Tarea |
|---|---|
| Alta | Subir archivos actualizados al repo GitHub (index.html v2.0.6) |
| Alta | Implementar botón "Importar CSV" en tab Config del portal |
| Alta | Agregar Ally a grupos reales (Gonzalo, Andres, Angel) → obtener Group IDs |
| Alta | Salesforce: implementar asignación de `operador_id` en las OTs |
| Media | API Correo Argentino tracking — esperar respuesta del ejecutivo |
| Media | Portal del distribuidor (`distri.html`) → migrar a Supabase (reemplaza Google Sheets) |
| Media | RLS en Supabase: auth por token para el portal del distribuidor |
| Baja | Agregar módulo Desinstalaciones al dashboard home (card) |
| Baja | Notificaciones WhatsApp via Ally cuando SLA cambia a crítico |
| Baja | Sacar texto "Hoja de Ruta — Pre-Colecta" del card de Logística Alleata |
| Baja | Módulo mobile completo (Envíos, Hoja de Ruta, Evidencia) |

---

## 📦 Archivos para Deployar

| Archivo | Repo | Estado |
|---|---|---|
| `index.html` v2.0.6 | alleata-ops | ⬆️ Pendiente subir |
| `importar_desinstalaciones.js` | alleata-ops | ⬆️ Pendiente integrar en Config |
| `EJECUTAR_EN_SUPABASE.sql` | — | ✅ Ya ejecutado |

---

## 🔑 Credenciales y referencias

- **Supabase proyecto**: `njkstpfmcfhqxdadqbdy.supabase.co`
- **GitHub Pages**: `marcevsanti-ux.github.io/alleata-ops/`
- **Railway (alleata-agent)**: activo y funcionando, logs normales al 23 mar 2026

---

*Generado automáticamente al cierre de sesión · Alleata Ops Portal · 23 mar 2026*
