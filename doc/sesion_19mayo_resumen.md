# ALLEATA OPS — Resumen de sesión 19/05/2026
**Portal:** v2.9.6 | **Agente:** v1.9.0 | **Para continuar en nuevo chat**

---

## Estado actual del proyecto

Sistema de automatización operativa con integración Salesforce bidireccional, CA Tracking automático con alertas WhatsApp, y agente Ally respondiendo consultas de OTs via WhatsApp según el grupo (SF directo u Ops, tabla envios para Sales).

---

## Arquitectura

```
GitHub Pages → index.html v2.9.6 (portal desktop)

Railway (alleata-agent-production.up.railway.app)
├── salesforce.js — Auth SF + sync + retry token automático
└── automations/
    ├── automationsRouter.js
    ├── caStatusChecker.js — PRODUCTIVO tabla envios (no tocar)
    ├── caStatusCheckerOne.js
    ├── caHtmlParser.js
    ├── sfCaTracker.js — CA Tracking sf_workorders + PATCH SF + alertas UAT
    ├── sfAllyResumen.js — resumen diario 18:05 → grupo Ops
    ├── processAllyCommand.js — routing por grupo (SF vs envios)
    ├── allyRateLimit.js
    ├── allyAlertEngine.js
    ├── scheduler.js
    └── formatEventosCA.js

Supabase (njkstpfmcfhqxdadqbdy.supabase.co)
├── envios — PRODUCTIVO, no tocar
├── sf_workorders — OTs desde SF (con estado_rollout, fecha_entrega_envio)
├── sf_sync_log — historial ejecuciones
├── sf_ca_tracking_history — historial CA
└── merchants_guias — guías temporales Envíos Merchants
```

---

## Cron scheduler

```
SF Sync      → cada 30 min (todos los días 07-22h ART)
CA Tracker   → automático post SF Sync
:00          → CA Tracking (tabla envios — PRODUCTIVO)
:04          → Ally Desinstalaciones
:06          → CA Tracking Desinstalaciones
18:05        → Resumen SF → grupo Ops
```

---

## Portal v2.9.6 — Módulo Envíos Merchants

Módulo temporal para seguimiento de guías CA del reporte "PROMESA DESPACHO" de SF.
- Tabla Supabase: `merchants_guias` (RLS abierta, compartida)
- Import Excel → upsert por sf_id
- Tracking individual y masivo
- Contacto + botón WhatsApp directo (web.whatsapp.com/send)
- Link directo al reporte SF
- **Se vuela cuando SF esté integrado al portal**

SQL ejecutado:
```sql
create table if not exists merchants_guias (
  id uuid primary key default gen_random_uuid(),
  sf_id text unique, ot text, cuenta text, track text,
  estado_ot text, ciudad text, obs text, contacto text,
  estado text default 'Sin datos',
  ultimo_evento text, ultimo_evento_fecha text,
  updated_at timestamptz, created_at timestamptz default now()
);
alter table merchants_guias enable row level security;
create policy "merchants_all" on merchants_guias for all using (true) with check (true);
```

---

## sfCaTracker.js — Cambios sesión 19/05

### Bug fix
- Eliminado `Observaciones__c` de ambos PATCH — ya no toca "Observaciones generales" nunca
- Solo escribe en `Observacion_sobre_estado_de_OT__c`

### Formato campo SF acordado
```
📦 EN TRÁNSITO | 2026-05-19
Últimos movimientos:
19-05-2026 10:56
LLEGADA AL CENTRO DE PROCESAMIENTO
CLOG CÓRDOBA
```
Solo el último evento. Emojis por estado:
| Estado | Emoji |
|---|---|
| Entregada | ✅ |
| En camino | 🚚 |
| En espera en sucursal | 🏪 |
| En tránsito | 📦 |
| Intento fallido | ⚠️ |
| Devuelto | 🔴 |
| Fallido | ❌ |

### Nuevo estado: Intento fallido
`DOMICILIO CERRADO` en estadoCA o `INTENTO DE ENTREGA` en historia → `Intento fallido`

### Alertas UAT — directo a Marcelo (5491165117989)
Se disparan cuando hay **cambio real** a estado problemático:
- `Intento fallido`
- `En espera en sucursal`
- `Devuelto`

Formato alerta:
```
⚠️ Alerta CA — OT 00019438
📌 Estado: Intento fallido
🏢 MELON SPORT WEAR
📍 Bahía Blanca, Buenos Aires
📦 Tracking: 00012267788P179C6I31101
📋 INTENTO DE ENTREGA — DOMICILIO CERRADO/1 VISITA
🕐 19-05-2026 13:50
👤 Responsable: Guillermo Cichero
```

Cuando pase a producción: reemplazar `ALERTA_UAT_NUMERO` por group ID de Sales.

### Columnas nuevas sf_workorders
```sql
alter table sf_workorders
  add column if not exists estado_rollout      text,
  add column if not exists fecha_entrega_envio timestamptz;
```

---

## Lógica de estados CA por tipo de OT

### Instalación
| Estado CA | Estado interno | Acción |
|---|---|---|
| PREIMPOSICION | Pendiente | — |
| INGRESO AL CORREO | En camino | observación SF |
| DOMICILIO CERRADO | Intento fallido | observación SF + alerta |
| EN ESPERA EN SUCURSAL | En espera en sucursal | observación SF + alerta |
| ENTREGADO | Entregada | PATCH SF Exitoso |
| DEVUELTO | Devuelto | observación SF + alerta |

