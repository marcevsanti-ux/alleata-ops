# ALLEATA OPS PORTAL — Estado del Proyecto
**Fecha:** 13 mar 2026 | **Versión actual:** v1.3.0 (desktop) · v2.1.1 (mobile)

---

## 🔑 CREDENCIALES Y ACCESOS

### Supabase
- **Proyecto:** alleata-ops
- **URL:** https://njkstpfmcfhqxdadqbdy.supabase.co
- **Anon JWT Key:** eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qa3N0cGZtY2ZocXhkYWRxYmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTkxMTksImV4cCI6MjA4ODczNTExOX0.7T0cZz1aGTWQZsjy7zeWsRWeG1SLw9y8cPK6RGVG8BA
- **Región:** São Paulo (sa-east-1), Free plan
- **NOTA:** Las keys `sb_publishable_*` y `sb_secret_*` son inválidas — usar siempre el JWT anon key

### Gemini API
- **Key activa:** AIzaSyA8A-fiQnmI59MuHr6tg7PKXpS2XsJOfqs
- **Proyecto Google:** ALLEATA-SIM (Nivel 1)
- **Modelo:** gemini-2.5-flash
- **Restricción:** Ninguna (key protegida via Supabase Edge Function)
- **Proxy URL:** https://njkstpfmcfhqxdadqbdy.supabase.co/functions/v1/gemini-proxy
- **IMPORTANTE:** Key guardada como secret `GEMINI_KEY` en Supabase — nunca expuesta en código fuente
- **Deploy:** `supabase functions deploy gemini-proxy --no-verify-jwt`

### Supabase CLI (instalado en desktop)
- **Instalado via:** Scoop (Windows PowerShell)
- **Versión:** 2.78.1
- **Proyecto linkeado:** njkstpfmcfhqxdadqbdy
- **Comandos útiles:**
  ```powershell
  supabase functions deploy gemini-proxy --no-verify-jwt
  supabase secrets set GEMINI_KEY=nueva_key
  ```

### GitHub
- **Repo:** github.com/marcevsanti-ux/alleata-ops (público)
- **URL live portal:** https://marcevsanti-ux.github.io/alleata-ops/
- **URL mobile:** https://marcevsanti-ux.github.io/alleata-ops/mobile.html

### Usuario Admin
- **Email:** marcelos@moretti.com.ar
- **Password:** Admin2026!
- **Rol:** admin

---

## 📁 ARCHIVOS PRODUCIDOS

| Archivo | Descripción | Versión |
|---------|-------------|---------|
| index.html | Portal desktop completo | v1.3.0 |
| mobile.html | App mobile SIMs | v2.1.1 |
| setup.sql | Tablas + RLS Supabase | — |
| supabase/functions/gemini-proxy/index.ts | Edge Function proxy Gemini | v1.0 |
| docs/ALLEATA_OPS_PROJECT_SUMMARY.md | Este documento | — |

---

## 🗄️ BASE DE DATOS SUPABASE

### Tablas

#### profiles
```sql
id uuid (FK auth.users)
email text
nombre text
rol text ('admin' | 'operador')
modulos text[] (['sims','envios','devoluciones','horas'])
celular text
created_at timestamptz
```

#### sims (6.891 registros)
```sql
id uuid
serie text        -- ICCID completo (19-20 dígitos, empieza con 8954)
linea text        -- Número de línea telefónica (10 dígitos)
ubicacion text    -- Ubicación física
cuenta text       -- Cuenta/cliente asignado
estado text       -- ASIGNADA | DISPONIBLE | SIN INFORMACIÓN | EXTRAVIADA | ENVIO FALLIDO | TERMINAL DEVUELTA
updated_at timestamptz
```

#### envios
```sql
id uuid
user_id uuid (FK auth.users)
sf_id text UNIQUE
ot_numero text
tipo text
responsable text
cuenta text
track text
fecha text
ciudad text
provincia text
asignacion text
notas text
costo_envio numeric
estado text
ultimo_evento text
ultimo_evento_fecha text
email_dest text
cp_dest text
created_at timestamptz
```

#### devoluciones
```sql
id uuid
user_id uuid
cliente text
producto text
motivo text
estado text
notas text
fecha text
created_at timestamptz
```

#### horas
```sql
id uuid
user_id uuid
persona text
horas numeric
fecha text
tarea text
created_at timestamptz
```

### RLS Policies
```sql
-- profiles
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- sims: lectura para usuarios autenticados
ALTER TABLE sims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sims_select_authenticated" ON sims FOR SELECT TO authenticated USING (true);

-- envios, devoluciones, horas: cada usuario ve los suyos
-- (políticas estándar user_id = auth.uid())
```

---

## 🏗️ ARQUITECTURA DEL PORTAL

### index.html (Desktop) — v1.3.0
- Login con Supabase Auth (JWT anon key)
- Sidebar navy con logo Alleata + QR code al mobile centrado en dashboard
- Módulos: Dashboard, SIMs, Envíos, Devoluciones, Horas, Ajustes
- Versión visible en topbar y sidebar footer

### Módulos implementados

