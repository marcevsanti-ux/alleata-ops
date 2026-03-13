# ALLEATA OPS PORTAL — Estado del Proyecto
**Fecha:** 13 mar 2026 | **Versión actual:** v1.2.1 (desktop) · v2.1.1 (mobile)

---

## 🔑 CREDENCIALES Y ACCESOS

### Supabase
- **Proyecto:** alleata-ops
- **URL:** https://njkstpfmcfhqxdadqbdy.supabase.co
- **Publishable Key:** sb_publishable_W3fP-CCb0m-B0v5tdaHQCg_2L43Rx5J
- **Secret Key:** sb_secret_HmF0Yq_hMHsi65lLOlq_QQ_wdeqmdVq
- **Región:** São Paulo (sa-east-1), Free plan

### Gemini API
- **Key activa:** AIzaSyA8A-fiQnmI59MuHr6tg7PKXpS2XsJOfqs
- **Proyecto Google:** ALLEATA-SIM (Nivel 1)
- **Modelo:** gemini-2.5-flash
- **Restricción:** Ninguna (key protegida via Supabase Edge Function proxy)
- **Proxy URL:** https://njkstpfmcfhqxdadqbdy.supabase.co/functions/v1/gemini-proxy
- **IMPORTANTE:** Key guardada como secret en Supabase — nunca expuesta en código fuente

### GitHub
- **Repo:** github.com/marcevsanti-ux/alleata-ops (público)
- **URL live portal:** https://marcevsanti-ux.github.io/alleata-ops/
- **URL mobile:** https://marcevsanti-ux.github.io/alleata-ops/mobile.html

### Usuario Admin
- **Email:** marcelos@moretti.com.ar
- **Rol:** admin (seteado vía SQL)

---

## 📁 ARCHIVOS PRODUCIDOS

| Archivo | Descripción | Versión |
|---------|-------------|---------|
| index.html | Portal desktop completo | v1.2.1 |
| mobile.html | App mobile SIMs | v2.1.1 |
| setup.sql | Tablas + RLS Supabase | — |

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

