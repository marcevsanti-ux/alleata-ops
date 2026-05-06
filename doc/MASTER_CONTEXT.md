# ALLEATA OPS — MASTER CONTEXT para IA

**Última actualización:** Mayo 2026  
**Repositorio:** https://github.com/marcevsanti-ux/alleata-ops  
**Portal live:** https://marcevsanti-ux.github.io/alleata-ops/

---

## 1. QUÉ ES ALLEATA OPS

Portal operativo/logístico para **Andrés Moretti e Hijos S.A.**  
No es un demo. Es **producción real** usada por:

- Marcelo Santillán (admin/desarrollo)
- Gonzalo Marvaldi (operador)
- Andres Veyga (operador)
- Angel Flores (operador)
- Luciana Galvao (admin)
- Marcelo Jiménez (logística)
- Distribuidores externos (vía `distri.html`)

---

## 2. STACK TÉCNICO (confirmado)

| Capa | Tecnología | Notas |
|------|------------|-------|
| Frontend | HTML/CSS/JS vanilla | GitHub Pages |
| Backend/Agente | Node.js | Railway (`alleata-agent`) |
| Base de datos | Supabase (PostgreSQL) | Proyecto `njkstpfmcfhqxdadqbdy` |
| WhatsApp | WASender | Sesión `alleata-ops`, número +5491127013661 |
| IA desarrollo | Claude + ChatGPT | Coordinación multiagente |
| OCR SIMs | Gemini 2.0/2.5 Flash | vía Edge Function o directo |
| Tracking CA | Edge Function `ca-proxy` + wsFacade.php | API oficial pendiente |

---

## 3. REGLAS CRÍTICAS (NO VIOLAR)

| # | Regla | Por qué |
|---|-------|---------|
| 1 | **NO reemplazar `index.js` completo** | El agente Railway tiene múltiples endpoints críticos |
| 2 | **NO usar axios directo para WhatsApp** | Usar `sendMessage()` desde `wasender.js` |
| 3 | **NO cambiar nombres reales de tablas** | Ej: `ally_grupos` ✅ `ally_groups` ❌ |
| 4 | **NO tocar `scheduler.js` sin entender** | Tiene horarios y automatizaciones productivas |
| 5 | **Salesforce → empezar con archivos nuevos** | Usar `SF_ENV=uat` primero |

---

## 4. MÓDULOS PRINCIPALES DEL PORTAL

| Módulo | Fuente de datos | Quién lo usa |
|--------|----------------|--------------|
| **Dashboard** | KPIs desde Supabase | Todos |
| **SIMs** | Tabla `sims` (6.878 registros) | Todos (OCR) |
| **Envíos** | Tabla `envios` | Admin, Operadores, Logística |
| **Desinstalaciones** | Vista `v_ordenes_con_sla` | Admin, Operadores |
| **Distribuidores** | Tabla `distribuidores` | Solo Admin |
| **Horas** | Tabla `horas` | Todos |
| **Ajustes** | Tablas `profiles`, `sims`, `configuracion` | Solo Admin |

---

## 5. AGENTE ALLY (WhatsApp)

### Grupos activos

| Grupo | Group ID | Propósito |
|-------|----------|-----------|
| TEST OPS | `120363424299090366@g.us` | Pruebas |
| Alleata-Ops Intelligence | `120363429218714233@g.us` | Reporting ejecutivo |
| Tesorería Moretti | (pendiente 22/04) | Cheques rechazados |

### Comandos disponibles en Ops Intelligence

| Comando | Respuesta |
|---------|-----------|
| `AYUDA` | Menú completo |
| `GASTOS LOGISTICA` | Costos por logística y mes |
| `STATUS ENVIOS` | Conteo por estado |
| `SLA` | Desinstalaciones por operador |
| `STATUS DEVOLUCIONES` | Devoluciones por estado |
| `OT XXXXX` | Consulta OT (envíos + desinstalaciones) |
| `Credencial OT XXXXX` | Datos de terminal |

---

## 6. INTEGRACIÓN CORREO ARGENTINO

### Estado actual (Mayo 2026)

| Endpoint | Estado | Notas |
|----------|--------|-------|
| `wsFacade.php` | ✅ Operativo | Reverse engineering, público |
| `POST /token` (API oficial) | ✅ Operativo | JWT obtenido |
| `POST /rates` | ✅ Operativo | Cotizador en tiempo real |
| `POST /shipping/import` | ⏳ Pendiente | Esperando habilitación CA |
| `GET /shipping/tracking` | ⏳ Pendiente | Usamos wsFacade mientras |

### Credenciales API oficial (producción)
- **Usuario:** MorettiAPI
- **Password:** Pelota22+
- **Customer ID:** 0001226778
- **URL:** `https://api.correoargentino.com.ar/micorreo/v1`

