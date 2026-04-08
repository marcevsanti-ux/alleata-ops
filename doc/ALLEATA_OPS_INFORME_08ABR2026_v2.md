# ALLEATA OPS PORTAL — Informe de Estado
**Fecha:** 08 de abril de 2026  
**Versiones actuales:** `index.html` v2.3.15 · `distri.html` v1.4.6 · `mobile-distri.html` v1.0.5  
**Repo:** github.com/marcevsanti-ux/alleata-ops  
**URL live:** https://marcevsanti-ux.github.io/alleata-ops/

---

## 1. RESUMEN EJECUTIVO

El portal interno de operaciones de **Andrés Moretti e Hijos S.A. (Alleata)** está en producción con los siguientes componentes activos:

| Archivo | Descripción | Versión |
|---------|-------------|---------|
| `index.html` | Portal desktop de operaciones | v2.3.15 |
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
- Base de datos **6.878 SIMs CLARO** en tabla `sims` de Supabase
- Lookup inteligente: serie completa → línea → sufijo → últimos 9 dígitos
- Búsqueda manual por serie, sufijo o línea
- Importación masiva de Excel CLARO via módulo Ajustes (upsert por serie)

### 2.3 Envíos (Logística Directa)
**Dos canales de logística con selector visual:**

#### Canal ALLEATA (Logística Propia — Hoja de Ruta)
- Import Excel SF "Pre-Colecta todas las logísticas" → filtra solo ALLEATA
- Vista con **zonas AMBA**: CABA / Zona Norte / Zona Sur / Zona Oeste / Fuera AMBA
- Impresión de rótulos con QR de geolocalización y QR de ruta

#### Canal Correo Argentino
- Import Excel SF (DESPACHADO CORREO ARGENTINO)
- Estado auto-detectado desde campo Observaciones
- **Tracking integrado vía API MiCorreo** (botón 🔍 por OT) — ver sección 6

**Funcionalidades comunes:**
- Admin ve todas las OTs con filtros por responsable y estado
- Operador ve solo sus OTs (match por primer nombre)
- Selector de estado por OT con audit log
- Impresión de rótulos profesionales 100x150mm con QR doble
- Asignación de OTs a distribuidores
- Logística inversa (Cambio de Terminal / Rollout): tracking de retorno, selector de estado de devolución, rótulo de retorno imprimible

### 2.4 Desinstalaciones (Logística Inversa)
- Fuente: vista `v_ordenes_con_sla` de Supabase
- Semáforo SLA: Verde (< 3 días) / Alerta (3-6 días) / Crítico (≥ 7 días)
- Modal de detalle completo por OT
- Cambio de estado + observación con audit log

### 2.5 Horas
- Registro de horas trabajadas por integrante
- Navegación por semana, cards de equipo con totales

### 2.6 Ajustes (solo Admin)
- Crear/editar usuarios (Edge Function `admin-create-user`)
- Pills interactivas de módulos, selector de rol
- Importación masiva de SIMs desde Excel
- Log de auditoría con filtros

### 2.7 Distribuidores (solo Admin)
- Alta/edición de distribuidores con radio de cobertura
- Cálculo automático de OTs en radio (haversine + fallback por ciudad)
- Cache de OTs en `distribuidores.ots_cache`
- QR por distribuidor → `distri.html?token=UUID`

---

## 3. PORTAL DISTRIBUIDOR (distri.html) — v1.4.6

- **OTs**: lista con filtros de estado
- **Agenda**: calendario mensual con OTs agendadas
- **Hoja de Ruta**: mapa Leaflet + impresión PDF
- Guardado en `distri_reportes` con sf_id = número OT

---

## 4. APP MOBILE DISTRIBUIDOR (mobile-distri.html) — v1.0.5

- Filtros: Hoja de Ruta hoy / Confirmadas / Todas
- Stats en header: retiros hoy / pendientes / contactadas / exitosas
- Upsert en `distri_reportes`

---

## 5. BASE DE DATOS SUPABASE

### Tablas principales
| Tabla | Descripción |
|-------|-------------|
| `profiles` | Usuarios del sistema |
| `envios` | OTs de logística directa |
| `sims` | 6.878 SIMs CLARO |
| `ordenes_trabajo` | OTs de desinstalación |
| `eventos_ot` | Historial de cambios de estado |
| `distribuidores` | Distribuidores externos |
| `distri_reportes` | Estados de OTs por distribuidor |
| `audit_log` | Log de acciones del sistema |
| `contactos` | Contactos para Ally |
| `ally_grupos` | Grupos WhatsApp para Ally |
| `ally_reglas` | Reglas de notificación |

### Edge Functions activas
| Función | Descripción |
|---------|-------------|
| `gemini-proxy` | OCR de chips SIM via Gemini 2.0 Flash |
| `admin-create-user` | Creación de usuarios con email confirmado |
| `admin-update-user` | Edición de usuarios |
| `ca-proxy` | Proxy API MiCorreo — tracking CA (v1.1.0) |

