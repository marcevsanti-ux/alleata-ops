# Conciliación (Ana) — Documento de diseño

**Fecha:** 31 may 2026
**Estado:** diseño acordado, pendiente de implementar en productivo
**App:** `conciliador.html` · **Backend:** `alleata-agent` · **Base:** Supabase

---

## 0. Qué quedó HECHO hoy (seguridad / acceso)

| Ladrillo | Estado |
|---|---|
| Login de Supabase en la app de conciliación | ✅ |
| Alta de Ana en `profiles` (`rol=operador`, `modulos=['conciliacion']`) | ✅ |
| Gate por módulo: Ana entra, usuarios sin el módulo rebotan (probado con Angel) | ✅ |
| Middleware de token en el agent (`authMiddleware.js`) | ✅ deployado |
| Endpoints `/products/*` → solo admin, sin bypass por secret | ✅ |
| `sync-tickets` y demás de `/automations/*` → aceptan **token O secret** | ✅ deployado |
| App de Ana manda **token** en el Sync (ya no el secret) | ✅ |
| `123456` eliminado del front de Ana | ✅ |

**Pendiente de seguridad (futuro, no urgente):**
- Migrar el **portal de ops** a token y recién ahí retirar el `123456` del backend del todo.
  Hoy el secret sigue vivo en el agent porque el portal de ops todavía lo usa en ~14 endpoints.

---

## 1. Flujo de Ana (cómo opera)

**Orden correcto:**
1. **Sync Tickets SF** → actualiza la base con los tickets más recientes de Salesforce. Esperar a que termine.
2. **Subir el Excel** de transferencias (.xlsx/.xls) — drag & drop o seleccionar archivo.
3. La app **cruza automáticamente** el Excel contra la tabla `tickets` y muestra resultados.
4. Revisar con filtros (todas / match único / sin match / múltiples) y **Exportar Excel**.

**Por qué ese orden:** el Excel se cruza contra los tickets que están EN la base. Si los tickets están viejos, el cruce sale contra datos desactualizados. Por eso Sync primero.

**Cómo cruza hoy (verificado en código):**
- Tabla: `tickets`
- Campos: `name, account_name, nombre_tercero, importe, fecha_transferencia`
- Match por **tercero** (nombre) y por **importe**.

**PENDIENTE confirmar con Ana:** ¿el cruce usa SOLO los campos del ticket, o también datos que están DENTRO del PDF adjunto? (Esto define si en UAT —sin adjuntos— el match sale incompleto.)

---

## 2. Mejora: Sync incremental con cache (CLAVE)

**Problema:** leer/desencriptar 1000+ adjuntos en cada Sync es inviable (minutos largos), y es trabajo repetido — un comprobante ya leído no cambia.

**Solución:** procesar cada adjunto UNA sola vez y guardar el resultado en la base.

**Esquema:**
1. Sync trae los tickets de SF (rápido, solo datos).
2. Filtrar: ¿cuáles ya tienen el adjunto procesado en la base? → saltearlos.
3. Procesar SOLO los nuevos / no procesados.
4. Guardar los datos extraídos en columnas de la base.

**Resultado:** primera corrida lenta (procesa todo); las siguientes, solo los nuevos del día → segundos.

**Complemento — batches:** aunque sea incremental, si un día entran muchos de golpe (lote grande), procesarlos en tandas (ej. 50) para no reventar memoria / timeouts y poder mostrar progreso.

- Incremental = decide **qué** procesar (solo lo nuevo).
- Batches = decide **cómo** procesarlo (en tandas manejables).

**Conexión con el scheduler:** si el sync de adjuntos queda incremental, se vuelve liviano y se puede enganchar al cron que ya existe (L-V 9/13/18). Así la base está siempre fresca y Ana solo sube el Excel. El botón Sync quedaría para forzar manual.

---

## 3. Lectura de comprobantes — sistema de plantillas

**Principio:** cada banco/billetera tiene un formato fijo. Se "aprende" el formato UNA vez y sirve para todos los de ese tipo.

**Dos mundos según el archivo:**
1. **PDF de texto** (ej. Mercado Pago de muestra) → extracción directa, rápida y barata.
2. **Foto / JPG / PDF escaneado** → es imagen, requiere lectura por visión (ver punto 4). Más lento, pero solo una vez por archivo (cache).

