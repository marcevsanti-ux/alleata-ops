# ALLEATA OPS — Informe de Sesión
**Fecha:** 16 abril 2026 | **Versión inicial:** v2.3.18 → **Versión final:** v2.3.29

---

## 🎯 Objetivo de la sesión

Investigar e implementar tracking automático de envíos desde Correo Argentino, sin depender de la API oficial (aún no operativa en producción), y mejorar el módulo de Envíos con filtros y lógica de estados.

---

## 🔍 Investigación — API Correo Argentino

### Situación de la API oficial (MiCorreo)
- Se recibió respuesta del ejecutivo de cuentas confirmando que el endpoint `/shipping/tracking` **no está operativo en producción** aún.
- El ambiente de test (`apitest.correoargentino.com.ar`) sí está disponible pero el tracking de la API MiCorreo solo funciona para envíos creados desde MiCorreo — no para los que vienen del Excel de Salesforce.

### Endpoint descubierto (reverse engineering)
Mediante inspección del Network tab del browser en `correoargentino.com.ar/formularios/e-commerce`, se identificó el endpoint interno que usa el formulario público:

```
POST https://www.correoargentino.com.ar/sites/all/modules/custom/ca_forms/api/wsFacade.php
Content-Type: multipart/form-data

action=ecommerce
id={numero_de_tracking}
```

**Respuesta:** HTML con tabla de eventos (Fecha / Planta / Historia / Estado).

Este endpoint es público, sin autenticación, y devuelve el historial completo de movimientos de cualquier número de seguimiento de Paquetería e-commerce.

### Prueba de CORS
- Desde `marcevsanti-ux.github.io` → **bloqueado** por CORS (cross-origin).
- Solución: reutilizar la Supabase Edge Function `ca-proxy` ya existente, actualizando su código para que llame a `wsFacade.php` en lugar de la API MiCorreo.

---

## ⚙️ Implementación técnica

### Supabase Edge Function — `ca-proxy` (actualizada)
El código anterior apuntaba a la API MiCorreo (que no funcionaba). Se reemplazó por:

```typescript
// Recibe: { shippingId: "0001226..." }
// Llama a wsFacade.php con FormData
// Devuelve: { html: "<table>..." }
```

Flujo final:
```
GitHub Pages (browser) → ca-proxy (Supabase Edge) → wsFacade.php (CA) → HTML con eventos
```

### Funciones JS agregadas al portal

| Función | Descripción |
|---------|-------------|
| `fetchTrackingCA(trackNum)` | Llama al proxy, parsea el HTML, devuelve `{ eventos[], pieza }` |
| `consultarTracking(id, trackNum)` | Consulta un envío individual, muestra modal, actualiza Supabase |
| `autoActualizarTracking()` | Recorre todas las OTs activas, actualiza solo las que cambiaron |
| `mapearEstadoCA(historia, estadoCA, tipoOT)` | Mapea eventos CA → estados Alleata con lógica por tipo de OT |

### Lógica de mapeo de estados

#### Regla especial por tipo de OT
Para OTs de tipo `Instalación Equipo + Simcard`, `Instalación Simcard` o `Asistencia técnica`, el estado **Entregado** solo se asigna si el campo **Estado CA** es:
- `ENTREGADO`
- `ENTREGA EN SUCURSAL`

#### Mapeo general (por campo Historia)

| Historia CA | Estado Alleata |
|-------------|---------------|
| ENTREGADO / ENTREGA OK / ENTREGA EFECTUADA | Entregado |
| DEVUELTO / DEVOLUCION | Devuelto |
| EN PODER DEL DISTRIBUIDOR / INTENTO DE ENTREGA | En camino |
| EN ESPERA EN SUCURSAL | En espera en sucursal |
| CENTRO DE PROCESAMIENTO / CLASIFIC / LLEGADA AL CENTRO | En tránsito |
| INGRESO AL CORREO / REPESAJE / PREIMPOSICION | En tránsito |
| DEMORADO / DEMORA | Fallido |
| PERDIDO | Perdido |

#### Mapeo especial por campo Estado CA

| Estado CA | Estado Alleata |
|-----------|---------------|
| RETORNANDO | Fallido |

