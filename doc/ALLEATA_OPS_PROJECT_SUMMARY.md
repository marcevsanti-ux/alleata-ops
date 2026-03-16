# ALLEATA OPS PORTAL — Estado del Proyecto
**Fecha:** 16 mar 2026 | **Versión actual:** v1.8.8 (desktop) · v2.6.1 (mobile)

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
- **Secret Supabase:** `GEMINI_KEY=AIzaSyA8A-fiQnmI59MuHr6tg7PKXpS2XsJOfqs`
- **IMPORTANTE mobile:** llama directo a la API de Google (proxy daba 403 por sesión)

### Supabase CLI
- **Instalado via:** Scoop (Windows PowerShell) — v2.78.1
- **Proyecto linkeado:** njkstpfmcfhqxdadqbdy
- **Comandos útiles:**
  ```powershell
  supabase functions deploy gemini-proxy --no-verify-jwt
  supabase functions deploy admin-create-user --no-verify-jwt
  supabase secrets set GEMINI_KEY=nueva_key
  ```

### GitHub
- **Repo:** github.com/marcevsanti-ux/alleata-ops (público)
- **URL live portal:** https://marcevsanti-ux.github.io/alleata-ops/
- **URL mobile:** https://marcevsanti-ux.github.io/alleata-ops/mobile.html

### Usuarios del sistema
| Nombre | Email | Rol |
|--------|-------|-----|
| marcelos | marcelos@moretti.com.ar | admin |
| Luciana Galvao | luciana@alleata.com.ar | admin |
| Andres Veyga | — | operador |
| Gonzalo Marvaldi | — | operador |
| Angel Flores | — | operador |
| Marcelo (logística) | — | logistica |

---

## 📁 ARCHIVOS

| Archivo | Descripción | Versión |
|---------|-------------|---------|
| index.html | Portal desktop completo | v1.8.8 |
| mobile.html | App mobile | v2.6.1 |
| supabase/functions/gemini-proxy/index.ts | Proxy Gemini seguro | v1.0 |
| supabase/functions/admin-create-user/index.ts | Crear usuarios con service role | v1.0 |

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
serie text        -- ICCID completo (19-20 dígitos, empieza con 8954)
linea text
ubicacion text
cuenta text
estado text       -- ASIGNADA | DISPONIBLE | SIN INFORMACIÓN | EXTRAVIADA | ENVIO FALLIDO | TERMINAL DEVUELTA
updated_at timestamptz
```

### Tabla: envios
```sql
id uuid
user_id uuid
sf_id text UNIQUE          -- ID Salesforce (upsert sin duplicados)
ot_numero text             -- Ej: 00019777
tipo text                  -- Instalación Equipo + Simcard / Cambio de Terminal / etc
responsable text           -- Nombre completo del responsable SF
cuenta text                -- Cuenta Salesforce
track text                 -- N° seguimiento Correo Argentino
fecha text                 -- Fecha creación/despacho
ciudad text
provincia text
cp_dest text
asignacion text
notas text                 -- Observaciones SF
costo_envio numeric
estado text                -- Pre-Colecta | Despachado | En tránsito | En camino | En espera en sucursal | Entregado | Demorado | Perdido | Devuelto
logistica text             -- ALLEATA | EXPRESS METROPOLITANA | etc
nombre_comercio text       -- Nombre fantasía del comercio
contacto text              -- Teléfono de contacto
horario text               -- Horario de atención
cuit text
email_dest text
email_contacto text
direccion_completa text    -- Calle + número
foto_evidencia text        -- URL foto (futuro)
fecha_cierre text
resultado text             -- Entregado | Fallido
notas_cierre text
ultimo_evento text
ultimo_evento_fecha text
created_at timestamptz
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
ALTER TABLE sims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sims_select_authenticated" ON sims FOR SELECT TO authenticated USING (true);

