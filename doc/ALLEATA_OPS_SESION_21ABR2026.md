# ALLEATA OPS — Informe de Sesión
**Fecha:** 21 abril 2026 | **Versión inicial:** v2.3.36 → **Versión final:** v2.3.42

---

## 🎯 Objetivo de la sesión

Integrar la API oficial de Correo Argentino (MiCorreo) al portal Ops para cotización de envíos en tiempo real, y avanzar en la migración del portal a `portal.alleata.com.ar`.

---

## 🌐 Infraestructura — portal.alleata.com.ar

### DNS confirmado ✅
- Registro A `portal → 76.76.21.21` creado en Cloudflare (DNS only, gestionado por Adrián Villar)
- Propagación global confirmada via dnschecker.org — todos los servidores resuelven correctamente
- HTTPS automático vía Vercel

### Próximo paso
Agregar `portal.alleata.com.ar` en Vercel → Settings → Domains para que Vercel sirva el portal en ese dominio.

---

## 🔌 Integración API MiCorreo — Estado al cierre de sesión

### Credenciales producción
- **Usuario:** MorettiAPI
- **Password:** Pelota22+
- **Customer ID:** 0001226778 (Andres Moretti e Hijos S.A.)
- **URL:** `https://api.correoargentino.com.ar/micorreo/v1`

### Endpoints operativos
| Endpoint | Estado | Notas |
|---|---|---|
| `POST /token` | ✅ Operativo | JWT obtenido correctamente desde portal.alleata.com.ar |
| `POST /rates` | ✅ Operativo | Cotización en tiempo real integrada al portal |
| `POST /shipping/import` | ⏳ Pendiente habilitación | Necesario para generar envíos y obtener tracking |
| `GET /shipping/tracking` | ⏳ Pendiente habilitación | Resuelto por wsFacade.php mientras tanto |

### Diagnóstico de conectividad
- La API de CA restringe acceso por IP del servidor que hace el request
- Requests desde Claude (servidor externo): bloqueados — "Host not in allowlist"
- Requests desde `portal.alleata.com.ar` (IP Vercel 76.76.21.21): ✅ funcionan correctamente
- Mariangeles confirmó que la IP 76.76.21.21 no tiene impedimento

### Proceso de resolución del body de /rates
El body correcto según documentación oficial:
```json
{
  "customerId": "0001226778",
  "postalCodeOrigin": "1289",
  "postalCodeDestination": "1408",
  "dimensions": {
    "weight": 2000,
    "height": 24,
    "width": 28,
    "length": 15
  }
}
```
Errores superados durante el proceso:
1. `postOfficeId` — campo no reconocido → eliminado
2. `origin` / `destination` como objetos anidados → reemplazado por `postalCodeOrigin` / `postalCodeDestination`
3. Dimensiones incorrectas (15x15x30) → corregidas a **largo 15 / ancho 28 / alto 24 / 2kg** (medidas reales de la terminal)

### Datos del paquete (terminal POS)
| Campo | Valor |
|---|---|
| Largo | 15 cm |
| Ancho | 28 cm |
| Alto | 24 cm |
| Peso | 2.000 kg |
| Valor declarado | $100.000 |
| Tipo de producto | PAQ.AR CLASICO |

---

## ⚙️ Funcionalidad implementada — Cotizador CA

### Flujo completo
1. Operador entra al módulo Envíos
2. Las OTs en estado **Pre-Colecta** muestran botón naranja **💰 Cotizar**
3. OTs en cualquier otro estado muestran el botón deshabilitado (gris, tooltip explicativo)
4. Al hacer click abre modal con:
   - Subtítulo: OT + Responsable
   - Dirección destino en verde (📍 calle, ciudad, provincia)
   - CP Destino (pre-completado desde `cp_dest` de Supabase) + CP Origen (1289 fijo)
   - Barra informativa: 📦 15×28×24 cm · ⚖️ 2 kg · 💵 Valor declarado: $100.000
   - Botón "Consultar tarifas" → llama a `/rates` en tiempo real
