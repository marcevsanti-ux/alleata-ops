# Setup: guardar PDFs/Excels/fotos originales — v1.12.0

Esto habilita que cada factura/ticket cargado en Presupuesto guarde también
el archivo original (PDF, Excel o foto) y muestre un link para verlo/descargarlo.

## 1. Crear el bucket de Storage

Supabase → **Storage** → **New bucket**

- Nombre: `presupuesto-adjuntos`
- Public bucket: **✅ activado** (así los links funcionan directo, sin firmar
  URLs cada vez — es el mismo nivel de acceso que ya tienen los datos de
  `presupuesto_facturas`, que cualquier usuario logueado puede leer)

## 2. Policies del bucket (Storage → presupuesto-adjuntos → Policies)

Crear estas dos policies (o pegar el SQL en el SQL Editor):

```sql
-- Permitir subir archivos a cualquier usuario autenticado
create policy "adjuntos_insert_authenticated"
on storage.objects for insert to authenticated
with check (bucket_id = 'presupuesto-adjuntos');

-- Permitir leer archivos a cualquier usuario autenticado (incluye lectura
-- pública si el bucket quedó marcado como public en el paso 1)
create policy "adjuntos_select_authenticated"
on storage.objects for select to authenticated
using (bucket_id = 'presupuesto-adjuntos');
```

## 3. Columnas nuevas en las tablas (SQL Editor)

```sql
alter table presupuesto_facturas add column if not exists adjuntos jsonb default '[]'::jsonb;
alter table presupuesto_reales   add column if not exists adjuntos jsonb default '[]'::jsonb;
```

`presupuesto_facturas` la usan: EPSA, COTO, Cabify, Correo Argentino, Napse, Logicalis.
`presupuesto_reales` la usan: Claro, Telecom, Amazon.

## Listo

Con esos 3 pasos alcanza — no hace falta tocar nada más en el código, ya está
todo armado en `presupuesto.html` v1.12.0. Al confirmar cualquier factura o
ticket, el/los archivo(s) original(es) se suben solos al bucket y el link
aparece debajo de esa factura en el listado.

## Notas

- Si preferís que el bucket NO sea público (por ejemplo, para que ni con el
  link directo se pueda ver sin estar logueado), avisame y cambio el código
  para usar URLs firmadas (expiran, hay que regenerarlas — un poco más de
  trabajo pero más restrictivo). Con bucket público, cualquiera que consiga
  el link puede ver ese archivo puntual sin loguearse, aunque no puede
  navegar ni listar el resto — es el mismo trade-off que ya aceptaron con la
  key anon de Supabase.
- Si un archivo falla al subirse (por ejemplo, quedaste sin conexión a mitad
  de carga), el guardado de los DATOS de la factura NO se cae — el sistema
  solo omite ese adjunto puntual y sigue. Los números siempre quedan a salvo
  aunque el archivo no se haya podido subir.
