-- MODULO IRREPARABLES - trazabilidad terminal / caja / pallet / SPP
-- Ejecutar en Supabase (SQL Editor). Se puede repetir sin problema.
-- Solo crea objetos nuevos: no toca ninguna tabla existente.

-- Secuencias para los codigos CJ-0001 y PL-0001
create sequence if not exists irreparables_caja_seq start 1;
create sequence if not exists irreparables_pallet_seq start 1;

-- Pallets
create table if not exists irreparables_pallets (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default ('PL-' || lpad(nextval('irreparables_pallet_seq')::text, 4, '0')),
  estado text not null default 'abierto' check (estado in ('abierto','cerrado','enviado')),
  destino text not null default 'SPP',
  remito text,
  notas text,
  created_by text,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  enviado_at timestamptz
);

-- Cajas
create table if not exists irreparables_cajas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default ('CJ-' || lpad(nextval('irreparables_caja_seq')::text, 4, '0')),
  capacidad int not null default 30,
  estado text not null default 'abierta' check (estado in ('abierta','cerrada')),
  pallet_id uuid references irreparables_pallets(id) on delete set null,
  notas text,
  created_by text,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists irreparables_cajas_pallet_idx on irreparables_cajas(pallet_id);

-- Terminales irreparables
-- origen: rto = reporte Logicalis cargado en Presupuesto, sf = alta al escanear (falla tomada de Lote en SF), manual = cargada por el operador
create table if not exists irreparables_items (
  id uuid primary key default gen_random_uuid(),
  serie text not null unique,
  modelo text,
  origen text not null default 'manual' check (origen in ('rto','sf','manual')),
  falla_logicalis text,
  info_operador text,
  operativa boolean not null default false,
  rto_ref text,
  mes_rto text,
  detalle_rto jsonb,
  sf_id text,
  sf_estado_ingreso text,
  caja_id uuid references irreparables_cajas(id) on delete set null,
  caja_at timestamptz,
  caja_by text,
  sf_sync_at timestamptz,
  sf_sync_ok boolean,
  sf_sync_msg text,
  sf_lote_grabado text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists irreparables_items_caja_idx on irreparables_items(caja_id);

-- Vista de trazabilidad (terminal, caja, pallet)
create or replace view v_irreparables_trazabilidad with (security_invoker = true) as
select
  i.id, i.serie, i.modelo, i.origen, i.falla_logicalis, i.info_operador, i.operativa,
  i.rto_ref, i.mes_rto, i.sf_id, i.sf_estado_ingreso,
  i.sf_sync_at, i.sf_sync_ok, i.sf_sync_msg, i.sf_lote_grabado,
  i.caja_id, c.codigo as caja, c.estado as caja_estado,
  p.id as pallet_id, p.codigo as pallet, p.estado as pallet_estado,
  p.destino, p.remito, p.enviado_at,
  case
    when i.caja_id is null then 'pendiente'
    when p.estado = 'enviado' then 'enviado_spp'
    when p.id is not null then 'en_pallet'
    else 'en_caja'
  end as estado_trazabilidad,
  i.created_at
from irreparables_items i
left join irreparables_cajas c on c.id = i.caja_id
left join irreparables_pallets p on p.id = c.pallet_id;

-- Vistas con conteos (evitan el limite de 1000 filas de la API)
create or replace view v_irreparables_cajas with (security_invoker = true) as
select c.*, p.codigo as pallet_codigo, p.estado as pallet_estado, count(i.id)::int as cant
from irreparables_cajas c
left join irreparables_pallets p on p.id = c.pallet_id
left join irreparables_items i on i.caja_id = c.id
group by c.id, p.id;

create or replace view v_irreparables_pallets with (security_invoker = true) as
select p.*, count(distinct c.id)::int as cant_cajas, count(i.id)::int as cant_terminales
from irreparables_pallets p
left join irreparables_cajas c on c.pallet_id = p.id
left join irreparables_items i on i.caja_id = c.id
group by p.id;

-- Seguridad: solo usuarios logueados (el portal es publico con clave anon)
alter table irreparables_items enable row level security;
alter table irreparables_cajas enable row level security;
alter table irreparables_pallets enable row level security;

drop policy if exists irreparables_items_auth_all on irreparables_items;
create policy irreparables_items_auth_all on irreparables_items for all to authenticated using (true) with check (true);

drop policy if exists irreparables_cajas_auth_all on irreparables_cajas;
create policy irreparables_cajas_auth_all on irreparables_cajas for all to authenticated using (true) with check (true);

drop policy if exists irreparables_pallets_auth_all on irreparables_pallets;
create policy irreparables_pallets_auth_all on irreparables_pallets for all to authenticated using (true) with check (true);

-- Los codigos se generan con nextval: el rol authenticated necesita usar las secuencias
grant usage, select on sequence irreparables_caja_seq to authenticated;
grant usage, select on sequence irreparables_pallet_seq to authenticated;
revoke all on v_irreparables_trazabilidad, v_irreparables_cajas, v_irreparables_pallets from anon;
grant select on v_irreparables_trazabilidad, v_irreparables_cajas, v_irreparables_pallets to authenticated;
