# TESORERÍA MORETTI — Estado del Proyecto
**Fecha:** 11 abr 2026 | **Versión actual:** v2.4.5

---

## 🔑 CREDENCIALES Y ACCESOS

### Supabase
- **Proyecto:** tesoreria-moretti
- **URL:** https://qqmzhwifrkgfrgewmpig.supabase.co
- **Anon Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxbXpod2lmcmtnZnJnZXdtcGlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2OTg4MzcsImV4cCI6MjA4OTI3NDgzN30.4W-n_WLRvcrE385qv0Phil4PrHrb1twpsZvxxIHodeg`
- **RLS:** DESACTIVADO — anon key tiene acceso completo de lectura
- **Plan:** Pro

### GitHub
- **Repo:** github.com/marcevsanti-ux/Tesorer-a-Moretti (público)
- **Commits:** 146 commits en main
- **URL live portal:** https://marcevsanti-ux.github.io/Tesorer-a-Moretti/
- **URL login:** https://marcevsanti-ux.github.io/Tesorer-a-Moretti/login.html

### Usuarios del sistema
| Usuario | Email | Rol |
|---------|-------|-----|
| Marcelo | marcelos@moretti.com.ar | admin |
| Micaela Santos | micasantosmoretti@gmail.com | operador |
| Julian | (a definir) | operador |
| Andres Moretti | (a definir) | consulta |

---

## 📁 ARCHIVOS DEL REPO

| Archivo | Descripción |
|---------|-------------|
| `index.html` | Portal principal — sistema completo de cheques |
| `login.html` | Pantalla de login con Supabase Auth |
| `mobile.html` | (presente en repo, contenido a confirmar) |
| `Codigo.gs` | Script Google Apps Script (legacy) |
| `snapshot.html` | ⚠️ PENDIENTE SUBIR — página pública para screenshot Puppeteer |

### ⚠️ RECUPERACIÓN URGENTE DEL INDEX.HTML
El `index.html` fue pisado accidentalmente. Para recuperarlo:
1. Ir a: `https://github.com/marcevsanti-ux/Tesorer-a-Moretti/commits/main/index.html`
2. El repo tiene **146 commits** — encontrar el último commit correcto (v2.4.5)
3. Hacer clic en el commit → "Browse files" → copiar el contenido del `index.html`
4. O usar: `git log --oneline index.html` desde la terminal para ver el historial

---

## 🗄️ BASE DE DATOS SUPABASE

### Tablas

#### cheques
```sql
id uuid
cliente text
nro_cheque text
tipo text                     -- 'Electronico' | 'Fisico'
tipo_letra text               -- 'V'
emision date
vencimiento date
fecha_rechazo date
mes text
anio integer
motivo text                   -- SIN FONDOS | CTA CERRADA | CUENTA EMBARGADA | etc.
importe numeric
gastos numeric
total numeric
detalle text
aviso date
tipo_cancelacion text
cancelacion date
importe_cancelacion numeric
pendiente numeric
envio text
cac_dev text
dias_mora integer
evidencia_url text
emisor text                   -- 'Propio' | 'Terceros'
hoja text                     -- 'RECHAZADOS' | 'CANCELADOS'
created_by uuid (FK auth.users)
created_at timestamptz
```

#### usuarios
```sql
id uuid (FK auth.users)
email text
nombre text
rol text                      -- 'admin' | 'operador' | 'consulta' | 'crediticio'
activo boolean
created_at timestamptz
```

#### configuracion
```sql
clave text (PK)
valor text
```
Claves usadas: `mail_to`, `mail_cc`, `mail_pago_proveedores`

#### logs
```sql
id uuid
accion text                   -- LOGIN | ALTA | MODIFICACION | BAJA | CONSULTA_CREDITICIA
cheque_id uuid
nro_cheque text
cliente text
usuario_id uuid
usuario_email text
usuario_nombre text
campo text
valor_anterior text
valor_nuevo text
cambios jsonb
detalle text
created_at timestamptz
```

### Storage Buckets
- `comprobantes` — PDFs e imágenes de comprobantes de cheques
- `reportes` — ⚠️ PENDIENTE CREAR — screenshots del dashboard para WA

### Funciones RPC
- `crear_usuario(p_id, p_nombre, p_email, p_rol)` — crea usuario bypasseando RLS

### Edge Functions
- `bcra-proxy` — proxy para API BCRA Central de Deudores
- `enviar-mail-rechazo` — notificación por email al cargar cheque

---

## 🏗️ ARQUITECTURA DEL PORTAL

### index.html (Portal Desktop)
- Login con Supabase Auth → redirige a `login.html` si no hay sesión
- Diseño dark con paleta rojo/negro Moretti
- 8 módulos con control de acceso por rol

### Módulos implementados

#### Dashboard
- KPIs: Total Pendiente, Importe Total, Gastos Bancarios, Mora Promedio, Total Registrados
- Cards recovery: Cheques Recuperados + Monto Recuperado
- Gráficos de barras: Pendiente por Motivo + Top Clientes por Deuda
- Tabla Mayor Mora — Top 10

