# ALLEATA OPS PORTAL — Informe de Estado
**Fecha:** 08 de abril de 2026  
**Versiones actuales:** `index.html` v2.3.14 · `distri.html` v1.4.6 · `mobile-distri.html` v1.0.5  
**Repo:** github.com/marcevsanti-ux/alleata-ops  
**URL live:** https://marcevsanti-ux.github.io/alleata-ops/

---

## 1. RESUMEN EJECUTIVO

El portal interno de operaciones de **Andrés Moretti e Hijos S.A. (Alleata)** está en producción con los siguientes componentes activos:

| Archivo | Descripción | Versión |
|---------|-------------|---------|
| `index.html` | Portal desktop de operaciones | v2.3.14 |
| `distri.html` | Portal web para distribuidores | v1.4.6 |
| `mobile-distri.html` | App mobile para distribuidores | v1.0.5 |
| `mobile.html` | App mobile SIMs (OCR) | v1.0.5 |

**Stack:** GitHub Pages (frontend) + Supabase (backend/auth/DB)  
**Equipo:** marcelos (admin), Gonzalo Marvaldi, Andres Veyga, Angel Flores, Luciana Galvao

---

## 2. MÓDULOS IMPLEMENTADOS

### 2.1 Dashboard / Panel de Operaciones (home)
Panel central con KPIs en tiempo real:
- **4 gráficos SVG** generados dinámicamente: Instaladas hoy (KPI grande), Pre-Colecta por logística (dona), Entregas pendientes por estado (barras horizontales), Desinstalaciones por estado (dona)
- **6 KPIs**: OTs activas, Cambios activos, Rollouts activos, Retirar Terminal, Desins. activas, SLA Crítico
- **SLA por tipo de OT**: cards con semáforo verde/amarillo/rojo por tipo (Instalación, Cambio, Rollout, Desinstalación)
- **Resumen por operador** (solo admin): cards y tabla con activas / entregadas hoy / pre-colecta / retirar terminal / SLA crítico por cada operador
- **Accesos rápidos**: módulos disponibles según rol

### 2.2 SIMs (Verificador)
- Upload de fotos → OCR con **Gemini 2.0 Flash** vía Edge Function de Supabase (proxy para ocultar API key)
- Base de datos **6.878 SIMs CLARO** en tabla `sims` de Supabase (migrado de JSON embebido)
- Lookup inteligente: serie completa → línea → sufijo → últimos 9 dígitos
- Búsqueda manual por serie, sufijo o línea
- Importación masiva de Excel CLARO via módulo Ajustes (upsert por serie)

### 2.3 Envíos (Logística Directa)
**Dos canales de logística con selector visual:**

#### Canal ALLEATA (Logística Propia — Hoja de Ruta)
- Import Excel SF "Pre-Colecta todas las logísticas" → filtra solo ALLEATA
- OTs en estado Pre-Colecta, sin modificar las ya existentes (insert-only)
- Vista con **zonas AMBA**: CABA / Zona Norte / Zona Sur / Zona Oeste / Fuera AMBA
- Distancia estimada desde punto central (km)
- Impresión de rótulos con QR de geolocalización y QR de ruta

#### Canal Correo Argentino
- Import Excel SF (DESPACHADO CORREO ARGENTINO)
- Estado auto-detectado desde campo Observaciones
- Link directo a tracking en correoargentino.com.ar
- Botón 🔍 para consultar tracking vía proxy Railway (pendiente configuración)

**Funcionalidades comunes:**
- Admin ve todas las OTs con filtros por responsable y estado
- Operador ve solo sus OTs (match por primer nombre)
- Selector de estado por OT con audit log
- Observaciones editables
- Impresión de rótulos profesionales 100x150mm con QR doble
- Impresión masiva de rótulos seleccionados
- Asignación de OTs a distribuidores (botón 👤)
- Logística inversa (Cambio de Terminal / Rollout): tracking de retorno, selector de estado de devolución, rótulo de retorno imprimible

