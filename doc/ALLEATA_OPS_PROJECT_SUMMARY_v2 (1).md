# ALLEATA OPS PORTAL — Estado del Proyecto
**Fecha:** 18 mar 2026 | **Versión actual:** v1.8.8 (desktop) · v2.7.2 (mobile) · Agente Ally v1.0

---

## 🔑 CREDENCIALES Y ACCESOS

### Supabase
- **Proyecto:** alleata-ops
- **URL:** https://njkstpfmcfhqxdadqbdy.supabase.co
- **Anon JWT Key:** eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qa3N0cGZtY2ZocXhkYWRxYmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTkxMTksImV4cCI6MjA4ODczNTExOX0.7T0cZz1aGTWQZsjy7zeWsRWeG1SLw9y8cPK6RGVG8BA
- **Región:** São Paulo (sa-east-1), Free plan
- **NOTA:** Las keys `sb_publishable_*` y `sb_secret_*` son inválidas — usar siempre el JWT anon key

### Gemini API
- **Key mobile (portal-alleata-3):** AIzaSyAGmyGdkujeZelE96tIaUOXClFmZ3ayq8o — llamada directa sin proxy
- **Key desktop (portal-alleata-mobile):** AIzaSyA8A-fiQnmI59MuHr6tg7PKXpS2XsJOfqs — via proxy Supabase
- **Modelo:** gemini-2.5-flash
- **Proxy URL:** https://njkstpfmcfhqxdadqbdy.supabase.co/functions/v1/gemini-proxy

### Supabase CLI
- **Instalado via:** Scoop (Windows PowerShell) — v2.78.1
- **Proyecto linkeado:** njkstpfmcfhqxdadqbdy

### GitHub
- **Repo portal:** github.com/marcevsanti-ux/alleata-ops (público)
- **Repo agente:** github.com/marcevsanti-ux/alleata-agent (privado)
- **URL live portal:** https://marcevsanti-ux.github.io/alleata-ops/
- **URL mobile:** https://marcevsanti-ux.github.io/alleata-ops/mobile.html

### Usuarios del sistema
| Nombre | Email | Rol | Celular |
|--------|-------|-----|---------|
| marcelos | marcelos@moretti.com.ar | admin | 5491165117989 |
| Luciana Galvao | luciana@alleata.com.ar | admin | 5491127301062 |
| Andres Veyga | andresv@alleata.com.ar | operador | 5491126685780 |
| Gonzalo Marvaldi | gonzalo@alleata.com.ar | operador | 5491126685381 |
| Angel Flores | angel@alleata.com.ar | operador | 5491127301031 |
| Marcelo Jimenez | marcelo@alleata.com.ar | logistica | 5491171407200 |

---

## 🤖 AGENTE ALLY — WhatsApp IA

### Stack
| Componente | Tecnología | Costo |
|---|---|---|
| WhatsApp API | WASender Basic | $6/mes |
| Backend / Servidor | Railway | ~$5/mes |
| Base de datos | Supabase | Free tier |
| IA | Claude claude-sonnet-4-6 | ~$5 créditos/meses |
| Código fuente | GitHub (privado) | Free |
| **TOTAL** | | **~$16-20/mes** |

### Credenciales Ally
| Servicio | Dato | Valor |
|---|---|---|
| WASender | Sesión | alleata-ops |
| WASender | Número | +54 9 11 2701-3661 |
| WASender | Token | 619aa8ee...c79 |
| WASender | Plan | Basic ($6/mes) — activado 18/03/2026 |
| Railway | URL | alleata-agent-production.up.railway.app |
| Railway | Proyecto | adequate-blessing / production |
| GitHub | Repo | marcevsanti-ux/alleata-agent (private) |

### Arquitectura
```
Marce (mobile.html)
      ↓ fetch POST /notificar
Railway (Node.js — Agente Ally)
      ↓
WASender API
      ↓
Grupo WhatsApp (TEST OPS / grupos reales)
```

### Endpoints disponibles
| Endpoint | Método | Descripción |
|---|---|---|
| `/` | GET | Health check |
| `/webhook` | POST | Recibe mensajes de WASender |
| `/notificar` | POST | Envía mensaje a número o grupo |
| `/get-groups` | GET | Lista grupos con sus IDs (temporal) |

### Variables de entorno Railway
```
SUPABASE_URL=https://njkstpfmcfhqxdadqbdy.supabase.co
SUPABASE_SERVICE_KEY=tu_service_key
WASENDER_TOKEN=619aa8ee...c79
WASENDER_SESSION=alleata-ops
ANTHROPIC_API_KEY=sk-ant-api03-...
PORT=8080
```

