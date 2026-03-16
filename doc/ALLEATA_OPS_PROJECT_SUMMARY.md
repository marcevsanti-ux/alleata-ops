# ALLEATA OPS PORTAL — Estado del Proyecto
**Fecha:** 16 mar 2026 | **Versión actual:** v1.6.1 (desktop) · v2.2.0 (mobile)

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
- **Modelo:** gemini-2.5-flash
- **Proxy URL:** https://njkstpfmcfhqxdadqbdy.supabase.co/functions/v1/gemini-proxy
- **IMPORTANTE:** Key guardada como secret `GEMINI_KEY` en Supabase — nunca expuesta en código fuente

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
| index.html | Portal desktop completo | v1.6.1 |
| mobile.html | App mobile | v2.2.0 |
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

### Tabla: sims (6.891 registros)
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
estado text                -- Pre-Colecta | Despachado | En tránsito | En camino | Entregado | Demorado | Perdido | Devuelto
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
- **AI/OCR:** Gemini 2.5 Flash via Supabase Edge Function proxy
- **Storage:** Supabase PostgreSQL

### Edge Functions deployadas
| Función | Descripción | JWT |
|---------|-------------|-----|
| gemini-proxy | Proxy seguro para Gemini API | no-verify |
| admin-create-user | Crea usuarios con service role key | no-verify |

---

## 🖥️ PORTAL DESKTOP (index.html) — v1.6.1

### Roles y permisos
| Rol | Puede ver | Puede hacer |
|-----|-----------|-------------|
| admin | Todo | Import Excel, crear usuarios, imprimir rótulos, ajustes |
| operador | Sus OTs (por nombre responsable) | Imprimir rótulos de sus OTs, cambiar estado |
| logistica | OTs donde logistica='ALLEATA' | Ver zonas, ver ruta, sin impresión |

### Módulo: Envíos
- **Dos imports SF:**
  - 🚚 Correo Argentino — Excel "DESPACHADO CORREO ARGENTINO" (fila headers con "N° de seguimiento")
  - 🗺️ Pre-Colecta ALLEATA — Excel "PRE-COLECTA", filtra solo logística ALLEATA, link directo a SF
- **Vista admin/operador:** checkboxes + botón "Imprimir seleccionados" + stats (total/tránsito/entregados/problemas)
- **Vista logística (Marcelo):** 6 cards de zona clickeables como filtros (CABA/Norte/Sur/Oeste/Fuera/Todas) con contador y km promedio — sin checkboxes, sin impresión
- **Columnas tabla:** OT/Cuenta, Responsable, Zona, Tracking, Distancia, Destino, Costo, Estado, Obs, Acciones
- **Columna Zona** detectada por ciudad/municipio con colores: 🏙️CABA(azul) ⬆️Norte(verde) ⬇️Sur(amarillo) ⬅️Oeste(violeta) 📦Fuera(rojo)
- **Columna Distancia:** Haversine desde California 2082, Barracas (-34.648, -58.377) — colores: verde<20km, amarillo<40km, rojo>40km
- **Estados:** Pre-Colecta → Despachado → En tránsito → En camino → En espera en sucursal → Entregado / Demorado / Perdido / Devuelto
- **Banner MiCorreo** oculto para rol logística

### Módulo: Rótulos (impresión)
- Botón 🖨️ por OT + botón masivo "Imprimir seleccionados"
- Diseño 100x150mm para impresora SATO
- Contenido: tipo OT, número OT grande, destinatario, dirección completa, CP, localidad, provincia, contacto, horario, nombre fantasía, OBS
- **QR Geoubicación** (izquierda): abre Google Maps con la dirección
- **QR Ruta** (derecha, al lado del Nro OT): URL `mobile.html?ot=sf_id` — Marcelo lo escanea para agregar a su ruta
- Badge tipo: INS / CAM / RET según tipo de OT
- Solo visible para admin y operador

### Módulo: SIMs
- Consulta tabla `sims` en Supabase (no DB embebida)
- Upload foto → OCR Gemini 2.5 Flash via proxy
- Lookup: serie completa → línea → sufijo → búsqueda parcial
- Stats dinámicas desde Supabase

### Módulo: Ajustes (solo admin)
- **Sección Base SIMs:** stats (total/asignadas/disponibles/extraviadas) + upload Excel CLARO → upsert masivo por serie (lotes de 500)
- **Crear usuario:** via edge function `admin-create-user` (service role key segura)
- **Editar usuario:** nombre, celular, rol (Operador/Logística/Admin), módulos, password
- **Roles en selector:** Operador / Logística / Admin
- **Eliminar usuario:** elimina solo el perfil (no el auth user)

