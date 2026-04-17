# ALLEATA OPS — Informe de Sesión
**Fecha:** 17 abril 2026 | **Versión inicial:** v2.3.29 → **Versión final:** v2.3.36 (con fixes)

---

## 🎯 Objetivo de la sesión

Mejorar la visibilidad y transparencia del módulo de Envíos para todos los roles, implementar métricas de SLA de Correo Argentino, y sentar las bases para auditar la performance del operador logístico.

---

## 🔍 Investigación — API Correo Argentino (revisión)

### Situación actual confirmada
- El endpoint `/shipping/tracking` de la API oficial MiCorreo **no está operativo en producción** (confirmado por ejecutivo de cuentas CA, correo recibido).
- El endpoint `/shipping/import` tampoco está disponible aún.
- **Conclusión:** El workaround via `wsFacade.php` sigue siendo la única vía viable para tracking en tiempo real.

### Análisis de valor de la API oficial
Una vez operativa, `/shipping/import` permitiría:
- Generar envíos directamente desde Alleata Ops (fin del Excel manual)
- Obtener número de tracking en el momento del despacho
- Imprimir rótulos desde el portal
- Tracking desde día 0

> **Nota:** Los envíos generados via API son consultables por `wsFacade.php`, cerrando el ciclo completo.

---

## ⚙️ Implementación técnica

### v2.3.30 — Auto-tracking con modal de log en tiempo real
**Problema:** El botón Auto-tracking anterior no daba feedback, generando desconfianza en el proceso.

**Solución:** Modal completo con:
- Barra de progreso con contador `X / N` y tiempo estimado restante
- Log OT por OT en tiempo real con íconos según resultado:
  - ✅ Sin cambios — muestra estado actual
  - ✨ Actualizado — muestra `estado anterior → nuevo estado`
  - ⚠️ Alerta — DOMICILIO CERRADO / DIRECCIÓN INSUFICIENTE
  - ❌ Error — con mensaje de CA
- Resumen final con chips: actualizados / alertas / sin cambios / errores
- Botón cerrar aparece solo al terminar
- **Operadores:** pueden correr auto-tracking sobre sus propias OTs únicamente

---

### v2.3.31 — Módulo Envíos para operadores

**Problema:** Gonzalo Marvaldi entraba al módulo Envíos y no veía indicadores, filtros ni buscador.

**Cambios:**
- Tarjeta **"Mis envíos"** con chips Total / Tránsito / Entregados / Problema (clickeables para filtrar)
- Cards de **Logística Alleata** y **Correo Argentino** con stats propios del operador
- **Filtro de estado** visible para todos los roles
- **Buscador** (OT, tracking, cuenta) visible para todos
- Admin conserva además el filtro de responsable
- **Fix bug crítico:** operador no aplicaba filtro de estado ni canal en la query — mostraba OTs de otro estado al filtrar

---

### v2.3.31 — Unificación de import + logo CA

**Cambios:**
- Un solo botón **"Importar desde Salesforce"** para ambos canales (detecta canal activo automáticamente)
- Link directo al reporte SF debajo del botón
- Logo oficial de Correo Argentino desde su sitio web (reemplaza SVG artesanal)
- Import habilitado para todos los roles (operadores tienen independencia)

---

### v2.3.32 — SLA Correo Argentino: columnas SQL + cálculo automático

**Nuevas columnas en tabla `envios`:**
```sql
fecha_repesaje      text    -- Cuándo ingresó físicamente al correo
fecha_primer_intento text   -- Primer intento de entrega
cant_intentos       integer -- Cuántas veces fue CA
sla_ca_dias         integer -- Días repesaje → primer intento (SLA real de CA)
sla_total_dias      integer -- Días repesaje → último evento (ciclo completo)
```

**Función `calcularSLA(eventos)`:**
- Recorre el historial completo de CA
- Identifica REPESAJE (ingreso físico) como punto de inicio
- Cuenta intentos de entrega y registra el primero
- Calcula diferencia en días

**Integración:**
- Se ejecuta automáticamente al consultar con la lupa 🔍
- Se ejecuta en cada pasada del auto-tracking
- `consultarTracking` corregido para **siempre** actualizar `ultimo_evento_fecha` (incluso si el estado no cambió — fix bug histórico)