### Archivos del proyecto (alleata-agent)
```
alleata-agent/
├── index.js       # Servidor Express + webhook + endpoints + CORS
├── agent.js       # Lógica IA (Claude)
├── supabase.js    # Consultas DB — fix .limit(1)
├── wasender.js    # Envío mensajes — fix grupos @g.us
├── package.json
├── nixpacks.toml
└── .env.example
```

### Configuración WASender webhook
- **URL:** https://alleata-agent-production.up.railway.app/webhook
- **Eventos activos:** messages.received, message.sent, session.status, messages.update, messages-group.received
- **Message Filtering:** Ignore Groups = ❌ DESACTIVADO

### Grupos WhatsApp configurados
| Grupo | Group ID | Estado |
|---|---|---|
| TEST OPS | 120363424299090366@g.us | ✅ Activo — Ally miembro |
| Gonzalo + vendedores | pendiente | ⏳ Ally no agregado aún |
| Andres + vendedores | pendiente | ⏳ Ally no agregado aún |
| Angel + vendedores | pendiente | ⏳ Ally no agregado aún |

---

## 🔔 FLUJO NOTIFICACIONES ALLY — FUNCIONANDO ✅

### Circuito productivo
```
Marce escanea QR rótulo → acepta OT (En tránsito)
      ↓
mobile.html → POST /notificar → Railway → WASender → Grupo WhatsApp

Marce confirma entrega (Entregado / Fallido)
      ↓
mobile.html → POST /notificar → Railway → WASender → Grupo WhatsApp
```

### Mensajes que envía Ally

**En tránsito:**
```
📦 Ops informa — OT en tránsito

OT 00019797
Instalación Equipo + Simcard
FRANCISCO ENRIQUE RAUL - SUC - 0001

🚚 En tránsito — Logística Alleata
```

**Entregado:**
```
✅ Ops informa — OT entregada

OT 00019797
Instalación Equipo + Simcard
FRANCISCO ENRIQUE RAUL - SUC - 0001

✅ Entregada con éxito
```

**Fallido:**
```
❌ Ops informa — OT con problema

OT 00019797
Instalación Equipo + Simcard
FRANCISCO ENRIQUE RAUL - SUC - 0001

❌ Entrega fallida
```

---

## 📝 HISTORIAL DE FIXES — 18/03/2026

| Fix | Archivo | Descripción |
|-----|---------|-------------|
| supabase.js | `.single()` → `.limit(1)` | Evita error con celulares duplicados |
| wasender.js | `replace(/\D/g,'')` → check `@g.us` | Preserva Group ID para grupos |
| index.js | Middleware CORS | Permite llamadas desde GitHub Pages |
| index.js | Logs detallados en `/notificar` | Debug de errores WASender |
| WASender config | Desactivar "Ignore Groups" | Permite recibir/enviar en grupos |
| WASender config | Activar `messages-group.received` | Captura eventos de grupos |
| mobile.html v2.7.0 | Integración Ally | `notificarAlly()`, `ALLY_URL`, `ALLY_GROUP_TEST` |
| mobile.html v2.7.1 | Group ID correcto | `120363424299090366@g.us` (el real del webhook) |
| mobile.html v2.7.2 | Fix en tránsito | `otParaNotif` antes de `cancelarOTScaneada()` |
| mobile.html v2.7.2 | Fix número OT | Busca en Supabase si no está en `rutaDelDia` |
| mobile.html v2.7.2 | Fix mensaje | Campo `cuenta` en todos los mensajes |

---

## 🗄️ BASE DE DATOS SUPABASE

### Tabla: profiles
```sql
id uuid (FK auth.users)
email text
nombre text
rol text ('admin' | 'operador' | 'logistica')
modulos text[]
celular text
created_at timestamptz
```

### Tabla: sims (6.878 registros)
```sql
id uuid
serie text
linea text
ubicacion text
cuenta text
estado text  -- ASIGNADA | DISPONIBLE | SIN INFORMACIÓN | EXTRAVIADA | ENVIO FALLIDO | TERMINAL DEVUELTA
updated_at timestamptz
```