### Módulo: Devoluciones
- Registro con cliente, producto, motivo, estado, notas
- Estados: Pendiente / En proceso / Resuelta

### Módulo: Horas
- Control semanal por integrante con totales

### Dashboard
- Welcome banner con QR al mobile (APP MOBILE en teal)
- Cards de módulos con stats dinámicas

---

## 📱 APP MOBILE (mobile.html) — v2.2.0

### 4 tabs
| Tab | Icono | Función |
|-----|-------|---------|
| Ruta | 📦 | Hoja de ruta diaria (nuevo) |
| SIMs | 📡 | OCR scanner de chips |
| Buscar | 🔍 | Búsqueda manual SIMs |
| Historial | 🕐 | Últimos 100 escaneos |

### Tab Ruta (nuevo en v2.2.0)
**Flujo completo:**
1. Marcelo abre el tab → ve OTs en tránsito activas
2. Activa cámara → escanea QR del rótulo de cada terminal que va a llevar
3. El QR contiene: `mobile.html?ot=sf_id`
4. El sistema busca la OT en Supabase y la agrega a "Mi ruta de hoy"
5. Puede quitar OTs con ✕
6. Presiona "✅ Confirmar ruta" → todas pasan a estado `En Tránsito`
7. En sección "🚚 En camino" ve sus OTs activas con:
   - Nombre comercio + dirección
   - 📞 Teléfono clickeable para llamar
   - ⏰ Horario de atención
   - 🗺️ Botón Maps → abre Google Maps con la dirección
   - Botones ✅ Entregado / ❌ Fallido → cierran la OT

### Tab SIMs
- Cámara trasera con BarcodeDetector + Gemini OCR fallback
- Prompt: prefijo arriba + sufijo abajo = ICCID completo
- Regex: `/8954\d{9,}/g` (ICCID) + `/\b0\d{7,9}\b/g` (sufijo)
- Lookup en tabla `sims` de Supabase
- Vibración al encontrar resultado

### Otros tabs
- Buscar: búsqueda manual por serie/sufijo/línea en Supabase
- Historial: localStorage, últimos 100 escaneos

---

## 📄 FORMATO EXCEL SF

### Pre-Colecta (Hoja de Ruta ALLEATA)
- Fila de encabezados contiene: "Id. de orden de trabajo"
- Columnas: Logística, Id. de OT, Responsable, Tipo, N° OT, Fecha creación, Nombre comercio, Cuenta, Contacto, Horario, Calle, Ciudad, CP, Provincia, Observaciones, CUIT, Email, N° seguimiento
- Filtra automáticamente solo `logistica = 'ALLEATA'`
- Estado importado: `Pre-Colecta`

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
| 📦 Fuera AMBA | Rojo | Resto del país — otra logística (pendiente) |

**Central de despacho:** California 2082, Barracas, CABA (-34.648, -58.377)
**Radio de cobertura Marcelo:** ~70km

---

## 🔮 ROADMAP

### Próximo — Alta prioridad
- [ ] **Auditoría de cambios** — tabla `audit_log` con quién cambió qué y cuándo
- [ ] **Edge function admin-update-user** — cambio de password desde Ajustes desktop
- [ ] **Evidencia fotográfica** — foto al cerrar OT desde mobile

### Medio plazo
- [ ] **WasenderAPI WhatsApp** — notificaciones automáticas por cambio de estado
  - OT Despachado → cliente recibe WhatsApp
  - OT Entregado → cliente + vendedor SF reciben confirmación
  - OT Fallida → vendedor SF recibe alerta
- [ ] **Dashboard métricas** para dirección (OTs entregadas, tiempo promedio, costo total)
- [ ] **Módulo Fuera de AMBA** — integración con otra logística (Correo Argentino / Express)

### Largo plazo
- [ ] **MiCorreo API** — tracking automático Correo Argentino
  - Base: https://api.correoargentino.com.ar/micorreo/v1
  - Auth: JWT via Basic Auth → Bearer token
- [ ] **Integración Salesforce** — sincronización bidireccional de OTs
- [ ] **Google Maps Distance Matrix** — distancia real por ruta (reemplaza Haversine)
- [ ] **Mobile módulo Envíos completo** — Andres/Gonzalo ven sus OTs en el celu

---

## 🐛 BUGS PENDIENTES
1. **Logo con fondo blanco** en login — necesita PNG transparente
2. **admin-update-user** edge function no deployada aún — cambio de password desde Ajustes falla silenciosamente
