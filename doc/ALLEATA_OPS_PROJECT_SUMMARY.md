# ALLEATA OPS PORTAL — Estado del Proyecto
**Fecha:** 16 mar 2026 | **Versión actual:** v1.6.7 (desktop) · v2.3.5 (mobile)

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
| index.html | Portal desktop completo | v1.6.7 |
| mobile.html | App mobile | v2.3.5 |
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
serie text
linea text
ubicacion text
cuenta text
estado text  -- ASIGNADA | DISPONIBLE | SIN INFORMACIÓN | EXTRAVIADA | ENVIO FALLIDO | TERMINAL DEVUELTA
updated_at timestamptz
```

### Tabla: envios
```sql
id uuid
user_id uuid
sf_id text UNIQUE
ot_numero text
tipo text
responsable text
cuenta text
track text
fecha text
ciudad text
provincia text
cp_dest text
asignacion text
notas text
costo_envio numeric
estado text   -- Pre-Colecta | Despachado | En tránsito | En camino | Entregado | Demorado | Perdido | Devuelto
logistica text  -- ALLEATA | EXPRESS METROPOLITANA | etc
nombre_comercio text
contacto text
horario text
cuit text
email_dest text
email_contacto text
direccion_completa text
foto_evidencia text        -- URL foto en Supabase Storage bucket 'evidencias'
dato_envio text            -- Información correcta | Falta horarios | Mal indicada la dirección | Mal indicados los horarios
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

### Tabla: audit_log (NUEVA)
```sql
id uuid PRIMARY KEY
tabla text              -- 'envios' | 'profiles' | 'devoluciones' | 'horas'
registro_id text        -- UUID del registro afectado
accion text             -- 'INSERT' | 'UPDATE' | 'DELETE'
campo text              -- campo modificado (null en INSERT/DELETE)
valor_antes text        -- valor previo
valor_despues text      -- valor nuevo
usuario_id uuid
usuario_email text
created_at timestamptz
```
**Triggers activos:** `trg_audit_envios`, `trg_audit_profiles`, `trg_audit_devoluciones`, `trg_audit_horas`
Función: `fn_audit_log()` — captura campo por campo en UPDATEs

### Tabla: rutas_diarias (NUEVA)
```sql
id uuid PRIMARY KEY
fecha date
user_id uuid
ots_ids text[]          -- IDs de envios en orden de visita
ots_numeros text[]      -- números OT para lectura rápida
km_total numeric(8,1)   -- km totales Haversine (ida + vuelta Barracas)
km_detalle jsonb        -- [{ot_numero, ciudad, km_desde_anterior}]
confirmada_at timestamptz
created_at timestamptz
```

### Supabase Storage
- **Bucket:** `evidencias` (público)
- Fotos de evidencia de entrega subidas desde mobile
- Path: `evidencias/{envio_id}_{timestamp}.jpg`

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

-- audit_log
CREATE POLICY "audit_log_admin_read" ON audit_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin')
);