### Edge Function `ca-proxy`
- **Ubicación:** Supabase Edge Functions
- **Método:** POST /token → GET /shipping/tracking
- **CORS:** Permitido desde `marcevsanti-ux.github.io`

---

## 7. LOGÍSTICA ALLEATA (propia)

### Reglas operativas

| Regla | Valor |
|-------|-------|
| Ámbito | AMBA exclusivamente |
| Distancia máxima | ~70km desde California 2082, Barracas |
| Operador | Marcelo Jiménez — una zona por día |
| Máximo OT por hoja de ruta | 10 |
| OTs sobrantes | Estado = "Despachado" |

### Zonas AMBA

| Zona | Color | Municipios |
|------|-------|------------|
| CABA | Azul | Ciudad Autónoma de Buenos Aires |
| Zona Norte | Verde | San Isidro, Vicente López, Tigre, Pilar |
| Zona Sur | Amarillo | Lomas de Zamora, Quilmes, La Plata |
| Zona Oeste | Violeta | La Matanza, Morón, Hurlingham |

---

## 8. KPI "EXITOSA" (fórmula exacta)

Contabiliza cuando se cumple **cualquiera** de:

1. `estado = 'Terminal recuperada'`
2. `estado = 'Exitosa' AND cerrada_desde_sf = false`

---

## 9. TABLAS CRÍTICAS DE SUPABASE

| Tabla | Propósito | Columnas clave |
|-------|-----------|----------------|
| `envios` | OTs logística directa | sf_id, estado, logistica, responsable |
| `ordenes_trabajo` | OTs desinstalación | id, estado, sla_status |
| `v_ordenes_con_sla` | Vista con SLA calculado | dias_transcurridos, zona |
| `sims` | Base SIMs CLARO | serie, linea, estado |
| `distribuidores` | Distribuidores externos | lat, lon, radio, ots_cache |
| `distri_reportes` | Estados por distribuidor | distri_id, sf_id, estado, fecha_retiro |
| `ally_grupos` | Grupos WhatsApp | group_id, tipo, activo |
| `ally_reglas` | Reglas notificación | estado_ot, grupo_id, mensaje_template |
| `configuracion` | Config global | id, valor (ej: sla_correo_argentino_dias) |

---

## 10. DOCUMENTACIÓN HISTÓRICA

Los informes de sesión detallados están en `/doc`:

| Archivo | Qué cubre |
|---------|-----------|
| `ALLEATA_OPS_SESION_16ABR2026.md` | Tracking CA, auto-tracking, estados |
| `ALLEATA_OPS_SESION_17ABR2026.md` | SLA, KPIs, backfill, config programable |
| `ALLEATA_OPS_SESION_21ABR2026.md` | Cotizador CA, portal.alleata.com.ar |
| `ALLEATA_OPS_SESION_20mar2026.md` | Ally, notificaciones, QR, zonas |
| `ALLEATA_OPS_SESION_23mar2026.md` | Config Ally, distribuidores, mobile |
| `Alleata ops sesion 25mar2026.md` | Import Excel, Ops Intelligence |
| `ALLEATA_OPS_INFORME_08ABR2026.md` | Estado general del portal |
| `TESORERIA_MORETTI_PROJECT_SUMMARY.md` | Proyecto independiente (cheques) |

---

## 11. PENDIENTES PRIORITARIOS (Mayo 2026)

| # | Tarea | Responsable |
|---|-------|-------------|
| 1 | Cerrar Ally en grupo Desinstalaciones | Marcelo |
| 2 | Corregir mensajes grupo Sales | Marcelo |
| 3 | Finalizar logística Alleata (Marcelo + Ignacio) | Marcelo |
| 4 | Obtener credenciales productivas CA | Mariángeles (CA) |
| 5 | Implementar `/shipping/import` cuando esté disponible | Marcelo |
| 6 | Reunión devs Salesforce (Connected App) | Pendiente |

---

## 12. CÓMO DEBE TRABAJAR UNA IA EN ESTE PROYECTO

**ANTES de generar código:**

1. Leer este MASTER_CONTEXT.md primero
2. Si el problema involucra un módulo específico, leer el informe de sesión correspondiente en `/doc`
3. Validar que la solución respete las **reglas críticas** (sección 3)
4. Priorizar **cambios incrementales** sobre refactors masivos
5. Preservar **backward compatibility** y pensar en **rollback**

**NO:**

- Reemplazar `index.js` completo
- Usar axios directo para WhatsApp
- Cambiar nombres de tablas
- Tocar `scheduler.js` sin entenderlo
- Asumir que DEV no es productivo (lo es)

---

## 13. CONTACTO

**Owner:** Marcelo Santillán  
**Email:** marcelos@moretti.com.ar  
**WhatsApp:** +5491165117989

---

*Este documento es el punto de entrada para cualquier IA que necesite entender Alleata Ops.  
Para detalles específicos, consultar los informes de sesión en `/doc`.*
