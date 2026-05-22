# ALLEATA OPS — Resumen de sesión 22/05/2026
**Portal:** v3.0.0 | **Agente:** v1.9.0 | **Para continuar en nuevo chat**

---

## Estado actual del proyecto

Sistema de automatización operativa con integración SF UAT, CA Tracking automático, agente Ally respondiendo consultas en privado y grupos. Ally privado funcionando con fix LID validado. Dashboard v3 con gráficos de Desinstalaciones por quarter conectados a SF en tiempo real. Nuevos comandos: `volumen`, `terminal`.

---

## Arquitectura

```
GitHub Pages → index.html v3.0.0 (portal desktop)

Railway (alleata-agent-production.up.railway.app)
├── index.js — fix LID completo (replyJid en toda la cadena)
├── salesforce.js — Asignado_a__r.Name para responsable OT
└── automations/
    ├── automationsRouter.js — nuevos endpoints sf-stats/*
    ├── caStatusChecker.js — PRODUCTIVO tabla envios (no tocar)
    ├── sfCaTracker.js — CA Tracking sf_workorders
    ├── sfAllyResumen.js — resumen diario 18:05 → grupo Ops
    ├── processAllyCommand.js — comandos volumen + terminal agregados
    ├── allyRateLimit.js
    ├── allyAlertEngine.js
    ├── scheduler.js
    └── formatEventosCA.js

Supabase (njkstpfmcfhqxdadqbdy.supabase.co)
├── envios — PRODUCTIVO, no tocar
├── sf_workorders — OTs desde SF UAT
├── sf_sync_log
├── contactos — whatsapp_lid: 134939399958588 → 5491165117989
└── merchants_guias
```

---

## Cambios sesión 22/05

### Fix LID WhatsApp — completo y validado

Tres fixes aplicados en `index.js`:
1. `processAllyCommand` recibe `from: replyJid` (no remoteJid)
2. `numero` se extrae de `replyJid` (no remoteJid)
3. `sendMessage` usa `replyJid` en todos los casos

**Fix en `processAllyCommand.js`:**
- Columna `telefono` no existe en tabla `contactos` → removida del `.or()` que causaba que todos los mensajes privados fueran ignorados silenciosamente

### salesforce.js — responsable OT correcto
- Campo `Asignado_a__r.Name` (API name: `Asignado_a__c`) reemplaza `Owner.Name`
- Ahora sync trae el responsable real (ej: Andres Veyga) en vez del propietario SF

### sfCaTracker.js — 3 fixes
1. `INTENTO DE ENTREGA + ENTREGA EN SUCURSAL` → `En espera en sucursal` (antes mapeaba a `Entregada` → PATCH 400 en OT 00019110)
2. `DIRECCIÓN INSUFICIENTE` → estado `Fallido` + alerta UAT + `Datos_de_envio__c = 'Mal indicada la dirección'`
3. `getDatosEnvio()` centralizado: `Entregada` → `Información correcta`, `Fallido` → `Mal indicada la dirección`

### Dashboard v3.0.0 — Desinstalaciones desde SF

**Nuevos endpoints Railway:**
- `GET /automations/sf-stats/desinstalaciones` — conteos por estado y mes desde SF (soporta `?meses=N` o `?fechaInicio=&fechaFin=`)
- `GET /automations/sf-stats/desinstalaciones-geo` — ranking provincias/ciudades de pendientes

**Widget Q actual (chart-desins):**
- Dona del quarter actual (Q1/Q2/Q3/Q4 automático según fecha)
- Tabla mensual con top 4 estados
- Ranking provincias con barra de progreso + click → ciudades

**Quarters anteriores (dinámicos):**
- Se agregan automáticamente al grid según el quarter actual
- En Q2 aparece Q1, en Q3 aparecen Q1+Q2, etc.
- Cada quarter con dona + tabla mensual + ranking geo

**Grid:** cambiado a `repeat(auto-fill, minmax(260px, 1fr))` para acomodar quarters dinámicos

### Nuevos comandos Ally (privado)

**`volumen <nombre>`**
- Busca en `Actividad__c` por nombre de cuenta
- Devuelve: estado (🟢/🔴), plan, sub-tipo 30/60/90d, tendencia
- Volumen detallado: Total, Efectivo, Tarjetas, QR, Otros, Fiscal + histórico 30/60/90d
- `CUENTA DADA DE BAJA` → semáforo 🔴

**`terminal <serial>`**
- Busca en `Product2` por `Name` o `N_de_serie_unico__c`
- Devuelve: modelo, estado (🟢 ASIGNADA / 🔵 DISPONIBLE / 🔴 EXTRAVIADA), ubicación, cuenta, perfil, versión Tetra, última actualización

**Campos Product2 confirmados:**
```
Name / N_de_serie_unico__c  → serial
Nombre_Producto__c          → modelo
Estado__c                   → ASIGNADA/DISPONIBLE/etc
Ubicacion__c                → COMERCIO/BARRACAS/etc
Cuenta_busqueda__c          → FK cuenta (lookup: Cuenta_busqueda__r.Name)
Banco_de_trabajo__c         → FK user
Perfil__c                   → PRISMA/etc
RPN_sw_Version__c           → versión Tetra
RPN_end_Date__c             → última actualización
N_L_nea__c                  → N° línea
CAMBIO_DE_BATERIA__c        → cambio batería
Tipo_de_producto__c         → TERMINAL/SIM/etc
```