### Alertas visuales en modal de tracking

| Estado CA | Visualización |
|-----------|--------------|
| `DOMICILIO CERRADO/X VISITA` | 🔴 Fila roja, fecha en rojo con ⚠️ |
| `DIRECCIÓN INSUFICIENTE` | 🔴 Fila roja, fecha en rojo con ⚠️ |
| `RETORNANDO` | 🔴 Fila roja + OT marcada como Fallido |

### Auto-tracking masivo
- Botón **"🔄 Auto-tracking"** en la toolbar de la tabla de Envíos
- Consulta todas las OTs activas en Supabase (excluye: Entregado, Devuelto, Perdido, Fallido)
- Delay de 600ms entre requests para no saturar el servidor de CA
- Solo actualiza en Supabase si el estado cambió
- Muestra progreso en tiempo real: `⏳ 3/47`

---

## 🆕 Mejoras al módulo Envíos

### Buscador universal
- Campo de búsqueda visible para todos los roles (admin y operador)
- Filtra en tiempo real por: OT, número de tracking, cuenta, responsable
- Integrado con "Limpiar filtros"

### Contador de OTs
- Badge azul al lado del título de la tabla
- Se actualiza automáticamente al filtrar
- Muestra exactamente cuántas OTs están visibles según los filtros aplicados

### Orden por fecha de actualización
- Al filtrar por `Entregado`, `Fallido`, `Devuelto` o `Perdido` → ordena por `ultimo_evento_fecha` (más reciente primero)
- Para el resto de estados → ordena por fecha de despacho (comportamiento anterior)

---

## 📋 Versiones producidas

| Versión | Cambio principal |
|---------|-----------------|
| v2.3.19 | Tracking directo a wsFacade, botón Auto-tracking, modal actualizado |
| v2.3.20 | Fix sintaxis + proxy vía Supabase Edge Function |
| v2.3.21 | Buscador universal (fuera del bloque admin) |
| v2.3.22 | Buscador visible para todos los roles |
| v2.3.23 | Lógica de estados por tipo de OT (Instalación/Asistencia) |
| v2.3.24 | Fix campo `estadoCA` en mapeo |
| v2.3.25 | Contador de OTs en toolbar |
| v2.3.26 | Auto-tracking excluye Fallido además de Entregado/Devuelto/Perdido |
| v2.3.27 | Orden por ultimo_evento_fecha al filtrar por estados finales |
| v2.3.28 | Alertas rojas DOMICILIO CERRADO y DIRECCIÓN INSUFICIENTE en modal |
| v2.3.29 | RETORNANDO → Fallido + alerta roja |

---

## 🔮 Próximos pasos

### Estados pendientes de definir
Se identificaron más estados CA que requieren reglas (a definir en próxima sesión):
- Otros tipos de OT (Rollout, Desinstalaciones) con sus propias condiciones de éxito
- Más valores posibles del campo Estado CA a relevar en campo

### Roadmap técnico
- **Notificaciones al operador** cuando una OT tiene DOMICILIO CERRADO o DIRECCIÓN INSUFICIENTE (WhatsApp/SMS via celular del perfil)
- **API oficial CA** cuando esté operativa en producción → reemplazar wsFacade por `/shipping/tracking` oficial
- **Módulo mobile** Envíos (hoja de ruta, evidencia de casuísticas)
- **Integración SF** para cambio automático de estado en Salesforce cuando OT = Entregado

---

## ⚠️ Consideraciones operativas

### Rate limiting en CA
El auto-tracking masivo envía ~1 request cada 600ms. Para volúmenes altos recomendaciones:
- Hasta 50 OTs activas → sin problema
- 50–100 OTs → considerar subir delay a 1000ms
- +100 OTs → subir a 1500ms o correr en horarios de baja demanda (noche)
- Frecuencia máxima recomendada: 3-4 veces por día

### Comportamiento esperado con historial
Al consultar OTs con historial largo, el sistema toma **siempre el evento más reciente (fila 0)**. Estados intermedios como DOMICILIO CERRADO quedan visibles en el modal pero no afectan el estado actual si el envío continuó moviéndose.