**Flujo por adjunto nuevo:**
- Detectar si es texto o imagen.
- Detectar de qué tipo/plantilla es (Mercado Pago, Galicia, etc.).
- Si reconoce la plantilla → extrae campos.
- Si NO reconoce → marca "revisar" y va a la **cola de excepciones**.

**Cola de excepciones (importante):**
- El sistema procesa TODO solo (no de a uno a mano).
- Ana revisa SOLO los que el sistema no pudo leer (van a ser pocos).
- Cada formato nuevo que aparece se suma como plantilla UNA vez → queda resuelto para siempre.
- Regla de oro: **caso a caso para los FORMATOS (pocos), nunca caso a caso para los TICKETS (muchos).**

---

## 4. OCR / lectura de imágenes → centralizar en Anthropic (NO Gemini)

**Decisión:** conciliación NO usa Gemini. Se centraliza todo en Anthropic/Claude.

- Claude tiene visión: lee comprobantes en foto y devuelve los campos estructurados.
- Para conciliación (módulo NUEVO) → nace directo en Anthropic, sin deuda.
- **Ventaja:** el agent YA tiene `ANTHROPIC_API_KEY` en Railway y `@anthropic-ai/sdk` instalado (lo usa Ally). No hay que sumar ninguna llave nueva.

**SIMs (aparte):** el OCR de SIMs hoy usa Gemini y FUNCIONA. No tocarlo ahora. Si algún día se quiere unificar, migrar por separado, con calma, validando que los seriales se sigan leyendo igual. No mezclar esa migración con el laburo de conciliación.

---

## 5. Campos a extraer — plantilla Mercado Pago (del comprobante de muestra)

| Campo | Ejemplo |
|---|---|
| Origen / tipo | Mercado Pago |
| Importe | $ 46.000 |
| De (nombre) | Manuela Nahir Luna Ruiz |
| CUIT/CUIL origen | 27-45472451-3 |
| N° de operación MP | 113084780218 |
| Código de identificación | 102904800234 |
| Fecha (contexto) | 28 de mayo de 2025, 11:24 hs |

(El PDF de muestra es texto digital → se lee directo, sin OCR.)

---

## 6. Pendientes para PRODUCTIVO

**Por qué importa productivo:** UAT tiene la base desactualizada y los tickets NO tienen adjuntos; productivo sí. Las 16/1405 OTs de UAT son histórico viejo, sirven para probar mecánica, no datos reales.

**Pasos al pasar a productivo:**
1. Tomar el **primer ticket con adjunto real** → confirmar que el adjunto se lee bien Y que la plantilla Mercado Pago extrae bien los campos.
2. Confirmado eso → largar el procesamiento de TODOS (incremental + batches).
3. Revisar la **cola de excepciones** → los formatos que faltan (Galicia, Santander, fotos…) se suman como plantillas.

**Otros temas que abre productivo:**
- Adjuntos reales en tickets (no existen en UAT).
- Revisar comportamiento del sync con volumen real.
- Products/Product2: credenciales productivas + reabrir endpoints para **operaciones** (definir quién puede escribir el lote — lectura para ops, fix-batch acotado).
- `SF_ENV`: confirmar contra qué entorno apunta el agent antes de operar.

---

## 7. Preguntas para Ana (mañana)

1. ¿El cruce de conciliación usa solo los campos del ticket, o datos que están dentro del PDF adjunto?
2. ¿Qué dato exacto del comprobante se usa para matchear? (importe, nombre, n° operación…)
3. ¿Cómo se identifica un ticket único para el cache? (`name` / `sf_id`)
4. ¿Los adjuntos de un ticket pueden cambiar, o una vez subido es definitivo? (define si el cache es seguro)
5. ¿Qué formatos de comprobante aparecen más seguido? (prioridad de plantillas)

---

## 8. Preguntas técnicas (mirar en código/SF)

- Estructura de la tabla `tickets` en productivo (¿qué columnas hay para guardar lo extraído?).
- Cómo vienen los adjuntos desde SF (¿base64, URL, encriptados?).
- Definir columnas nuevas para el cache: ej. `adjunto_procesado (bool)`, `importe_extraido`, `cuit_origen`, `nombre_origen`, `nro_operacion`, `tipo_comprobante`.