---

### v2.3.33 — Dashboard KPIs Correo Argentino (admin)

Nueva sección en el Dashboard de admin: **"Performance Correo Argentino"**

**6 chips globales:**
| KPI | Descripción |
|---|---|
| Con datos SLA | OTs con historial procesado |
| Cumplimiento ≤Nd | % OTs entregadas dentro del target |
| SLA prom. (CA) | Promedio de días repesaje → primer intento |
| Intentos prom. | Promedio de visitas de CA por envío |
| 1er intento OK | % entregadas en el primer intento |
| Fuera de SLA | Cantidad absoluta que superó el target |

**Tabla por provincia:** OTs, SLA promedio, cumplimiento con barra visual, fuera de SLA, intentos promedio, % 1er intento. Ordenada por volumen.

---

### v2.3.34 — Backfill SLA masivo

**Problema:** Solo 1 OT tenía `sla_ca_dias` poblado (la consultada manualmente). Las 116 OTs históricas de CA tenían `null`.

**Solución:** Tarjeta en **Ajustes** (solo admin) — "Backfill SLA Correo Argentino":
- Detecta todas las OTs de CA con `sla_ca_dias = null`
- Muestra cantidad y tiempo estimado antes de arrancar
- Log en tiempo real OT por OT con SLA calculado y color verde/rojo
- Delay de 800ms entre requests para no saturar CA
- Resumen final: actualizadas / sin eventos / errores
- Al terminar recarga automáticamente los KPIs del dashboard
- **Resultado:** 83 OTs procesadas en ~2 minutos en la primera ejecución real

---

### v2.3.35 — KPIs CA para operadores en su dashboard

**Cambio en `loadCAKPIs(responsable)`:**
- Admin: pasa `null` → ve datos globales con tabla por provincia
- Operador: pasa su nombre → ve sus propios KPIs filtrados

**Vista del operador:**
- Mismos 6 chips pero calculados sobre sus OTs únicamente
- Título: "Mi Performance — Correo Argentino"
- En lugar de tabla por provincia: **top 8 OTs con mayor SLA** (las más demoradas) — estado, días, intentos, provincia

---

### v2.3.36 — Configuración SLA programable

**Nueva tabla en Supabase:**
```sql
create table configuracion (
  id text primary key,
  valor text not null,
  descripcion text,
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id)
);
```

**Registros iniciales:**
```sql
('sla_correo_argentino_dias', '7', 'SLA target Correo Argentino en días')
('sla_alleata_dias', '5', 'SLA target Logística Alleata en días')
```

**RLS:** Todos pueden leer. Solo admins pueden escribir.

**En Ajustes:** Nueva tarjeta "Configuración SLA" con inputs numéricos por logística. Guardar persiste en Supabase.

**En el Dashboard:** Al iniciar la app lee el valor de Supabase. Todos los cálculos, chips y labels usan el valor dinámico. Cambiar el target no requiere tocar código.

---

## 📊 Análisis SLA — Casos reales observados

### Caso 1 — Entrega en sucursal (OT Santa Cruz)
```
30-03 REPESAJE          → ingreso físico al correo
06-04 INTENTO ENTREGA   → EN ESPERA EN SUCURSAL (no encontró al cliente)
14-04 INTENTO ENTREGA   → ENTREGA EN SUCURSAL (cliente fue a buscar)

SLA CA:          30/03 → 06/04 = 7 días ✅ CA cumplió
Demora adicional: 06/04 → 14/04 = 8 días — responsabilidad del cliente
```

### Caso 2 — Entrega ideal (Mar del Plata)
```
07-04 REPESAJE    → ingreso físico
16-04 ENTREGADO   → 1 solo intento, entrega directa

SLA CA: 07/04 → 16/04 = 9 días ⚠️ levemente fuera de target
```

**Conclusión:** El SLA de 7 días es exigente para interior del país. Los datos del backfill permitirán definir si corresponde ajustar el target por zona o logística.

---

## 📋 Versiones producidas