-- envios
CREATE POLICY "envios_insert_authenticated" ON envios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "envios_update_authenticated" ON envios FOR UPDATE TO authenticated USING (true);
CREATE POLICY "envios_select_all" ON envios FOR SELECT TO authenticated USING (true);
```

---

## 🏗️ ARQUITECTURA

### Stack
- **Frontend:** HTML/JS puro — GitHub Pages (sin framework)
- **Backend:** Supabase (PostgreSQL + Auth + Edge Functions)
- **AI/OCR desktop:** Gemini 2.5 Flash via Supabase Edge Function proxy
- **AI/OCR mobile:** Gemini 2.5 Flash directo a Google API (key portal-alleata-3)
- **CDN JS:** jsDelivr (xlsx, supabase-js, qrcodejs) — NO usar cdn.sheetjs.com ni recursos externos que bloqueen render
- **Storage:** Supabase PostgreSQL

### Edge Functions deployadas
| Función | Descripción | JWT |
|---------|-------------|-----|
| gemini-proxy | Proxy seguro para Gemini API | no-verify |
| admin-create-user | Crea usuarios con service role key | no-verify |

### ⚠️ NOTA IMPORTANTE — Carga de página
- **NO agregar** recursos externos en el HTML estático (favicon, imágenes de terceros, etc.)
- El favicon de correoargentino.com.ar bloqueaba toda la carga — fue reemplazado por emoji 📮
- **NO usar** cdn.sheetjs.com — reemplazado por cdn.jsdelivr.net/npm/xlsx

---

## 🖥️ PORTAL DESKTOP (index.html) — v1.8.8

### Roles y permisos
| Rol | Puede ver | Puede hacer |
|-----|-----------|-------------|
| admin | Todo | Import Excel, crear usuarios, imprimir rótulos, ajustes |
| operador | Sus OTs (por nombre responsable) | Imprimir rótulos de sus OTs, cambiar estado |
| logistica | OTs donde logistica='ALLEATA' | Ver zonas, ver ruta, sin impresión |

### Módulo: Envíos
- **Dos imports SF:**
  - 📮 Correo Argentino — Excel "DESPACHADO CORREO ARGENTINO" (fila headers con "N° de seguimiento")
  - 🗺️ Pre-Colecta ALLEATA — Excel "PRE-COLECTA", filtra solo logística ALLEATA
- **Import Pre-Colecta:** `ignoreDuplicates:true` — solo inserta OTs nuevas, no modifica las existentes
- **Stats en cards de importación:** cada card muestra Total / Tránsito / Entregados / Problema de su logística
- **Vista admin/operador:** checkboxes + botón "Imprimir seleccionados"
- **Vista logística (Marcelo):** 6 cards de zona clickeables (CABA/Norte/Sur/Oeste/Fuera/Todas) con contador y km promedio
- **Filtro Estado:** Pre-Colecta | Despachado | En tránsito | En camino | En espera en sucursal | Entregado | Demorado | Perdido | Devuelto
- **OTs Entregadas:** botón 🖨️ deshabilitado — no se puede reimprimir rótulo
- **Botón ↺ Actualizar** en topbar — recarga datos del módulo activo en todas las secciones

### Módulo: Rótulos (impresión)
- Botón 🖨️ por OT + botón masivo "Imprimir seleccionados"
- Diseño **100x150mm portrait** para impresora SATO CG408
- `@page { size: 100mm 150mm; }` — orientación correcta confirmada
- Contenido: tipo OT, número OT (28px), destinatario, dirección, CP, localidad, provincia, contacto, horario, nombre fantasía, OBS
- **QR Geoubicación** (izquierda): abre Google Maps
- **QR Ruta** (derecha): URL `mobile.html?ot=sf_id` — Marcelo escanea para agregar a ruta
- Badge tipo: INS / CAM / RET + badge zona con color
- Solo visible para admin y operador (oculto para logistica)

### Módulo: SIMs
- Consulta tabla `sims` en Supabase
- Upload foto → OCR Gemini 2.5 Flash via proxy
- Lookup: serie completa → línea → sufijo → búsqueda parcial
- Stats dinámicas desde Supabase

### Módulo: Ajustes (solo admin)
- **Sección Base SIMs:** stats + upload Excel CLARO → upsert masivo por serie (lotes de 500)
- **Crear usuario:** via edge function `admin-create-user`
- **Editar usuario:** nombre, celular, rol, módulos, password
- **Auditoría:** sección presente pero tabla `audit_log` no creada aún — falla silenciosamente

### Módulo: Devoluciones
- Registro con cliente, producto, motivo, estado, notas
- Estados: Pendiente / En proceso / Resuelta

### Módulo: Horas
- Control semanal por integrante con totales

### Dashboard
- Welcome banner con QR al mobile (APP MOBILE en teal)
- Cards de módulos con stats dinámicas

---

## 📱 APP MOBILE (mobile.html) — v2.6.1

### 4 tabs
| Tab | Icono | Función |
|-----|-------|---------|
| Ruta | 📦 | Hoja de ruta diaria |
| SIMs | 📡 | Scanner de chips con cámara live |
| Buscar | 🔍 | Búsqueda manual SIMs |
| Historial | 🕐 | Últimos 100 escaneos |

### Tab Ruta
1. Marcelo abre el tab → ve OTs en tránsito activas
2. Activa cámara → escanea QR del rótulo (contiene `mobile.html?ot=sf_id`)
3. Sistema busca la OT en Supabase y la agrega a "Mi ruta de hoy"
4. Presiona "✅ Confirmar ruta" → todas pasan a estado `En Tránsito`
5. En "🚚 En camino" ve OTs con teléfono, horario, Maps, botones Entregado/Fallido

### Tab SIMs (rediseñado v2.4+)
- **Cámara live** con overlay de escaneo — toca el visor para activar
- **Botón 📷 Capturar** — el usuario elige el momento óptimo de enfoque
- **Zoom slider** (1× a 4×) + **pinch-to-zoom** con dos dedos
- **"🖼️ O subir foto"** — alternativa para subir imagen desde galería
- **Gemini 2.5 Flash directo** — llama a `generativelanguage.googleapis.com` con key `portal-alleata-3`
- Prompt pide: prefijo (8954XXXXXX) + sufijo (XXXXXXXXXX) + serie completa + línea
- Muestra **"Número interpretado"** — prefijo · sufijo en azul/teal
- Lookup en Supabase: serie completa → prefijo+sufijo → sufijo parcial → línea
- Vibración al encontrar resultado
- Al cambiar de tab, cámara se detiene automáticamente
- Botón "📡 Escanear otro chip" para volver a escanear

### Tab Buscar
- Búsqueda manual por serie/sufijo/línea en Supabase

### Tab Historial
- localStorage, últimos 100 escaneos

---

## 📄 FORMATO EXCEL SF

### Pre-Colecta (Hoja de Ruta ALLEATA)
- Fila de encabezados contiene: "Id. de orden de trabajo"
- Columnas: Logística, Id. de OT, Responsable, Tipo, N° OT, Fecha creación, Nombre comercio, Cuenta, Contacto, Horario, Calle, Ciudad, CP, Provincia, Observaciones, CUIT, Email, N° seguimiento
- Filtra automáticamente solo `logistica = 'ALLEATA'`
- Estado importado: `Pre-Colecta`
- **Solo inserta nuevas** — OTs con sf_id existente se ignoran

### Despachado Correo Argentino
- Fila de encabezados contiene: "N° de seguimiento"
- Estado auto-detectado desde campo Observaciones:
  - "EN ESPERA EN SUCURSAL" → En espera en sucursal
  - "EN PODER DEL DISTRIBUIDOR" → En camino
  - "CENTRO DE PROCESAMIENTO" / "CLASIFICACI" → En camino
  - "ENTREGADO" / "ENTREGA OK" → Entregado
  - "DEVUELTO" / "DEVOLUCION" → Devuelto
  - vacío → En tránsito

---

## 🗺️ ZONAS AMBA (detección por ciudad/CP)

| Zona | Color | Municipios clave |
|------|-------|-----------------|
| 🏙️ CABA | Azul | Ciudad Autónoma de Buenos Aires |
| ⬆️ Zona Norte | Verde | San Isidro, Vicente López, Tigre, Pilar, Escobar |
| ⬇️ Zona Sur | Amarillo | Lomas de Zamora, Quilmes, La Plata, Guernica, Monte Grande |
| ⬅️ Zona Oeste | Violeta | La Matanza, Morón, Hurlingham, Merlo, Moreno |
| 📦 Fuera AMBA | Rojo | Resto del país |

**Central de despacho:** California 2082, Barracas, CABA (-34.648, -58.377)
**Radio de cobertura Marcelo:** ~70km

---

## 🔮 ROADMAP

### Alta prioridad
- [ ] **Tabla audit_log** — crear en Supabase para habilitar auditoría de cambios
- [ ] **Edge function admin-update-user** — cambio de password desde Ajustes
- [ ] **Evidencia fotográfica** — foto al cerrar OT desde mobile

### Medio plazo
- [ ] **WasenderAPI WhatsApp** — notificaciones automáticas por cambio de estado
  - OT Despachado → cliente recibe WhatsApp
  - OT Entregado → cliente + vendedor SF reciben confirmación
  - OT Fallida → vendedor SF recibe alerta
- [ ] **Dashboard métricas** para dirección (OTs entregadas, tiempo promedio, costo total)
- [ ] **Mobile módulo Envíos** — Andres/Gonzalo ven sus OTs en el celu

### Largo plazo
- [ ] **MiCorreo API** — tracking automático Correo Argentino
  - Base: https://api.correoargentino.com.ar/micorreo/v1
  - Auth: JWT via Basic Auth → Bearer token
- [ ] **Integración Salesforce** — sincronización bidireccional de OTs
- [ ] **Google Maps Distance Matrix** — distancia real por ruta (reemplaza Haversine)
- [ ] **Servidor de impresión SATO** — configurar driver para 100×150mm portrait

---

## 🐛 BUGS PENDIENTES
1. **Logo con fondo blanco** en login — necesita PNG transparente
2. **admin-update-user** edge function no deployada — cambio de password desde Ajustes falla silenciosamente
3. **Rótulo SATO** — orientación y escala correctas en preview pero depende de configuración del servidor de impresión (pendiente acceso)