### 2.4 Desinstalaciones (Logística Inversa)
- Fuente: vista `v_ordenes_con_sla` de Supabase
- Tabla con ordenamiento por columna, búsqueda y filtros: estado, zona (AMBA/Interior), SLA, operador
- **Semáforo SLA**: Verde (< 3 días) / Alerta (3-6 días) / Crítico (≥ 7 días)
- Modal de detalle completo por OT: datos de comercio, contacto, horario, dirección, SLA bar visual
- Cambio de estado + observación con audit log y registro en `eventos_ot`
- Contadores por estado en cards clickeables (filtro rápido)

### 2.5 Horas
- Registro de horas trabajadas por integrante
- Navegación por semana
- Cards de equipo con totales semanales
- Tabla de detalle con eliminación

### 2.6 Ajustes (solo Admin)
- Crear usuarios (via Edge Function `admin-create-user`) — email confirmado automáticamente
- Editar nombre, celular, contraseña, rol y módulos por usuario
- Pills interactivas de módulos (toggle en tiempo real)
- Selector de rol: Operador / Logística / Admin
- Importación masiva de SIMs desde Excel
- Log de auditoría con filtros por tabla, acción y búsqueda de texto
- Módulo "Devoluciones" eliminado del sistema

### 2.7 Distribuidores (solo Admin)
Sistema completo de gestión de distribuidores externos:
- Alta/edición de distribuidores con radio de cobertura en km
- **Cálculo automático de OTs en radio**: combina `envios` (logística directa) + `v_ordenes_con_sla` (desinstalaciones) con haversine + fallback por ciudad
- **Cache de OTs** (`distribuidores.ots_cache`): el portal guarda las OTs calculadas cada vez que renderiza; el dash distri las lee directamente sin recalcular
- QR generado por distribuidor que apunta a `distri.html?token=UUID`
- Botón "Copiar link" para compartir por WhatsApp
- Listado de OTs en radio (modal con tabla + distancia)

---

## 3. PORTAL DISTRIBUIDOR (distri.html)

App web para que cada distribuidor gestione sus OTs de campo:

### Vistas
- **OTs**: lista de todas las OTs en su radio, con filtros Pendiente / Contactado / No encontrado / Exitoso / Confirmado
- **Agenda**: calendario mensual con OTs agendadas para llamado
- **Hoja de Ruta**: calendario mensual con retiros confirmados; vista de día con mapa Leaflet y botón "Abrir ruta completa en Maps"; impresión PDF profesional

### Gestión de estados
- Modal por OT: chips de estado, observaciones, fecha de retiro
- Guardado en tabla `distri_reportes` (Supabase) con clave `sf_id = número de OT`
- Estados disponibles: Pendiente / Contactado / No encontrado / Confirmado retiro / Exitoso

### Datos
- Lee `distribuidores.ots_cache` directamente (calculado por el portal OPS)
- Sin queries a `envios` ni `v_ordenes_con_sla` — evita problemas de RLS con acceso anónimo

---

## 4. APP MOBILE DISTRIBUIDOR (mobile-distri.html)

App optimizada para celular:

### Filtros principales
- **🗓️ Hoja de Ruta hoy** (default): solo OTs con "Confirmado retiro" para la fecha de hoy
- **📦 Confirmadas**: todas las confirmadas sin importar fecha
- **Todas**: universo completo de OTs del distribuidor

### Stats en header
- Total retiros hoy / Pendientes / Contactadas / Exitosas

### Actualización de estado
- Modal de campo: estado + observación + fecha de retiro
- Upsert en `distri_reportes` con constraint `(distri_id, sf_id)`

---

## 5. BASE DE DATOS SUPABASE

