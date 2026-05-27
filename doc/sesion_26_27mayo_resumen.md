# ALLEATA OPS — Resumen de sesión 26-27/05/2026
**Portal:** v3.0.5 | **Agente:** v1.9.0 | **Para continuar en nuevo chat**

---

## Resumen ejecutivo

Sesión de estabilización y nuevas features: fix del scheduler duplicado, comando CA tracking en Ally, alerta WhatsApp de desinstalaciones entregadas pendientes verificación en Barracas, y sub-estados visuales en Envíos Merchants.

---

## Arquitectura actual

```
GitHub Pages → index.html v3.0.5 (portal desktop)

Railway (alleata-agent-production.up.railway.app)
├── index.js
├── salesforce.js
└── automations/
    ├── automationsRouter.js
    ├── caStatusChecker.js     — PRODUCTIVO tabla envios (no tocar)
    ├── caStatusCheckerOne.js
    ├── sfCaTracker.js         — CA Tracking sf_workorders + write-back + alerta Barracas
    ├── processAllyCommand.js  — nuevo comando CA tracking
    ├── allyAlertEngine.js
    ├── scheduler.js           — catch-up al arrancar, sin doble registro
    └── formatEventosCA.js
```

---

## Cambios sesión 26-27/05

### 1. Fix scheduler — doble registro de crons

**Problema:** `initScheduler()` se llamaba dos veces al arrancar (una desde `scheduler.js` auto-invoke y otra desde `index.js`), registrando cada cron dos veces. El cron de las 09:00 disparaba dos instancias simultáneas — la segunda se salteaba por el lock, generando el warning `⚠️ Auto-tracking ya en curso`.

**Fix:** eliminado el auto-invoke de `initScheduler()` en `scheduler.js`. Solo queda `catchUpOnStart()` como auto-invoke. `index.js` sigue siendo el único que llama `initScheduler()`.

**Resultado:** logs limpios, una sola línea `[Scheduler] ✅ Crons registrados`.

---

### 2. Catch-up al arrancar (`scheduler.js`)

Agregado en sesión anterior, validado hoy:

```
[Scheduler] ⚡ Catch-up run — último run hace 118h (27/5/2026, 10:41:09)
```

Consulta `automation_runs` al arrancar — si el último `ca_status_checker` fue hace más de 3 horas, dispara un run con 15 segundos de delay. Evita gaps por redeploys de Railway.

---

### 3. Fix `procesados: ?` en logs

`result?.procesados` → `result?.processed ?? result?.procesados` — ahora muestra el número real:
```
[Scheduler] procesados: 6
```

---

### 4. Comando CA tracking en Ally — `ca <tracking>`

**Archivo:** `processAllyCommand.js`

**Uso:**
```
ca 00012267785784L120M1601
tracking 00012267785784L120M1601
```

**Respuesta:**
```
📦 Tracking 00012267785784L120M1601 (HC-432354495-AR)
🔗 OT: 00019110 | VANESSA SOLANGE CA... | Angel Flores   ← si existe en sf_workorders o envios
━━━━━━━━━━━━━━━━━━
26-05-2026 10:47 | CDD 34
EN PODER DEL DISTRIBUIDOR
—
22-05-2026 21:59 | CLOG MENDOZA
EN PROCESO DE CLASIFICACION
...y N eventos anteriores
```

- Muestra últimos 6 eventos
- Busca OT vinculada en `sf_workorders` y `envios` (fallback graceful si no encuentra)
- Regex: `/^(?:ca|tracking|track|seguimiento)\s+([a-z0-9]{10,40})$/i`

---

### 5. Alerta WhatsApp — OTs desinstalación entregadas CA pendientes Barracas

**Archivo:** `sfCaTracker.js`

**Cuándo dispara:** al final de cada run del CA Tracker, si detectó desinstalaciones con `estado_ca_envio = Entregada` durante ese run.

**Destino:** privado al número `ALERTA_UAT_NUMERO` (variable Railway).

**Mensaje:**
```
*OTs DESINSTALACION - PENDIENTES A VERIFICAR EN BARRACAS*
_CA registra entrega - revisar terminal devuelta_
------------------
- OT 00018918 | MORALES BRISA MARTINA - SU | CA: 25-03-2026 11:47
- OT 00018724 | SOSA NIGLIA GUIDO NICOLA... | CA: 11-03-2026 13:29
...

_Total: 5 OTs_
```

