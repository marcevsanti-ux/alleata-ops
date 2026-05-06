# ALLEATA OPS + ALLY AGENT — Informe de Sesión
**Fecha:** 06 de mayo de 2026 | **Versión portal:** v2.7.1 | **Versión agente:** actualizado

---

## Resumen ejecutivo

Sesión de desarrollo y corrección intensiva. Se resolvió la caída de Ally (causada por ChatGPT), se implementaron múltiples mejoras al portal de Desinstalaciones, y se dejó el sistema de notificaciones WhatsApp funcionando correctamente.

---

## 1. Incidente — Ally caído (resuelto)

ChatGPT reemplazó `index.js` (480 líneas) con una versión de 80 líneas que:
- Perdió todos los módulos: automations, scheduler, processAllyCommand, endpoints
- Usaba `api.wasenderapi.com` con `WASENDER_API_KEY` (incorrecto)
- No importaba `wasender.js`

**Solución:** Restaurado el `index.js` productivo completo con fixes adicionales:
- Soporte para evento `messages-group.received`
- Parsing extendido de texto (`data.message.conversation`)
- Logs de diagnóstico en startup y webhook

---

## 2. Estado del sistema Ally

### Webhook
- ✅ Recibe `messages.received` y `messages-group.received`
- ✅ Valida grupos contra tabla `ally_groups`
- ✅ Grupo "Desinstalaciones + Ally" (`120363426767067034@g.us`, type: `DESINSTALACIONES_OPERATIVO`)
- ✅ Grupo "Ally + Sales" (`120363429210714233@g.us`)
- ✅ Grupo "Ally + Ops" (`120363424299090366@g.us`) — agregado a ally_groups

### Scheduler (Railway)
```
Lun-Vie: 09:00, 13:00, 18:00 ART → CA Tracking
Lun-Vie: 09:04, 13:04, 18:04 ART → Ally Desinstalaciones broadcast
Sábado: 14:00, 14:04
```

Variables Railway confirmadas:
- `SCHEDULER_ENABLED=true`
- `ALLY_DESINSTALACIONES_ENABLED=true`
- `ALLY_DESINSTALACIONES_DRY_RUN=false`

---

## 3. Notificaciones WhatsApp — Estado

### Grupo Sales (`120363429210714233@g.us`)
- Motor: `allyAlertEngine.js` (escalamiento por tiempo)
- Nivel 1: primera detección → aviso inicial
- Nivel 2: ≥24h → 2do aviso
- Nivel 3: ≥48h → escalación
- **FIX sesión:** reglas SALES activadas con `trigger_type = 'alert_engine'`
- **FIX sesión:** `dispararReglaAlly` ahora busca en `['shipment_status_change', 'alert_engine']`

### Grupo Ops (`120363424299090366@g.us`)
- Regla: `Operaciones - OT entregada` → activa
- Condición corregida: `new_status = "Entregada"` (antes era "Entregado")
- Template corregido: saltos de línea reales (antes tenía `\r\n` literal)

### Grupo Desinstalaciones (`120363426767067034@g.us`)
- Eventos 1-4 del broadcast funcionando
- Confirmado en logs: `nuevas:6 envejecidas:0 sla_merchant_vencidos:0 en_proceso_ca:0`

---

## 4. Nuevo — Evento 4 broadcast Desinstalaciones

**Archivo:** `automations/allyDesinstalacionesBroadcast.js`

Lógica para OTs `En Proceso` + logística CA + `nro_seguimiento`:

- **Caso A:** Si `historia_ca` contiene `INGRESO AL CORREO` → manda al grupo:
  ```
  ✅ INGRESO A CORREO ARGENTINO
  📦 OT: {{ot}}
  🏪 {{cliente}}
  📅 Fecha ingreso: {{fecha_ingreso}}
  ➡️ Cambiar estado a: DESPACHADO
  ```

- **Caso B:** Si PREIMPOSICION + ≥5 días hábiles sin ingreso → manda:
  ```
  ⚠️ SLA MERCHANT VENCIDO — EN PROCESO
  📦 OT: {{ot}} · {{cliente}}
  📅 Pre-imposición: {{fecha}}
  ⏱ X días hábiles sin ingreso a CA
  ```

---

## 5. Portal Desinstalaciones — Mejoras v2.5.5 → v2.7.1

### v2.5.5 — Scripts de importación y funciones
- **Reconciliación post-import:** OTs no presentes en SF se marcan como `Entregada`
- **`dsGetZona` extendida:** distancia >70km → Fuera AMBA, listas ciudades por zona
- **Sucursales CA:** funciones `parsearPlantaCA`, `buscarSucursalCA`, `formatearSucursalCA` (requiere tabla `correo_sucursales_cache`)

### v2.5.6 — Fix reconciliación
- Compara por `sf_id` en lugar de `ot` (más exacto, sin problemas de padding/timing)

### v2.5.7 — KPIs separados
- TOTAL renombrado a **ACTIVAS** (excluye cerradas)
- Nuevo KPI **CERRADAS** (Entregada + Terminal recuperada + Exitosa + Cerrada)
- Click en cada KPI filtra la tabla correctamente

