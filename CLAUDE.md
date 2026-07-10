# CLAUDE.md — alleata-ops

**Última actualización:** 2026-07-10  
**Versión index.html:** v4.4.33 (09 jul 2026)  
**Tipo:** Frontend estático (GitHub Pages, vanilla JS)  
**Hermano:** `alleata-agent` (backend Node.js/Express en Railway)  
**Live:** https://marcevsanti-ux.github.io/alleata-ops/

## Contexto rápido

UI operacional para logística last-mile (Alleata). Cliente delgado que:
- Llama directo a Railway backend (`alleata-agent-production.up.railway.app`)
- Lee/escribe directo a Supabase JS SDK v2 (mismo workspace que alleata-agent)
- NO tiene build step, bundler ni package.json — todo inline en HTML

Si la tarea es **datos, crons, Salesforce, Cabify, WhatsApp** → código está en `alleata-agent`, no acá.

## Archivos principales

| Archivo | Rol | Versión |
|---|---|---|
| `index.html` | **Portal principal desktop** (~700KB, todos los módulos operativos) | v4.4.33 |
| `mobile.html` | App mobile (SIMs + módulos) | v2.14.0 |
| `distri.html` | Portal Distribuidor | v1.4.6 |
| `napse.html` | Parseo de logs NAPSE | v1.21.0 |
| `napse-gestion.html` | Dashboard NAPSE | v2.7.0 |
| `napse_dashboard.html` | Idem (⚠️ duplicado, verificar cuál es el vivo) | v2.0.0 |
| `conciliador.html` | Conciliación (status: confirmar si en prod o beta) | v1.1.0 |
| `presupuesto.html` | Presupuesto Operaciones | v1.9.0 |
| `desinstalaciones.js` | JS compartido para Desinstalaciones (ref directo SF Report + Railway) | — |

## Módulos en index.html (sidebar)

Localizalos con comentarios `<!-- ══ MÓDULO X ══ -->`:

- `home` — Dashboard
- `sims` — Gestión de SIMs (OCR + lookup)
- `envios` — Tracking CA + Cabify
- `desinstalaciones` — Import/gestión
- `napse` — Integración NAPSE
- `terminales` — CRUD terminales (endpoints `/terminales/*` de alleata-agent)
- `recuperadas` — Terminales recuperadas (módulo de alleata-agent)
- `rollout`, `retencion` — otros módulos
- `store` — **oculto** (`display:none`) — disponibilidad de terminales
- `ally` — **oculto**, solo admin — Contactos/Grupos/Reglas WhatsApp
- `ajustes` — **oculto**, solo admin — usuarios/roles
- `distri` — **oculto** — Distribuidores
- `horas` — deshabilitado (no funcional)

Módulos ocultos pueden activarse por rol/flag en runtime (Supabase `profiles.modulos`).

## Cómo consume el backend

Llama directo a Railway en puntos confirmados:
```
https://alleata-agent-production.up.railway.app/automations/cambiar-logistica
https://alleata-agent-production.up.railway.app/automations/confirm-retorno
```

Usa constantes: `ALLY_RAILWAY_BASE`, `SF_AGENT_URL`, `ALLY_URL` → todos apuntan al mismo backend.

**Antes de agregar un endpoint nuevo desde el frontend, revisar primero si ya existe en `alleata-agent`** (ver su informe `/automations/*`, `/terminales/*`, `/cabify/*`, `/store/*`, `/desinstalaciones/*`).

También usa Supabase JS SDK directo (lectura/escritura a tablas, no todo pasa por Railway).

## Antes de editar

1. **Si tocas un módulo** → buscá `<!-- ══ MÓDULO X ══ -->` en `index.html` (no cargar todo en contexto, solo esa sección)
2. **Si tocas datos/lógica** → probablemente está en `alleata-agent`, revisar ese informe
3. **Duplicado NAPSE:** confirmar con user cuál de `napse-gestion.html` / `napse_dashboard.html` es el vivo antes de editar cualquiera
4. **Conciliador:** status en producción vs beta — confirmar
5. **Módulos ocultos:** si la tarea es "activar módulo X", es probablemente Supabase `profiles.modulos`, no código

## Docs históricos (útiles pero desactualizados)

Carpeta `doc/` tiene ~14 archivos (`.md` + `alleata_roadmap.docx`). Útiles para decisiones de diseño pasadas, pero **NO como fuente de verdad del estado actual** — este informe y el código son la autoridad.

Versión más reciente ahí (`sesion_26_27mayo_resumen.md`) describe v3.0.5; código real está en v4.4.33 (~140 versiones de patch después).

---

**Antes de cada sesión:** leé esta sección (1 min) + el informe de `alleata-agent` si la tarea toca datos/integraciones.