### Tablas principales
| Tabla | Descripción |
|-------|-------------|
| `profiles` | Usuarios del sistema (rol, módulos, celular) |
| `envios` | OTs de logística directa importadas desde SF |
| `sims` | Base de 6.878 SIMs CLARO |
| `ordenes_trabajo` | OTs de desinstalación (logística inversa) |
| `eventos_ot` | Historial de cambios de estado en desinstalaciones |
| `distribuidores` | Distribuidores externos con radio y coords |
| `distri_reportes` | Estados de OTs gestionados por cada distribuidor |
| `audit_log` | Log de todas las acciones del sistema |
| `contactos` | Contactos para Ally (notificaciones WhatsApp) |
| `ally_grupos` | Grupos WhatsApp para Ally |
| `ally_reglas` | Reglas de notificación automática |

### Vistas
| Vista | Descripción |
|-------|-------------|
| `v_ordenes_con_sla` | Desinstalaciones con cálculo de SLA, zona, días transcurridos |

### Columnas relevantes de `envios`
```
sf_id, ot_numero, tipo, responsable, cuenta, track, fecha, ciudad, provincia,
cp_dest, direccion_completa, contacto, horario, nombre_comercio, cuit,
logistica, estado, estado_devolucion, track_devolucion, rotulo_devolucion_dentro,
costo_envio, notas, ultimo_evento, ultimo_evento_fecha, asignado_a,
foto_evidencia, notas_cierre
```

### Columnas relevantes de `distribuidores`
```
id, nombre, apellido, direccion, cp, localidad, provincia,
lat, lon, radio, whatsapp, email, activo,
ots_cache (jsonb), ots_cache_at (timestamptz)
```

### SQL pendiente ejecutar (si no está)
```sql
alter table distribuidores add column if not exists ots_cache jsonb;
alter table distribuidores add column if not exists ots_cache_at timestamptz;
alter table distri_reportes alter column sf_id drop not null;
alter table ordenes_trabajo add column if not exists asignado_a uuid references auth.users(id);
alter table envios add column if not exists asignado_a uuid references auth.users(id);
alter table envios add column if not exists foto_evidencia text;
alter table envios add column if not exists notas_cierre text;

-- Limpiar módulo devoluciones de todos los perfiles
update profiles set modulos = array_remove(modulos, 'devoluciones')
where 'devoluciones' = any(modulos);
```

---

## 6. INTEGRACIÓN CORREO ARGENTINO API — Estado actual

### Información confirmada (respuesta 08/04/2026 — Mariángeles Kalayuki, Soporte TI)
- **No requiere certificado TLS** — el API de MiCorreo NO usa mutual TLS (aclaración importante respecto a la información anterior)
- **URL base producción:** `https://api.correoargentino.com.ar/micorreo/v1`
- **Customer ID:** se obtiene vía `POST /register` → validar con `POST /user/validate`
- **Rótulos PDF:** se generan automáticamente al operar vía API (pospago, cuenta corriente)
- **Manual de integración:** pendiente de obtener de parte de CA

### Flujo de integración planeado
```
1. POST /register          → obtener Customer ID
2. POST /user/validate     → validar Customer ID
3. POST /token             → obtener JWT (Basic Auth con usuario+password)
4. GET  /shipping/tracking → consultar estado de envío
5. POST /shipping/import   → registrar nuevo envío
```

### Próximos pasos
1. Obtener manual de integración completo de CA
2. Implementar endpoint de tracking (`consultarTracking()` ya está preparado en el portal, apunta a Railway proxy — revisar si se puede llamar directo desde frontend sin CORS)
3. Implementar registro de envíos desde el portal al despachar Pre-Colecta Alleata

---

## 7. ARQUITECTURA TÉCNICA