### Rollout (dual tracking A=envío, B=devolución)

Proceso:
1. Terminal nueva (perfil Alleata) se envía con rótulo A
2. Dentro del paquete va rótulo B para que el cliente devuelva la terminal vieja
3. Desde entrega del rótulo A, cliente tiene **3 días hábiles (L-V)** para ingresar rótulo B al correo

| Situación | Estado rollout | PATCH SF |
|---|---|---|
| A en tránsito, B en PREIMPOSICION | En tránsito | solo observación |
| A entregado, B en PREIMPOSICION | Esperando devolución | observación + inicia countdown |
| A entregado, B con INGRESO AL CORREO | Devolución en camino | observación |
| A entregado, B entregado a Alleata | Exitoso | PATCH Status=Exitoso |
| A entregado, 3 días hábiles sin INGRESO B | Vencido | alerta a Marcelo |
| A falla (domicilio cerrado / devuelto) | → misma lógica Instalación | alerta |

Columnas Supabase:
- `estado_rollout` — estado específico proceso dual
- `fecha_entrega_envio` — fecha entrega rótulo A (base countdown)

### Desinstalación
**Pendiente definir** — reunión con ops.

---

## processAllyCommand.js — Routing por grupo

```
Ally + Sales (120363429210714233) → tabla envios (Supabase)
Ally + Ops   (120363424299090366) → SF directo
Chat privado                      → SF directo
```

Función `cmdConsultaOTenSB` — consulta tabla `envios`, responde con:
OT, tipo, estado, cuenta, propietario, responsable, ciudad, fecha, logística, tracking, estado CA.

---

## Ally — comandos WhatsApp (sin cambios)

| Input | Acción |
|---|---|
| `20244` / `OT 20244` / `estado 20244` | Ficha OT (SF o envios según grupo) |
| `sla 20244` | SLA detallado |
| `sla tandil` / `sla 7000` | SLA por localidad o CP |
| `credenciales 20244` | Usuario y contraseña cajero |
| `help` / `ayuda` | Menú |

---

## Grupos WhatsApp

| Grupo | Group ID | Fuente datos |
|---|---|---|
| Ally + Ops | 120363424299090366@g.us | SF directo |
| Ally + Sales | 120363429210714233@g.us | tabla envios |
| Desinstalaciones + Ally | 120363426767067034@g.us | ops |

---

## Pendientes próxima sesión

### Inmediatos
- [ ] Testear lógica Rollout con OT real (pedir que generen OT Rollout mañana)
- [ ] Validar alerta vencimiento 3 días hábiles
- [ ] Verificar respuesta Ally en grupo Sales con OT de tabla envios

### Lógica estados por tipo OT
- [ ] Desinstalación — definir con ops:
  - CA no pudo retirar → ¿qué estado SF?
  - ¿Cuántos intentos antes de cerrar como fallido?

### Alertas producción
- [ ] Cuando SF_ENV=prod: cambiar `ALERTA_UAT_NUMERO` por group ID Sales
- [ ] Definir si alertas van a Sales, Ops o ambos según tipo de OT

### Filtro problemas sfAllyResumen
- [ ] Excluir `estado_ca = Entregada`
- [ ] Umbral sin movimiento = 7 días hábiles desde INGRESO AL CORREO
- [ ] Solo OTs últimos 60 días

### Fase 3 — Producción
- [ ] Cambiar `SF_ENV=prod`
- [ ] `SF_RESUMEN_MODO_PRUEBA=false`
- [ ] Migrar envios → sf_workorders
- [ ] Remover import Excel del portal
- [ ] Cambiar alerta UAT por grupos reales

### Fase siguiente — Logística Alleata
- [ ] Arrancar después de cerrar todo lo de CA

---

## Variables de entorno Railway (vigentes)

```env
SUPABASE_URL=https://njkstpfmcfhqxdadqbdy.supabase.co
SF_ENV=uat
SF_SYNC_ENABLED=true
SF_RESUMEN_MODO_PRUEBA=true
SF_API_VERSION=v62.0
SCHEDULER_ENABLED=true
AUTOMATIONS_ENABLED=true
AUTOMATION_SECRET=123456
AUTOMATIONS_SECRET=123456
MICORREO_API_BASE=https://api.correoargentino.com.ar/micorreo/v1
```

---

## Credenciales SF UAT

- URL: `https://alleata--u4t.sandbox.my.salesforce.com`
- Token URL: `https://alleata--u4t.sandbox.my.salesforce.com/services/oauth2/token`
- Key: `3MVG9O_Hkc8TP1aFKfStBooWqwnzaPBZu_7Dex8oxEny0nYlSif0K5R0Fkm0l9mPBn9SH3e.wjlwruQ.LlLXK`

---

## Notas técnicas importantes

- **Productivo aislado:** `caStatusChecker.js` + tabla `envios` — no tocar nunca
- **sfCaTracker.js:** solo opera sobre `sf_workorders`
- **Token SF:** retry automático en `salesforceRequest()` — si 401/403 limpia cache y regenera
- **Rollout:** lógica activa solo cuando `record_type` contiene `ROLLOUT`
- **Alerta UAT:** no repite si el estado no cambió (`r.estado !== ot.estado_ca_envio`)
- **Merchants:** módulo temporal, se vuela cuando SF esté integrado al portal

---

*Generado el 19 de mayo de 2026 — continuar en nuevo chat*