5. Resultado: 4 opciones (Sucursal Clásico / Sucursal Expreso / Domicilio Clásico / Domicilio Expreso) con precio y plazo
6. Operador elige → se guarda `costo_envio` en Supabase → tabla se actualiza al instante
7. Una vez cotizado, la celda muestra el precio + link "recotizar"

### Token JWT
- Se obtiene automáticamente al abrir el modal (lazy loading)
- Se reutiliza mientras no expire (con margen de 30 segundos)
- No requiere acción del operador

### Ejemplo de precios reales (CP 1842→5002, Mendoza)
| Servicio | Precio | Plazo |
|---|---|---|
| Sucursal Clásico | $5.620,00 | 2–5 días hábiles |
| Sucursal Expreso | $10.300,80 | 1–3 días hábiles |
| Domicilio Clásico | $8.192,00 | 2–5 días hábiles |
| Domicilio Expreso | $15.016,00 | 1–3 días hábiles |

---

## 📋 Versiones producidas

| Versión | Cambio principal |
|---|---|
| v2.3.37 | Cotizador CA integrado al portal — botón 💰 en columna Costo |
| v2.3.38 | CP Origen corregido a 1289 · Botón deshabilitado para estados ≠ Pre-Colecta |
| v2.3.39 | Dimensiones corregidas a 15×28×24 cm, 2kg |
| v2.3.40 | Info paquete visible en modal (dimensiones + valor declarado) |
| v2.3.41 | Dirección destino visible en modal (calle + ciudad + provincia) |
| v2.3.42 | Modal compacto — todas las opciones visibles sin scroll |

---

## 📄 Nuevo formato de Excel SF

Se incorporó el reporte **"PreColecta - Despachado - all logistic"** que incluye ambos estados.

**Estructura confirmada:**
- Fila 10: encabezados
- El estado (Pre-Colecta / Despachado) **no se exporta como columna** — el filtro viene del reporte SF, el estado real vive en Supabase
- CP destino: columna 14 (`Dirección de envío (Código postal/ZIP)`) — ya mapeado en el import

**Logísticas presentes en el reporte:**
ALLEATA, CABIFY, EPSA, EXPRESS METROPOLITANA, CORREO ARGENTINO (ignoradas todas excepto CA y ALLEATA al importar)

---

## 🔮 Pendientes para cerrar integración CA

### Lo que falta (consultado a Mariangeles)

**1. Tracking en response de /shipping/import**
La doc oficial devuelve solo `{ "createdAt": "..." }`. Se necesita que el response incluya el número T&T asignado por CA para registrarlo automáticamente en Supabase.

**2. Rótulo oficial por API**
Actualmente el rótulo se imprime manualmente desde el portal MiCorreo. Se necesita un endpoint que devuelva el PDF oficial (con QR, código de barras TN y T&T) a partir del `shippingId`. Puede ser que exista y no esté documentado.

### Flujo target (cuando esté habilitado /shipping/import)
1. Operador cotiza → elige servicio
2. Portal hace POST a `/shipping/import` → CA asigna tracking + genera rótulo
3. Tracking y costo se guardan automáticamente en Supabase
4. Operador descarga rótulo PDF oficial desde el portal
5. **Fin del proceso manual en MiCorreo y del Excel de SF**

---

## 👥 Contacto CA
**Mariangeles Emilia Kalayuki**
Soporte Integraciones TI — Gerencia de Soporte al Cliente de TI
zextMKalayuki@correoargentino.com.ar
Av. Fair 1101 – Nivel 6.70 Oeste, Monte Grande, Bs. As.

---

## 🗺️ Próxima sesión

- Respuesta de Mariangeles sobre tracking en /shipping/import y endpoint de rótulo
- KPIs Logística Alleata en dashboard (cuando haya más data de Marcelo Jiménez)
- Token SF de Rosario → integración Salesforce
- Cron automático de tracking 3x día (Supabase Edge Function)
- Módulo mobile Envíos