**Implementación:** acumula array `desinstalacionesEntregadas` durante el run (no re-consulta Supabase al final, que causaba encontrar 0 porque ya las había cerrado como Exitoso).

**Variable Railway agregada:** `ALERTA_UAT_NUMERO = 5491165117989`

---

### 6. Sub-estados visuales en Envíos Merchants

**Archivo:** `index.html` — función `mchEstadoBadge(estado, ultimoEvento)`

Cuando el estado es "En tránsito", muestra el `ultimo_evento` debajo del chip con color semántico:

| Sub-estado | Color |
|---|---|
| ENTREGADO / ENTREGA EN SUCURSAL / ENTREGA EFECTUADA | 🟢 Verde |
| INTENTO DE ENTREGA / DOMICILIO CERRADO / ESPERA EN SUCURSAL | 🟡 Amarillo |
| CADUCA / PLAZO VENCIDO / DEVOLUCION / DEVUELTO | 🔴 Rojo |
| Resto | 🔵 Azul (mismo del chip) |

Máximo 22 caracteres + `…` para no romper el layout.

---

## Bugs resueltos

| Bug | Causa | Fix |
|---|---|---|
| `sfCaTracker` no cargaba — `Invalid or unexpected token` | Emojis corruptos al escribir el archivo desde Python | Reescritura con ASCII puro |
| Alerta Barracas con 0 OTs | Consultaba Supabase post-run cuando ya estaban Exitosas | Acumular array durante el run |
| `record_type` undefined en acumulador | No estaba en el `.select()` de Supabase | Agregado `record_type, cuenta, responsable` al select |
| `ALERTA_UAT_NUMERO no configurado` | Variable no existía en Railway | Agregada manualmente |
| Doble `[Scheduler] ✅ Crons registrados` | `initScheduler()` llamado dos veces | Removido auto-invoke del scheduler |

---

## Bugs pendientes

| Bug | Descripción |
|---|---|
| CA Tracker corre dos veces en paralelo | Fire & forget del router + llamada directa de `salesforce.js` — no es crítico pero desperdicia llamadas CA |
| `caStatusChecker` Error OT 00021174 y 00020838 | `Cannot read properties of undefined (reading 'match')` — tracking con valor inválido en tabla `envios` |
| Mapeo StateCode provincias | Algunos códigos pueden estar incorrectos — validar contra datos reales SF |
| `sf-stats/desinstalaciones` error 400 intermitente | SOQL con fechas — monitorear |

---

## Variables Railway — estado actual (28 variables)

```env
ALERTA_UAT_NUMERO=5491165117989    ← NUEVA esta sesión
SCHEDULER_ENABLED=true
AUTOMATIONS_ENABLED=true
AUTOMATION_SECRET=123456
AUTOMATIONS_SECRET=123456
SF_ENV=uat
SF_SYNC_ENABLED=true
SF_API_VERSION=v62.0
SUPABASE_URL=https://njkstpfmcfhqxdadqbdy.supabase.co
```

---

## Archivos modificados esta sesión

| Archivo | Cambio |
|---|---|
| `scheduler.js` | Fix doble registro + fix `procesados` → `processed` |
| `processAllyCommand.js` | Nuevo comando `ca <tracking>` |
| `sfCaTracker.js` | Alerta Barracas + fix emojis corruptos + fix record_type en select |
| `index.html` | Sub-estados visuales en chip "En tránsito" de Merchants |

---

## Notas técnicas

- **`alertarDesinstalacionesEntregadasCA`** debe recibir el array acumulado durante el run, NO re-consultar Supabase al final
- **Emojis en strings JS** escritos desde Python — siempre verificar con `node --check` antes de pushear
- **`ALERTA_UAT_NUMERO`** en Railway sin `+`, sin espacios: `5491165117989`
- **CA Tracker corre dos veces** — uno desde `salesforce.js` post-sync directo y otro desde el fire & forget del router. A resolver en próxima sesión

---

*Generado el 27 de mayo de 2026 — continuar en nuevo chat*