---

## 6. INTEGRACIÓN CORREO ARGENTINO API — Estado actual

### ✅ Implementado y funcionando (ambiente TEST)
- **Edge Function `ca-proxy` v1.1.0** deployada en Supabase
  - `POST /token` → obtiene JWT con Basic Auth (usuario + password)
  - `GET /shipping/tracking?shippingId=...` → consulta estado del envío
  - Cache del token en memoria mientras la función está "caliente"
  - CORS configurado para `marcevsanti-ux.github.io`
- **Modal de tracking** en el portal (botón 🔍 por OT):
  - Spinner mientras carga
  - Tabla de eventos: fecha, estado, sucursal, detalle
  - Badge de estado (verde si entregado, azul si en tránsito)
  - Actualización automática del estado en Supabase si hay eventos
  - Manejo de errores con mensaje descriptivo

### Credenciales y configuración
| Variable | Valor |
|----------|-------|
| Usuario | MorettiAPI |
| Contraseña | Pelota22+ |
| Customer ID | 0001226778 |
| Ambiente actual | TEST (`apitest.correoargentino.com.ar`) |
| Ambiente productivo | `api.correoargentino.com.ar` (pendiente credenciales) |

### Pendiente para pasar a producción
1. **Credenciales productivas** — solicitadas a Mariángeles Kalayuki (mail enviado 08/04/2026)
2. **Número de tracking de prueba en ambiente test** — solicitado en mismo mail
3. Una vez recibidas: cambiar `CA_BASE_URL` en la Edge Function y re-deployar

### Notas técnicas
- CA devuelve `"expire"` (sin 's') — corregido en v1.1.0
- `GET /shipping/tracking` no acepta body — se usa query param `?shippingId=`
- JWT de CA expira en ~2hs; la función lo cachea y renueva automáticamente

---

## 7. ARQUITECTURA TÉCNICA

```
┌─────────────────────────────────────────────────────┐
│                  GitHub Pages                        │
│  index.html (v2.3.15)   — Portal OPS               │
│  distri.html (v1.4.6)   — Portal Distribuidor       │
│  mobile-distri.html     — App Mobile Distribuidor   │
│  mobile.html            — App Mobile SIMs           │
└──────────────────┬──────────────────────────────────┘
                   │ Supabase JS SDK
┌──────────────────▼──────────────────────────────────┐
│                  Supabase                            │
│  Auth · Database · RLS                              │
│  Edge Functions:                                     │
│    gemini-proxy · admin-create-user                 │
│    admin-update-user · ca-proxy                     │
└─────────────────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│  APIs externas                                       │
│  Gemini 2.0 Flash  — OCR chips SIM                 │
│  Correo Argentino  — Tracking (TEST ok, PROD pend.) │
│  Google Maps       — QR geolocalización             │
│  Leaflet/OSM       — Mapa hoja de ruta distri       │
└─────────────────────────────────────────────────────┘
```

---

## 8. ROLES Y PERMISOS

| Rol | Acceso |
|-----|--------|
| **admin** | Todo |
| **logistica** | Envíos canal ALLEATA + zonas AMBA + rótulos |
| **operador** | Sus módulos habilitados + sus OTs |
| **distri** | Solo via `distri.html` |

---

## 9. PENDIENTES Y PRÓXIMOS PASOS

### Alta prioridad
- [ ] Recibir credenciales productivas CA + cambiar URL en `ca-proxy`
- [ ] Validar tracking con número real en ambiente productivo
- [ ] Fix `distri_reportes`: verificar guardado desde `distri.html` v1.4.6
- [ ] Reunión devs Salesforce — Connected App + sandbox credentials

### Media prioridad
- [ ] Módulo Config. Ally (actualmente no renderiza)
- [ ] Agregar rol `distri` en selector de Ajustes
- [ ] Actualización automática de estados desde CA (polling o webhook)
- [ ] Notificaciones WhatsApp/SMS al celular del operador

### Deuda técnica
- [ ] `distri_reportes`: limpiar filas con sf_id null
- [ ] Logo con fondo blanco en login (necesita PNG transparente)

---

## 10. HISTORIAL DE VERSIONES

| Versión | Fecha | Cambios |
|---------|-------|---------|
| index v2.3.13 | 08/04 | Elimina pill "Devoluciones" de Ajustes |
| index v2.3.14 | 08/04 | Elimina Devoluciones de MODS_DEF |
| index v2.3.15 | 08/04 | Integración CA API: tracking via ca-proxy Edge Function |
| ca-proxy v1.0.0 | 08/04 | Edge Function inicial |
| ca-proxy v1.1.0 | 08/04 | Fix: query param en GET, fix expire sin 's', logging |