```
┌─────────────────────────────────────────────────────┐
│                  GitHub Pages                        │
│                                                      │
│  index.html (v2.3.14)   — Portal OPS Admin/Operador │
│  distri.html (v1.4.6)   — Portal Distribuidor       │
│  mobile-distri.html     — App Mobile Distribuidor   │
│  mobile.html            — App Mobile SIMs           │
└──────────────────┬──────────────────────────────────┘
                   │ Supabase JS SDK
┌──────────────────▼──────────────────────────────────┐
│                  Supabase                            │
│                                                      │
│  Auth          — Login con email/password            │
│  Database      — PostgreSQL (tablas + vistas)       │
│  RLS           — Políticas por user_id y rol        │
│  Edge Functions — gemini-proxy, admin-create-user   │
│                   admin-update-user                  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  APIs externas                                       │
│                                                      │
│  Gemini 2.0 Flash  — OCR de chips SIM               │
│  Google Maps       — QR de geolocalización          │
│  Leaflet/OSM       — Mapa en Hoja de Ruta distri    │
│  Correo Argentino  — Tracking (integración pendiente)│
└─────────────────────────────────────────────────────┘
```

---

## 8. ROLES Y PERMISOS

| Rol | Acceso |
|-----|--------|
| **admin** | Todo: dashboard, SIMs, envíos (ambos canales), desinstalaciones, horas, ajustes, distribuidores |
| **logistica** | Envíos canal ALLEATA + zonas AMBA + rótulos |
| **operador** | Solo sus módulos habilitados + sus OTs (filtro por nombre) |
| **distri** | Solo via `distri.html` — sus OTs asignadas |

---

## 9. PENDIENTES Y PRÓXIMOS PASOS

### Alta prioridad
- [ ] Integración CA API: obtener manual + implementar tracking automático
- [ ] Fix `distri_reportes`: verificar que el guardado desde `distri.html` v1.4.6 funcione correctamente (sf_id = número OT, constraint nullable)
- [ ] Reunión devs Salesforce — Connected App + sandbox credentials

### Media prioridad
- [ ] Módulo Config. Ally (actualmente no renderiza)
- [ ] Agregar rol `distri` como opción en selector de Ajustes
- [ ] Actualización automática de estados desde CA (polling o webhook)
- [ ] Notificaciones WhatsApp/SMS al celular del operador

### Deuda técnica
- [ ] `distri_reportes`: limpiar filas con sf_id null de pruebas anteriores
- [ ] `distri_reportes`: hacer constraint nullable permanente en producción
- [ ] Logo con fondo blanco en login (necesita PNG transparente)

---

## 10. HISTORIAL DE VERSIONES (sesión actual)

| Versión | Fecha | Cambios principales |
|---------|-------|---------------------|
| index v2.3.9 | 07/04 | Fix distri_getOts: agrega desinstalaciones + OTs sin CP incluidas |
| index v2.3.10 | 07/04 | Fix radio distri: fallback por ciudad con CIUDAD_COORDS |
| index v2.3.11 | 07/04 | Cache de OTs en distribuidores.ots_cache al renderizar módulo |
| index v2.3.12 | 07/04 | Cache usa sf_id = número OT (no sf_id de SF); CP limpio sin letra |
| index v2.3.13 | 08/04 | Elimina pill "Devoluciones" de Ajustes (crear y editar usuario) |
| index v2.3.14 | 08/04 | Elimina Devoluciones de MODS_DEF — no aparece ni grisada |
| distri v1.3.x | 07/04 | Migración de Sheets a Supabase; fix variables globales; filtros |
| distri v1.4.0 | 07/04 | Normalización de acentos en ciudades; ciudades nuevas |
| distri v1.4.3 | 08/04 | Lee ots_cache directamente; sin queries a v_ordenes_con_sla |
| distri v1.4.4 | 08/04 | Fix: sf_id = número OT para guardar en distri_reportes |
| distri v1.4.5 | 08/04 | Debug log en saveModal |
| distri v1.4.6 | 08/04 | Fix crítico: captura sfId ANTES de closeModal() que lo reseteaba a null |
| mobile-distri v1.0.2 | 08/04 | Migra a ots_cache; normalización de campos |
| mobile-distri v1.0.3 | 08/04 | Solo muestra OTs con retiro confirmado para hoy |
| mobile-distri v1.0.4 | 08/04 | Filtros: Hoja de Ruta hoy / Confirmadas / Todas |
| mobile-distri v1.0.5 | 08/04 | Fix getRep(): busca por sf_id, ot y String(ot) |