#### SIMs (v1.3.0 — migrado a Supabase)
- Upload de fotos → OCR con Gemini 2.5 Flash via proxy
- **Base de datos en Supabase** (tabla `sims`, 6.891 registros) — ya NO embebida en HTML
- Lookup inteligente: serie completa → línea → sufijo → búsqueda parcial
- Búsqueda manual por serie, sufijo o línea
- Funciones: `simSmartLookup`, `simLookupBySerie`, `simLookupByLinea`, `simLookupBySufijo`
- Stats dinámicas desde Supabase (`loadSimStats`)

#### Envíos (v1.2.1)
- Flujo: Admin importa Excel SF → sistema asigna OTs por responsable
- Import Excel SF (DESPACHADO CORREO ARGENTINO)
- Estado auto-detectado desde campo Observaciones
- Admin ve todas las OTs + filtros por responsable/estado
- Operador ve solo sus OTs (match por profiles.nombre = responsable)
- Link directo a tracking Correo Argentino
- **Pendiente:** Integración API MiCorreo

#### Ajustes (solo Admin)
- Crear/editar/eliminar usuarios
- Pills interactivas por módulo
- Selector de rol (Operador/Admin)
- Campo celular
- Edge function `admin-update-user` para cambio de password (pendiente deploy)

#### Devoluciones
- Registro con motivo y estado
- Estados: Pendiente, En proceso, Resuelta

#### Horas
- Control semanal por integrante
- Vista de equipo con totales por semana

### mobile.html — v2.1.1
- Login Supabase (JWT anon key)
- 3 tabs: Escanear / Buscar / Historial
- Cámara trasera directa en iOS/Android
- OCR Gemini 2.5 Flash via proxy Supabase (sin key expuesta)
- Lookup en tabla `sims` de Supabase
- Prompt OCR: prefijo arriba + sufijo abajo = ICCID completo
- Regex extracción: `/8954\d{9,}/g` (ICCID) + `/\b0\d{7,9}\b/g` (sufijo)
- Historial local (localStorage, últimos 100 escaneos)
- Drawer con info de usuario + link al portal
- Versión visible en login y topbar

### gemini-proxy (Edge Function)
- Archivo: `supabase/functions/gemini-proxy/index.ts`
- Recibe requests del portal/mobile y llama a Gemini con key secreta
- Sin verificación JWT (`--no-verify-jwt`)
- Modelo: gemini-2.5-flash
- CORS habilitado para todos los orígenes

---

## 🎨 DISEÑO

### Paleta
```css
--navy-900: #0d1b2a  (fondo principal)
--navy-800: #112236  (surface)
--navy-700: #162d45  (surface2)
--teal:     #1dbf8e
--blue:     #1a9fd4
--grad: linear-gradient(135deg, #1dbf8e, #1a9fd4)
```

### Fuentes
- Inter (UI)
- JetBrains Mono (números, series, códigos)

---

## 🐛 BUGS PENDIENTES

1. **Logo con fondo blanco** en login y sidebar — necesita PNG con fondo transparente
2. **Edge function `admin-update-user`** — pendiente deploy para cambio de password desde Ajustes

---

## 🔮 ROADMAP

### Fase 2 — Integración MiCorreo API
- Credenciales: usuario + password (en gestión con ejecutivo Correo Argentino)
- API Base: https://api.correoargentino.com.ar/micorreo/v1
- Auth: JWT via Basic Auth → Bearer token
- Endpoints: POST /token · GET /shipping/tracking · POST /shipping/import
- Actualización automática de estados cada X horas

### Fase 3 — Mobile completo
- Módulo Envíos mobile (ver OTs asignadas)
- Hoja de ruta diaria
- Evidencia fotográfica de casuísticas
- Notificaciones WhatsApp/SMS al celular del operador

---

## 👥 EQUIPO
- **marcelos** (marcelos@moretti.com.ar) — Admin
- **Gonzalo Marvaldi** — Operador (responsable OTs en SF)
- **Andres Veyga** — Operador
- **Angel Flores** — Operador

---

## 📋 FUENTE DE DATOS SIMs
- Archivo original: LISTADO_DE_SIMS-2026-02-25-16-32-26.xlsx
- 6.891 SIMs en Supabase (tabla `sims`)
- Columnas: serie, linea, ubicacion, cuenta, estado
- Estados: ASIGNADA, DISPONIBLE, SIN INFORMACIÓN, EXTRAVIADA, ENVIO FALLIDO, TERMINAL DEVUELTA

---

## 📄 FORMATO EXCEL SF (DESPACHADO CORREO ARGENTINO)
- Fila de encabezados: contiene "N° de seguimiento"
- Columnas relevantes: Id. de orden, Tipo de registro, Responsable, Número OT, cuenta, Fecha Despacho, N° seguimiento, Observaciones, Ciudad, Estado/Provincia, Asignación, Costo de envio

## 🔄 DETECCIÓN AUTOMÁTICA DE ESTADO (desde Observaciones SF)
- "EN ESPERA EN SUCURSAL" → En espera en sucursal
- "EN PODER DEL DISTRIBUIDOR" → En camino
- "CENTRO DE PROCESAMIENTO" / "CLASIFICACI" → En camino
- "ENTREGADO" / "ENTREGA OK" → Entregado
- "DEVUELTO" / "DEVOLUCION" → Devuelto
- vacío → En tránsito