### v2.5.8 — PDF Geográfico
- Botón `📄 PDF` en panel Distribución Geográfica
- Header navy/teal, 5 KPIs, tabla localidades, footer con paginación
- Nombre: `alleata_geo_desinstalaciones_{{provincia}}_{{fecha}}.pdf`

### v2.5.9 — Fix reconciliación estados
- Excluye correctamente todos los estados terminales incluyendo `Reprogramar`

### v2.6.0 — Fix badge CA+AMBA y filtro activas/cerradas
- Badge solo aparece si distancia ≤70km (usa CP_COORDS)
- Filtro `__activas__` / `__cerradas__` en `filtrarDesins`

### v2.6.1 — Distancia con CP alfanumérico
- `calcDistancia` parsea CPs como `B1902` → `1902`
- Lupa 🔍 restaurada dentro de celda N° Seguimiento para CA
- `"en ruta de marce"` → muestra `interno` en cursiva

### v2.6.2 → v2.6.4 — CP_COORDS desde repo androdron
- 979 → 541 CPs confiables (droppados 438 con coords incorrectas)
- CABA: 449 CPs, GBA: 68 CPs, Interior verificado: 24 CPs
- Badge CA+AMBA: función `_dsBadgeCAAmba(ot)` separada del template literal

### v2.6.5 — Motivo Desinstalación (UI)
- Modal: campo `Motivo Desinstalación` antes de Observaciones
- Tabla: badge `📌 BAJA COMERCIAL` debajo del comercio
- `handleDesinstalacionesGroup.js`: SELECT + formatearOT incluyen motivo

### v2.6.6 → v2.7.1 — Fix importador motivo
- v2.6.6: punto y coma faltante en `iMotivoDes`
- v2.6.7: `col()` → `colAny()` (col() no existe en importador Desinstalaciones)
- v2.6.8: `undefined` → `null` en item (Supabase ignora undefined en upsert)
- v2.6.9: `Object.keys` cleanup no borra `null` (solo `undefined`)
- v2.7.0: campo faltaba en el `item` object del importador
- v2.7.1: `iMotivoDes` no estaba declarado en sección de columnas → `ReferenceError`

---

## 6. Columnas SQL ejecutadas en esta sesión

```sql
-- ordenes_trabajo
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS estado_ca TEXT;
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS historia_ca TEXT;
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS eventos_ca JSONB;
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS motivo_desinstalacion TEXT;

-- ally_groups — grupo Ops
INSERT INTO ally_groups (name, group_id, type, active)
VALUES ('Ally + Ops', '120363424299090366@g.us', 'ops', true)
ON CONFLICT (group_id) DO UPDATE SET active = true;

-- ally_notification_rules — fixes
UPDATE ally_notification_rules SET active = false
WHERE id = '43eb42ad-cc53-47c1-9b39-6c59c7a4f609'; -- URGENTE duplicada

UPDATE ally_notification_rules
SET condition = '{"new_status": "Entregada"}'::jsonb
WHERE id = '825f8a12-9b01-4acb-8c40-ec774a6bf6fc'; -- Ops: Entregado → Entregada

UPDATE ally_notification_rules
SET active = true, trigger_type = 'alert_engine'
WHERE id IN (
  '45f8f5bd-b5cd-42a3-b644-26065f372b83',
  '4197f411-6213-4bb8-b348-b2f3fbf1b42b',
  '1294981a-eca9-4c3d-8368-1128669c7293'
);

-- Template Ops corregido (sin \r\n)
UPDATE ally_notification_rules
SET message_template = '🎉 *OT {{ot}} entregada*
🧑‍🔧 Responsable: {{responsable}}
🏢 {{cuenta}}
🚚 Tracking: {{tracking}}
✅ *Estado CA: {{estado_ca}}*
📅 Fecha CA: {{fecha_ca}}
📌 Historial CA: {{historia_ca}}'
WHERE id = '825f8a12-9b01-4acb-8c40-ec774a6bf6fc';
```

---

## 7. Pendientes

| Item | Estado |
|---|---|
| Confirmar Sales/Ops en cron 9:00 de mañana | Pendiente — ver logs |
| Tabla `correo_sucursales_cache` poblar manualmente | Pendiente |
| Integración SF UAT — Nahuel habilitar Client Credentials | Pendiente |
| Contactos Sales en tabla `contactos` para menciones WA | Pendiente |
| `sfSyncChecker.js` — sync automático SF → Supabase | Pendiente |
| Templates Ally — rediseño formato con Deepseek | Pendiente |

---

## 8. Archivos modificados en esta sesión

### alleata-ops
- `index.html` → v2.7.1

### alleata-agent
- `index.js`
- `handleDesinstalacionesGroup.js`
- `automations/allyAlertEngine.js`
- `automations/allyDesinstalacionesBroadcast.js`
- `automations/processAllyRules.js`

---

## 9. Drive — ZIPs disponibles
- `alleata-agent-main.zip` → actualizado al cierre de sesión
- `alleata-ops-main.zip` → actualizado al cierre de sesión

Para retomar: *"Retomamos Alleata — levantá los repos del Drive"*

---

*Informe generado el 06 de mayo de 2026*