#### Rechazados
- Tabla con todos los cheques rechazados
- Filtros: búsqueda, motivo, año, cliente
- Acciones: editar, eliminar (según rol), ver comprobante
- Modal edición: tipo cancelación, importe, fechas, emisor, detalle, comprobante (upload a Storage)

#### Cancelados
- Tabla de cheques recuperados (hoja CANCELADOS)

#### Resumen
- Tabla pivot: Motivo × Año → suma de pendiente por cliente
- Export CSV

#### Estado Crediticio
- Consulta API BCRA (proxy Supabase Edge Function + fallback Cloudflare Worker)
- Muestra situación crediticia por CUIT (1-6)
- Importación y análisis de informe Nosis con Gemini 2.5 Flash
- Export PDF del análisis Nosis (jsPDF + html2canvas)
- Feature Importance chart (Chart.js)

#### Importación (solo admin/operador)
- Upload de Excel con cheques rechazados
- Lee solapa RECHAZADOS desde fila 4
- Upsert en Supabase

#### Log
- Auditoría completa de acciones por usuario
- Filtros por acción y usuario

#### Configuración (admin)
- Gemini API Key (localStorage)
- Config mail (destinatario, CC, regla pago a proveedores)
- Gestión de usuarios: crear, editar rol, activar/desactivar
- Backup Excel completo (SheetJS)

### login.html
- Formulario email + password
- Supabase Auth → redirige al portal

---

## 🎨 DISEÑO

### Paleta
```css
--red:       #D4000A
--red2:      #A8000A
--black:     #080808
--dark:      #0F0F0F
--surf:      #141414
--surf2:     #1C1C1C
--green-lt:  #4ADE80
--amber-lt:  #FCD34D
```

### Fuentes
- Inter (UI general)
- Bebas Neue (títulos, KPIs)
- JetBrains Mono (números, series, montos)

---

## 📊 DATOS ACTUALES (11 abr 2026)

| Métrica | Valor |
|---------|-------|
| Total Pendiente | $260.579.904,27 |
| Cheques activos | 334 |
| Total rechazados registrados | 354 |
| Cheques recuperados | 151 |
| Monto recuperado | $260.060.641,20 |
| Total histórico | $545.767.225,44 |
| Gastos bancarios | $1.778.492,40 |
| Ratio recuperación | 30% |

### Top deudores
1. Gastronomía Ituzain — $47.2M
2. Ariaudo Sergio Esteb. — $45.1M
3. Friosur SACEI — $40.9M
4. Batistta Cecilia — $20.9M
5. Batistta Cecilia Vero. — $20.8M

### Por motivo (pendiente)
- SIN FONDOS: $232.3M (dominante)
- CTA CERRADA: $14.4M
- CUENTA EMBARGADA: $4.7M
- VENCIDO: $2.8M
- CUENTA CONCURSADA: $2.7M

---

## 🤖 AGENTE WHATSAPP — MÓDULO TESORERÍA

### Estado
Implementado en `alleata-agent` v1.8.0 — pendiente deploy hasta el 22/04

### Grupo WhatsApp
- **Nombre:** Tesorería Moretti (a crear el 22/04)
- **Integrantes:** Andres Moretti, Julian, Micaela, Marcelo
- **Número bot:** +5491127013661 (WASender)
- **Group ID:** `TESORERIA_GROUP_ID` — obtener el 22/04 desde logs Railway

### Comandos disponibles
| Comando | Acción |
|---------|--------|
| `kpis` | Panel general con todos los KPIs |
| `cheques [cliente]` | Buscar cheques de un cliente |
| `crediticio [CUIT]` | Estado crediticio BCRA en tiempo real |
| `reporte` | Reporte completo on-demand |
| `ayuda` | Lista de comandos |

### Reportes automáticos (Cron)
| Día/Hora | Acción |
|----------|--------|
| Lunes 10:00 ARS | Screenshot del dashboard → imagen al grupo |
| Viernes 17:00 ARS | Reporte KPIs en texto |

### Arquitectura del screenshot (lunes 10hs)
1. Puppeteer abre `snapshot.html?token=tes_snap_moretti_2026`
2. Toma screenshot 1440×900
3. Sube PNG a Supabase Storage bucket `reportes`
4. Manda imagen al grupo vía WASender
5. Fallback automático a reporte de texto si falla

---

## 🔔 ALERTAS AUTOMÁTICAS (PENDIENTE IMPLEMENTAR)

Próximos features a desarrollar:
- **Nuevo cheque rechazado** → alerta inmediata al grupo con cliente, monto y motivo
- **Cheque recuperado** → alerta positiva al grupo

Estos se implementarán vía **Supabase Database Webhooks** o **Realtime** que llamarán al endpoint `/notificar` del agente Railway.

---

## 🔗 INTEGRACIONES EXTERNAS

### API BCRA — Central de Deudores
- **Base URL:** `https://api.bcra.gob.ar/centraldedeudores/v1.0`
- **Endpoint usado:** `GET /Deudas/{identificacion}`
- **Proxy Supabase:** `https://qqmzhwifrkgfrgewmpig.supabase.co/functions/v1/bcra-proxy`
- **Proxy Cloudflare (fallback):** `https://bcra-proxy.marcevsanti.workers.dev`
- **Auth:** ninguna (API pública)