### Tabla: envios
```sql
id uuid, user_id uuid, sf_id text UNIQUE, ot_numero text, tipo text,
responsable text, cuenta text, track text, fecha text, ciudad text,
provincia text, cp_dest text, asignacion text, notas text,
costo_envio numeric, estado text, logistica text, nombre_comercio text,
contacto text, horario text, cuit text, email_dest text, email_contacto text,
direccion_completa text, foto_evidencia text, fecha_cierre text,
resultado text, notas_cierre text, ultimo_evento text,
ultimo_evento_fecha text, created_at timestamptz
```

### Tabla: devoluciones
```sql
id uuid, user_id uuid, cliente text, producto text, motivo text,
estado text, notas text, fecha text, created_at timestamptz
```

### Tabla: horas
```sql
id uuid, user_id uuid, persona text, horas numeric,
fecha text, tarea text, created_at timestamptz
```

### RLS Policies aplicadas
```sql
-- profiles
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_update" on profiles for update using (auth.uid() = id);
-- sims
CREATE POLICY "sims_select_authenticated" ON sims FOR SELECT TO authenticated USING (true);
-- envios
CREATE POLICY "envios_insert_authenticated" ON envios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "envios_update_authenticated" ON envios FOR UPDATE TO authenticated USING (true);
CREATE POLICY "envios_select_all" ON envios FOR SELECT TO authenticated USING (true);
```

---

## 🗺️ ZONAS AMBA

| Zona | Color | Municipios clave |
|------|-------|-----------------|
| 🏙️ CABA | Azul | Ciudad Autónoma de Buenos Aires |
| ⬆️ Zona Norte | Verde | San Isidro, Vicente López, Tigre, Pilar, Escobar |
| ⬇️ Zona Sur | Amarillo | Lomas de Zamora, Quilmes, La Plata, Guernica |
| ⬅️ Zona Oeste | Violeta | La Matanza, Morón, Hurlingham, Merlo, Moreno |
| 📦 Fuera AMBA | Rojo | Resto del país |

**Central de despacho:** California 2082, Barracas, CABA (-34.648, -58.377)

---

## 🔮 ROADMAP

### Alta prioridad
- [ ] **Mapeo responsable → grupo real** — Gonzalo/Andres/Angel → su grupo
  - Agregar Ally a los 3 grupos reales
  - Obtener Group IDs via `/get-groups` o webhook logs
  - Actualizar `notificarAlly()` en mobile.html con lógica por responsable
- [ ] **Campo ejecutivo de cuenta** en tabla `envios` — viene del Excel SF
- [ ] **Tabla audit_log** — crear en Supabase
- [ ] **Edge function admin-update-user** — cambio de password desde Ajustes

### Medio plazo
- [ ] **Dashboard métricas** para dirección
- [ ] **Mobile módulo Envíos** — Andres/Gonzalo ven sus OTs en el celu
- [ ] **Notificaciones al cliente** — OT despachada/entregada via WASender

### Largo plazo
- [ ] **MiCorreo API** — tracking automático Correo Argentino
- [ ] **Integración Salesforce** — sincronización bidireccional
- [ ] **Google Maps Distance Matrix** — distancia real por ruta

---

## ⚠️ TROUBLESHOOTING CONOCIDO

| Problema | Causa | Solución |
|---|---|---|
| Railway crashea al iniciar | Sintaxis rota en index.js | Reemplazar archivo completo desde el .md |
| Usuario no reconocido por Ally | `.single()` con celular duplicado | Usar `.limit(1)` — ya corregido |
| CORS error desde mobile.html | GitHub Pages bloqueado | Middleware CORS en index.js — ya corregido |
| Mensaje no llega al grupo | "Ignore Groups" activado en WASender | Desactivar en Manage Webhook |
| Group ID incorrecto | `/api/groups` devuelve ID diferente | Obtener ID real desde logs del webhook |
| WASender status: in_progress | Group ID equivocado | Usar ID capturado del webhook |
| En tránsito no notifica | `cancelarOTScaneada()` limpia la OT antes | Usar `otParaNotif` — ya corregido en v2.7.2 |
| OT muestra UUID en mensaje | `_otCierreActual` null | Busca en Supabase — ya corregido en v2.7.2 |

---

## 📊 COSTOS ACTUALES

| Servicio | Plan | Costo |
|---|---|---|
| WASender | Basic (1 sesión) | $6/mes |
| Railway | Hobby | ~$5/mes |
| Supabase | Free | $0 |
| Anthropic | Créditos | $5 cada varios meses |
| GitHub | Free | $0 |
| **TOTAL** | | **~$16-20/mes** |

---

*Documento actualizado el 18/03/2026 — Versión 2.1*