| Versión | Cambio principal |
|---------|-----------------|
| v2.3.30 | Auto-tracking con modal de log en tiempo real |
| v2.3.31 | Dashboard operador completo + fix filtro estado + unificación import |
| v2.3.32 | SLA CA: columnas SQL + cálculo automático en tracking |
| v2.3.33 | Dashboard KPIs CA para admin con tabla por provincia |
| v2.3.34 | Backfill SLA masivo desde Ajustes |
| v2.3.35 | KPIs CA personalizados para operadores en su dashboard |
| v2.3.36 | Configuración SLA programable via Supabase |
| v2.3.36 fix 1 | Reload automático del dashboard al guardar config SLA |
| v2.3.36 fix 2 | Fix `SLA_TARGET` — error de inicialización JS (const antes de declaración) |

---

## 🐛 Fixes post-deploy

### Fix 1 — RLS tabla `configuracion`
Al guardar la config SLA por primera vez, Supabase devolvía:
```
new row violates row-level security policy for table "configuracion"
```
**Causa:** La policy original solo cubría `UPDATE`. El `upsert` hace `INSERT` si el registro no existe, y no había policy para eso.

**Fix SQL ejecutado:**
```sql
drop policy if exists "config_select" on configuracion;
drop policy if exists "config_update" on configuracion;
drop policy if exists "config_insert" on configuracion;

create policy "config_select" on configuracion for select using (true);
create policy "config_write" on configuracion for all using (
  exists (select 1 from profiles where id = auth.uid() and rol = 'admin')
);
```

### Fix 2 — `Cannot access 'SLA_TARGET' before initialization`
Al guardar la config y triggerear el reload del dashboard, JavaScript lanzaba:
```
Cannot access 'SLA_TARGET' before initialization
```
**Causa:** El label del dashboard (`SLA target: N días`) usaba la `const SLA_TARGET` antes de que fuera declarada en el scope de la función. En JS, las `const` no son hoisted.

**Fix:** Mover la actualización del label para después de la declaración de `const SLA_TARGET = _slaConfig.correo`.

---

## 🗄️ Cambios en base de datos Supabase

### Columnas nuevas en `envios`
```sql
alter table envios add column if not exists fecha_repesaje text;
alter table envios add column if not exists fecha_primer_intento text;
alter table envios add column if not exists cant_intentos integer default 0;
alter table envios add column if not exists sla_ca_dias integer;
alter table envios add column if not exists sla_total_dias integer;
```

### Nueva tabla `configuracion`
```sql
create table configuracion (
  id text primary key,
  valor text not null,
  descripcion text,
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id)
);
```

---

## 🔮 Próximos pasos

### Pendiente inmediato
- **Token SF de Rosario** → integración Salesforce (lectura/escritura de OTs)
- **Cron automático de tracking** (Supabase Edge Function + cron job 3x día) — una vez validado el auto-tracking manual

### Para la próxima sesión
- **KPIs Logística Alleata** en dashboard — cuando haya más data de Marcelo Jiménez
- **Definir SLA por zona** (AMBA vs Interior) — los datos del backfill ya permiten este análisis
- **Notificaciones WhatsApp/SMS** al operador para DOMICILIO CERRADO / DIRECCIÓN INSUFICIENTE
- **Módulo mobile Envíos** — hoja de ruta, evidencia de casuísticas
- **Integración SF** → cambio automático de estado en Salesforce cuando OT = Entregado

### Roadmap CA API
Cuando esté operativo `/shipping/import`:
- Generación de envíos desde Alleata Ops (fin del Excel manual)
- Rótulos PDF desde el portal
- Tracking desde día 0

---

## ⚠️ Consideraciones operativas

### Rate limiting CA (wsFacade)
| Volumen | Delay recomendado | Frecuencia máxima |
|---|---|---|
| < 50 OTs activas | 600ms | 4x día |
| 50–100 OTs | 1000ms | 3x día |
| +100 OTs | 1500ms | 2x día |

### Backfill SLA
- Ejecutar **una sola vez** sobre datos históricos ✅ (ya ejecutado: 83 OTs)
- Para OTs nuevas los datos se populan automáticamente en cada consulta de tracking

### Configuración SLA
- Valor actual: **7 días** para Correo Argentino
- Cambiar en Ajustes → Configuración SLA → sin necesidad de deploy