### Gemini API (análisis Nosis)
- **Modelo:** gemini-2.5-flash
- **Key:** almacenada en `localStorage` del browser
- **Uso:** análisis de informe PDF Nosis → JSON estructurado con scoring crediticio

### Resend (emails)
- **Función:** `enviar-mail-rechazo` (Supabase Edge Function)
- **Trigger:** al guardar un cheque con evidencia desde el modal

---

## 📋 PENDIENTES PRIORITARIOS

| # | Tarea | Fecha |
|---|-------|-------|
| 1 | **Recuperar index.html** desde historial GitHub (146 commits) | URGENTE |
| 2 | Subir `snapshot.html` al repo `Tesorer-a-Moretti` | Antes del 22/04 |
| 3 | Crear bucket `reportes` en Supabase Storage (público) | Antes del 22/04 |
| 4 | Escanear QR WASender con `+5491127013661` | 22/04 |
| 5 | Crear grupo WA "Tesorería Moretti" (4 integrantes + bot) | 22/04 |
| 6 | Obtener Group ID del grupo (ver logs Railway) | 22/04 |
| 7 | Agregar `TESORERIA_GROUP_ID` en Railway variables | 22/04 |
| 8 | Subir `index.js` v1.8.0 + `package.json` al repo alleata-agent | Antes del 22/04 |
| 9 | Implementar alertas nuevo cheque / cheque recuperado | Futuro |
| 10 | Migrar a WhatsApp Business API oficial cuando sea productivo | Producción |

---

## 🔄 ROADMAP

### Fase 1 — Completada ✅
- Sistema de cheques rechazados/cancelados
- Dashboard con KPIs y gráficos
- Estado crediticio BCRA
- Análisis Nosis con IA
- Log de auditoría
- Sistema de usuarios con roles
- Notificaciones por email

### Fase 2 — En desarrollo 🔄
- Agente WhatsApp (módulo Tesorería en alleata-agent v1.8.0)
- Screenshot semanal automático (lunes 10hs)
- Reporte KPIs viernes 17hs
- Alertas nuevo cheque / recuperado

### Fase 3 — Futuro 📋
- Migración a cuenta oficial Moretti (GitHub, Supabase, Railway)
- WhatsApp Business API oficial (Meta)
- Notificaciones por WhatsApp a propietarios de cuenta
- Módulo de proveedores integrado con pago de cheques

---

## 🏛️ ARQUITECTURA COMPLETA

```
Browser (GitHub Pages)
    │
    ├── index.html (Portal Tesorería v2.4.5)
    │       ├── Supabase Auth (login)
    │       ├── Supabase DB (cheques, usuarios, logs, config)
    │       ├── Supabase Storage (comprobantes)
    │       ├── Supabase Edge Functions (bcra-proxy, enviar-mail-rechazo)
    │       └── Gemini API (análisis Nosis)
    │
    ├── snapshot.html (Dashboard público para screenshot)
    │       ├── Token: tes_snap_moretti_2026
    │       └── Supabase DB (lectura anon, sin RLS)
    │
    └── login.html

Railway (alleata-agent v1.8.0)
    │
    ├── Módulo Alleata (existente)
    │       ├── Webhook WASender → OTs, credenciales, gastos
    │       └── /notificar, /notificar-propietario
    │
    └── Módulo Tesorería (nuevo)
            ├── Webhook → kpis, cheques, crediticio, reporte
            ├── Cron lunes 10hs → Puppeteer → screenshot → WA
            └── Cron viernes 17hs → reporte texto → WA

WASender (sesión alleata-ops)
    ├── Número: +5491127013661
    ├── Estado: ⚠️ Logged Out (reconectar el 22/04)
    └── Grupos:
            ├── TEST OPS: 120363424299090366@g.us
            ├── Alleata-Ops Intelligence: 120363429218714233@g.us
            └── Tesorería Moretti: [obtener el 22/04]
```

---

## 🔐 VARIABLES DE ENTORNO RAILWAY (alleata-agent)

| Variable | Valor | Estado |
|----------|-------|--------|
| `SUPABASE_URL` | https://njkstpfmcfhqxdadqbdy.supabase.co | ✅ |
| `SUPABASE_SERVICE_KEY` | (en Railway) | ✅ |
| `WASENDER_TOKEN` | (en Railway) | ✅ |
| `OPS_INTEL_GROUP_ID` | 120363429218714233@g.us | ✅ |
| `TESORERIA_GROUP_ID` | ⚠️ obtener el 22/04 | ❌ Pendiente |
| `TESORERIA_SNAPSHOT_URL` | https://marcevsanti-ux.github.io/Tesorer-a-Moretti/snapshot.html | ❌ Pendiente |
| `TESORERIA_SNAPSHOT_TOKEN` | tes_snap_moretti_2026 | ❌ Pendiente |
| `TESORERIA_ANON_KEY` | (hardcodeada como fallback en index.js) | ✅ |

---

*Documento generado el 11 abr 2026 — Marcelo Vsanti*