#### envios
```sql
id uuid
user_id uuid (FK auth.users)
sf_id text UNIQUE          -- ID de SF para upsert sin duplicados
ot_numero text             -- Número OT (ej: 00019425)
tipo text                  -- Tipo de registro OT
responsable text           -- Nombre del responsable (match con profiles.nombre)
cuenta text                -- Cuenta Salesforce
track text                 -- N° seguimiento Correo Argentino
fecha text                 -- Fecha de despacho
ciudad text
provincia text
asignacion text
notas text                 -- Observaciones generales SF
costo_envio numeric        -- Costo de envío
estado text                -- Auto-detectado de observaciones al importar
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

### RLS Policies (ejecutadas y confirmadas)
```sql
-- profiles: todos pueden leer, cada uno actualiza el suyo
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- envios, devoluciones, horas: cada usuario ve los suyos
-- (políticas estándar user_id = auth.uid())
```

### Columnas agregadas (ejecutar si no están)
```sql
alter table profiles add column if not exists celular text;
alter table envios add column if not exists sf_id text unique;
alter table envios add column if not exists ot_numero text;
alter table envios add column if not exists tipo text;
alter table envios add column if not exists responsable text;
alter table envios add column if not exists cuenta text;
alter table envios add column if not exists ciudad text;
alter table envios add column if not exists provincia text;
alter table envios add column if not exists asignacion text;
alter table envios add column if not exists email_dest text;
alter table envios add column if not exists cp_dest text;
alter table envios add column if not exists ultimo_evento text;
alter table envios add column if not exists ultimo_evento_fecha text;
alter table envios add column if not exists costo_envio numeric;
```

---

## 🏗️ ARQUITECTURA DEL PORTAL

### index.html (Desktop)
- Login con Supabase Auth
- Sidebar navy con logo Alleata
- Módulos: Dashboard, SIMs, Envíos, Devoluciones, Horas, Ajustes
- Versión visible en topbar (derecha) y sidebar footer

### Módulos implementados

#### SIMs
- Upload de fotos → OCR con Gemini 2.0 Flash
- Base de datos 6.878 SIMs CLARO embebida en el HTML (~1.9MB)
- Lógica de lookup: serie completa → línea → sufijo → prefijos conocidos → últimos 9 dígitos
- Búsqueda manual por serie, sufijo o línea
- 44 prefijos conocidos (todos empiezan con 8954...)

#### Envíos (v1.2.1)
- **Flujo:** Admin importa Excel SF → sistema asigna OTs por responsable
- Import Excel de SF (DESPACHADO CORREO ARGENTINO)
- Estado auto-detectado desde campo Observaciones del SF
- Admin ve todas las OTs + filtros por responsable/estado
- Operador ve solo sus OTs (match por profiles.nombre = responsable)
- Link directo a tracking Correo Argentino
- Campos: OT, tipo, responsable, cuenta, tracking, fecha, ciudad, provincia, costo_envio, estado, observaciones
- **Pendiente:** Integración API MiCorreo (credenciales en gestión con ejecutivo de cuentas)

#### Ajustes (solo Admin)
- Crear usuarios con email, contraseña, rol y módulos habilitados
- Pills interactivas por módulo (activar/desactivar por usuario)
- Selector de rol (Operador/Admin) por usuario
- Campo celular (a futuro: WhatsApp/SMS)
- Eliminar usuarios

#### Devoluciones
- Registro de devoluciones con motivo y estado
- Estados: Pendiente, En proceso, Resuelta

#### Horas
- Control semanal por integrante
- Vista de equipo con totales por semana

### mobile.html (Mobile SIMs)
- Login Supabase
- 3 tabs: Escanear / Buscar / Historial
- Cámara trasera directa en iOS/Android
- OCR Gemini mismo que desktop
- Historial local (localStorage, últimos 100 escaneos)
- Drawer con info de usuario y link al portal completo
- Versión visible en topbar

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

### Logo
- PNG base64 embebido en ambos HTMLs
- Fuente: /mnt/user-data/uploads/logo.png
- BUG PENDIENTE: logo con fondo blanco en login (necesita versión transparente)

### Fuentes
- Inter (UI)
- JetBrains Mono (números, series, códigos)

---

## 🐛 BUGS PENDIENTES

1. **Logo con fondo blanco** en login y sidebar — necesita PNG con fondo transparente (logo navy/blanco sin "Powered by Moretti")

---

## 🔮 ROADMAP

### Fase 2 — Integración MiCorreo API
- Credenciales: usuario + password (en gestión con ejecutivo Correo Argentino)
- API Base: https://api.correoargentino.com.ar/micorreo/v1
- Auth: JWT via Basic Auth → Bearer token
- Endpoints a implementar:
  - POST /token → obtener JWT
  - GET /shipping/tracking → estado real del envío
  - POST /shipping/import → registrar envío
- Actualización automática de estados cada X horas

### Pendiente
- Notificaciones WhatsApp/SMS al celular del operador
- Módulo mobile completo (Envíos, Hoja de ruta, Evidencia de casuísticas)

---

## 👥 EQUIPO (usuarios del portal)
- **marcelos** (marcelos@moretti.com.ar) — Admin
- **Gonzalo Marvaldi** — Operador (responsable OTs en SF)
- **Andres Veyga** — Operador
- **Angel Flores** — Operador

---

## 📋 FUENTE DE DATOS SIMs
- Archivo original: LISTADO_DE_SIMS-2026-02-25-16-32-26.xlsx
- 6.878 SIMs totales
- Columnas usadas: D=serie, E=linea, F=ubicacion, H=cuenta, I=estado
- Estados: ASIGNADA, DISPONIBLE, SIN INFORMACIÓN, EXTRAVIADA, ENVIO FALLIDO, TERMINAL DEVUELTA
- JSON embebido en HTML como variable JS (SIMS_DB + DB_BY_LINEA + KNOWN_PREFIXES)

---

## 📄 FORMATO EXCEL SF (DESPACHADO CORREO ARGENTINO)
- Fila 13: encabezados
- Columnas relevantes:
  - Id. de orden de trabajo (sf_id, único para upsert)
  - Tipo de registro de orden de trabajo
  - Responsable de la OT: Nombre completo
  - Número de orden de trabajo
  - cuenta
  - Fecha de Despacho
  - N° de seguimiento (tracking Correo Argentino)
  - Observaciones generales → usado para auto-detectar estado
  - Dirección de envío (Ciudad)
  - Dirección de envío (Estado/Provincia)
  - Asignación: Nombre de asignación
  - Costo de envio (numeric)

## 🔄 DETECCIÓN AUTOMÁTICA DE ESTADO (desde Observaciones SF)
- "EN ESPERA EN SUCURSAL" → En espera en sucursal
- "EN PODER DEL DISTRIBUIDOR" → En camino
- "CENTRO DE PROCESAMIENTO" / "CLASIFICACI" → En camino
- "ENTREGADO" / "ENTREGA OK" → Entregado
- "DEVUELTO" / "DEVOLUCION" → Devuelto
- vacío → En tránsito