---

## Análisis de datos realizado

### Desinstalaciones Abril 2026 (323 OTs)
- INCOBRABLES: 166 (54%) — driver principal de churn
- COMERCIO: 66 (20%) — churn inevitable
- PRODUCTO: 52 (16%) — churn evitable
- PRECIO: 15 (5%)
- VENTAS: 7 (2%) — ventas incorrectas, 100% evitable

### Reactivadas Mayo 2026 (9 en ~3 semanas)
- Tasa de recupero estimada: 15-20% de incobrables
- Conclusión: el proceso es mora → desinstalación → recupero (ineficiente)
- Oportunidad: intervención temprana de cobranzas antes de generar OT de baja

### Actividad__c — campos clave confirmados
```
Estado__c                         → ACTIVA/INACTIVA/CUENTA DADA DE BAJA/SEGUIMIENTO/CRÍTICO
Plan__c                           → ALLEATA MENSUAL / ALLEATA CORPORATE MENSUAL
Sub_Tipo__c / 60_dias / 90_dias   → ÓPTIMO >30K / IDEAL >300K / BAJO <30K
Volumen_Este_Mes__c               → volumen total mes actual
Volumen_Efectivo_Este_Mes__c
Volumen_Tarjetas_Este_Mes__c
Volumen_Codigo_QR_Este_Mes__c
Volumen_Otros_Este_Mes__c
Volumen_Fiscal_Este_Mes__c
Cant_de_transacciones_este_Mes__c
Volumen_total_ultimos_30/60/90_dias__c
Sumatoria_Totales_ultimos_dias__c
Cuenta__r.Name                    → nombre de cuenta relacionada
```

---

## Pendientes próxima sesión

### Inmediatos
- [ ] Validar sync SF con campo `Asignado_a__r.Name` — confirmar que trae Andres Veyga correctamente
- [ ] Nahuel: permisos Read sobre `ContentVersion`, `ContentDocument`, `ContentDocumentLink`
- [ ] Nahuel: credenciales SF producción para paso 1 (solo lectura + observaciones)

### CA Tracker en producción (paso a paso)
- [ ] Paso 1: activar SF prod — sync + solo observaciones, sin PATCH de estados
- [ ] Paso 2: validar 2-3 días en prod
- [ ] Paso 3: activar PATCH estados (empezar por `Entregada`)
- [ ] Paso 4: activar alertas con límite diario

### Pendientes anteriores
- [ ] Definir lógica Desinstalación con ops (estados SF)
- [ ] Activar SCHEDULER_ENABLED en Railway prod cuando esté listo
- [ ] Cambiar `ALERTA_UAT_NUMERO` → number real cuando pasen a prod
- [ ] Filtro sfAllyResumen: excluir Entregadas, umbral 7 días hábiles, últimos 60 días
- [ ] Investigar PATCH 400 OT 00019110 con Nahuel

---

## Roadmap — Migración a cuenta Alleata

Cuando Alleata genere `sistemas@alleata.com.ar`:
- [ ] Reemplazar Gemini OCR por Claude Vision en `mobile.html`
- [ ] Crear entornos UAT + PROD separados en Railway (develop → UAT, main → PROD)
- [ ] Migrar Supabase a cuenta Alleata
- [ ] Apuntar dominio `portal.alleata.com.ar`
- [ ] Mover repo a org GitHub de Alleata

**Plataformas a migrar:** GitHub, Railway, Supabase, WaSender, Anthropic API
**Google/Gemini:** se elimina al migrar OCR a Claude Vision

---

## Roadmap — Mejoras Mobile

Cuando se diga "qué mejorar en Mobile":
- [ ] Módulo recepción de terminales: escanear serial → consultar SF Product2 → actualizar Estado/Ubicación + foto de evidencia (adjunto via ContentVersion)

---

## Variables de entorno Railway (vigentes)

```env
SUPABASE_URL=https://njkstpfmcfhqxdadqbdy.supabase.co
SF_ENV=uat
SF_SYNC_ENABLED=true
SF_RESUMEN_MODO_PRUEBA=true
SF_API_VERSION=v62.0
SCHEDULER_ENABLED=true
AUTOMATIONS_ENABLED=true
AUTOMATION_SECRET=123456
AUTOMATIONS_SECRET=123456
ALERTA_UAT_NUMERO=5491165117989
```

---

## Notas técnicas importantes

- **Productivo aislado:** `caStatusChecker.js` + tabla `envios` — no tocar nunca
- **sfCaTracker.js:** solo opera sobre `sf_workorders`
- **replyJid:** siempre usar replyJid (no remoteJid) en index.js para privados
- **sbService:** nombre del cliente Supabase en index.js
- **Columna telefono:** NO existe en tabla contactos — removida de todos los .or()
- **Actividad__c en UAT:** tiene datos pero Sub-Tipo vacíos — en prod tendrá todo completo
- **PATCH 400 OT 00019110:** pendiente investigar con Nahuel

---

*Generado el 22 de mayo de 2026 — continuar en nuevo chat*