-- rutas_diarias
CREATE POLICY "rutas_select" ON rutas_diarias FOR SELECT TO authenticated USING (true);
CREATE POLICY "rutas_insert" ON rutas_diarias FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "rutas_update" ON rutas_diarias FOR UPDATE TO authenticated USING (true);
```

---

## 🏗️ ARQUITECTURA

### Stack
- **Frontend:** HTML/JS puro — GitHub Pages (sin framework)
- **Backend:** Supabase (PostgreSQL + Auth + Edge Functions + Storage)
- **AI/OCR:** Gemini 2.5 Flash via Supabase Edge Function proxy
- **Storage:** Supabase PostgreSQL + Storage (evidencias)

### Edge Functions deployadas
| Función | Descripción | JWT |
|---------|-------------|-----|
| gemini-proxy | Proxy seguro para Gemini API | no-verify |
| admin-create-user | Crea usuarios con service role key | no-verify |

---

## 🖥️ PORTAL DESKTOP (index.html) — v1.6.7

### Roles y permisos
| Rol | Puede ver | Puede hacer |
|-----|-----------|-------------|
| admin | Todo | Import Excel, crear usuarios, imprimir rótulos, ajustes, auditoría |
| operador | Sus OTs (por nombre responsable) | Imprimir rótulos, cambiar estado |
| logistica | OTs donde logistica='ALLEATA' | Ver zonas, ver ruta, sin impresión |

### Módulo: Envíos (v1.6.7)
- **Stats globales:** Total OTs / En tránsito / Entregados / Con problema
- **Stats por logística:** Cards separadas por cada logística con sus propios contadores (teal=ALLEATA, azul=Correo Argentino). Se muestran siempre para admin.
- **Dos imports SF:**
  - 🚚 Correo Argentino — Excel "DESPACHADO CORREO ARGENTINO"
  - 🗺️ Pre-Colecta ALLEATA — Excel "PRE-COLECTA", solo logística ALLEATA
- **Columna OBS** muestra: notas SF + último evento + dato_envio (amarillo) + notas_cierre (itálica) + thumbnail foto evidencia (clickeable)
- **Rótulos:** Badge tipo (INS/CAM/RET) + Badge zona (CABA/ZN/ZS/ZO/FUERA) con colores
- **QR del rótulo:** URL `mobile.html?ot=sf_id` (fix: usa `sfIdParaQR = e.sf_id || e.id`)

### Módulo: Ajustes (v1.6.7)
- Crear/editar/eliminar usuarios
- Base SIMs: upload Excel CLARO → upsert masivo
- **Log de Auditoría (NUEVO):** Tabla paginada (50 registros/pág) con filtros por tabla, acción y búsqueda. Muestra: fecha/hora, usuario, tabla, acción (colores), campo, valor antes (rojo), valor después (teal).

### Zonas AMBA
**Central de despacho:** California 2082, Barracas (-34.648, -58.377)
| Zona | Color | Badge rótulo |
|------|-------|--------------|
| CABA | Azul #1a9fd4 | CABA |
| Zona Norte | Verde #10b981 | ZN |
| Zona Sur | Amarillo #f59e0b | ZS |
| Zona Oeste | Violeta #8b5cf6 | ZO |
| Fuera AMBA | Rojo #ef4444 | FUERA |

---

## 📱 APP MOBILE (mobile.html) — v2.3.5

### Tabs
| Tab | Default | Función |
|-----|---------|---------|
| BUSCAR | ✅ (default al cargar) | Búsqueda manual SIMs |
| RUTA | — | Hoja de ruta diaria |
| SIMS | — | OCR scanner chips |
| HISTORIAL | — | Últimos 100 escaneos |

**IMPORTANTE:** Tab default es BUSCAR para que el primer tap en RUTA dispare el pedido de permiso de cámara en iOS (requerimiento del sistema).

### Tab RUTA — Flujo completo (v2.3.5)

**Armar ruta (mañana, en la oficina):**
1. Marcelo toca tab RUTA → overlay "📷 Tocá para activar la cámara"
2. Toca el overlay → iOS pide permiso cámara → acepta
3. Apunta al QR del rótulo → scanner detecta automáticamente
4. Aparece card con info de la OT: tipo, número, zona, comercio, dirección, horario, teléfono
5. Toca **"✅ Aceptar OT"** → pasa a `En tránsito` + se agrega a `rutaDelDia`
6. Se calculan km: Barracas → OT1 → OT2 → ... → OTn → Barracas (Haversine)
7. Se guarda en tabla `rutas_diarias` (upsert por fecha)
8. Indicador km aparece en pantalla con desglose por parada
9. Repite para cada rótulo

**En camino (durante el día):**
- Sección "🚚 EN RUTA HOY" con todas las OTs en tránsito
- Por cada OT: dirección, teléfono clickeable, horario, botón Maps
- **✅ Entregado / ❌ Fallido** → abre modal de cierre

**Modal de cierre:**
- Dropdown "Datos de envío": Ninguno / Información correcta / Falta horarios / Mal indicada la dirección / Mal indicados los horarios
- Campo Observaciones (libre)
- Foto de evidencia — **obligatoria** si eligió "Mal indicada la dirección"
- Sube foto a Supabase Storage bucket `evidencias`
- Guarda: `estado`, `resultado`, `dato_envio`, `notas_cierre`, `foto_evidencia`, `fecha_cierre`, `ultimo_evento`

### Scanner QR
- **setInterval** cada 350ms (más confiable que rAF en iOS)
- **Method 1:** BarcodeDetector (Chrome Android)
- **Method 2:** jsQR (iOS Safari, Firefox) — cargado desde CDN
- **Fallback:** Botón "📷 Usar cámara nativa" → toma foto → procesa QR
- Flag `_scanning` para evitar procesamiento simultáneo

### Km de ruta
- Cálculo Haversine desde `COORDS_CIUDAD` (diccionario de ~40 municipios AMBA)
- Punto base: California 2082, Barracas (-34.648, -58.377)
- Fórmula: BASE → OT1 → OT2 → ... → OTn → BASE
- Guardado en `rutas_diarias` con detalle por parada en jsonb
- Al recargar la app, restaura el indicador del día desde Supabase

### Tab SIMs
- Cámara trasera con jsQR + Gemini OCR fallback
- Lookup en tabla `sims` de Supabase

---

## 📄 FORMATO EXCEL SF

### Pre-Colecta (Hoja de Ruta ALLEATA)
- Fila de encabezados contiene: "Id. de orden de trabajo"
- Filtra automáticamente solo `logistica = 'ALLEATA'`
- Estado importado: `Pre-Colecta`

### Despachado Correo Argentino
- Fila de encabezados contiene: "N° de seguimiento"
- Estado auto-detectado desde campo Observaciones

---

## 🗺️ ZONAS AMBA
**Central:** California 2082, Barracas, CABA (-34.648, -58.377)
**Radio cobertura Marcelo:** ~70km

---

## 🔮 ROADMAP

### Alta prioridad
- [ ] **WasenderAPI WhatsApp** — `WASENDER_KEY=''` ya en código, listo para activar
  - OT En Tránsito → WhatsApp al cliente
  - OT Entregada → WhatsApp cliente + vendedor SF
  - OT Fallida → WhatsApp vendedor SF
- [ ] **Edge function admin-update-user** — cambio de password desde Ajustes
- [ ] **Google Maps Distance Matrix** — reemplazar Haversine por distancia real por ruta

### Medio plazo
- [ ] **Dashboard métricas** — OTs entregadas, tiempo promedio, costo total, km recorridos
- [ ] **Módulo Fuera de AMBA** — integración Correo Argentino / Express
- [ ] **Mobile módulo Envíos** — Andres/Gonzalo ven sus OTs en el celu

### Largo plazo
- [ ] **MiCorreo API** — tracking automático Correo Argentino
  - Base: https://api.correoargentino.com.ar/micorreo/v1
  - Auth: JWT via Basic Auth → Bearer token
- [ ] **Integración Salesforce** — sincronización bidireccional

---

## 🐛 BUGS PENDIENTES
1. **Logo con fondo blanco** en login — necesita PNG transparente
2. **admin-update-user** edge function no deployada — cambio de password desde Ajustes falla silenciosamente

---

## 👥 EQUIPO
- **marcelos** (marcelos@moretti.com.ar) — Admin
- **Luciana Galvao** (luciana@alleata.com.ar) — Admin
- **Gonzalo Marvaldi** — Operador
- **Andres Veyga** — Operador
- **Angel Flores** — Operador
- **Marcelo** — Logística (ve hoja de ruta, acepta OTs, registra entregas)
