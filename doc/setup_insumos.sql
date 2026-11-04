-- MODULO INSUMOS - ABM, rotulos, stock (min / max / critico), avisos de compra y consumo mensual
-- Ejecutar en Supabase (SQL Editor). Se puede repetir sin problema.
-- Solo crea objetos nuevos: no toca ninguna tabla existente.

create sequence if not exists insumos_seq start 1;

-- Catalogo de insumos
create table if not exists insumos_items (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default ('INS-' || lpad(nextval('insumos_seq')::text, 4, '0')),
  nombre text not null,
  categoria text,
  unidad text not null default 'un',
  ubicacion text,
  proveedor text,
  stock_critico numeric not null default 0,   -- por debajo/igual: CRITICO (urgente)
  stock_min numeric not null default 0,       -- por debajo/igual: reponer (genera aviso de compra)
  stock_max numeric not null default 0,       -- objetivo de reposicion
  activo boolean not null default true,
  notas text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint insumos_umbrales_ok check (stock_critico >= 0 and stock_min >= stock_critico and stock_max >= stock_min)
);

-- Movimientos. delta con signo: entrada (+), salida (-), ajuste (+/-). El stock es la suma de los delta.
create table if not exists insumos_movimientos (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references insumos_items(id) on delete cascade,
  tipo text not null check (tipo in ('entrada','salida','ajuste')),
  delta numeric not null check (delta <> 0),
  motivo text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists insumos_mov_insumo_idx on insumos_movimientos(insumo_id, created_at desc);
create index if not exists insumos_mov_fecha_idx on insumos_movimientos(created_at desc);

-- Stock actual + nivel + sugerencia de compra
create or replace view v_insumos_stock with (security_invoker = true) as
select i.*,
  coalesce(s.stock, 0) as stock_actual,
  case
    when coalesce(s.stock, 0) <= i.stock_critico then 'critico'
    when coalesce(s.stock, 0) <= i.stock_min then 'minimo'
    when i.stock_max > 0 and coalesce(s.stock, 0) > i.stock_max then 'exceso'
    else 'ok'
  end as nivel,
  case when coalesce(s.stock, 0) <= i.stock_min and i.stock_max > 0
       then greatest(i.stock_max - coalesce(s.stock, 0), 0) else 0 end as a_comprar
from insumos_items i
left join (select insumo_id, sum(delta) as stock from insumos_movimientos group by insumo_id) s on s.insumo_id = i.id;

-- Consumo (salidas) por mes, en hora de Buenos Aires
create or replace view v_insumos_consumo_mensual with (security_invoker = true) as
select m.insumo_id,
  to_char(date_trunc('month', m.created_at at time zone 'America/Argentina/Buenos_Aires'), 'YYYY-MM') as mes,
  sum(case when m.tipo = 'salida' then -m.delta else 0 end) as consumido,
  sum(case when m.tipo = 'entrada' then m.delta else 0 end) as ingresado
from insumos_movimientos m
group by 1, 2;

-- Seguridad: usuarios logueados leen, crean y modifican. Borrar: solo administradores.
alter table insumos_items enable row level security;
alter table insumos_movimientos enable row level security;

drop policy if exists insumos_items_sel on insumos_items;
create policy insumos_items_sel on insumos_items for select to authenticated using (true);
drop policy if exists insumos_items_ins on insumos_items;
create policy insumos_items_ins on insumos_items for insert to authenticated with check (true);
drop policy if exists insumos_items_upd on insumos_items;
create policy insumos_items_upd on insumos_items for update to authenticated using (true) with check (true);
drop policy if exists insumos_items_del on insumos_items;
create policy insumos_items_del on insumos_items for delete to authenticated using (exists (select 1 from profiles p where p.id = auth.uid() and p.rol = 'admin'));

drop policy if exists insumos_mov_sel on insumos_movimientos;
create policy insumos_mov_sel on insumos_movimientos for select to authenticated using (true);
drop policy if exists insumos_mov_ins on insumos_movimientos;
create policy insumos_mov_ins on insumos_movimientos for insert to authenticated with check (true);
-- Los movimientos no se editan (se corrige con un ajuste); solo admin puede borrar
drop policy if exists insumos_mov_del on insumos_movimientos;
create policy insumos_mov_del on insumos_movimientos for delete to authenticated using (exists (select 1 from profiles p where p.id = auth.uid() and p.rol = 'admin'));

grant usage, select on sequence insumos_seq to authenticated;
revoke all on v_insumos_stock, v_insumos_consumo_mensual from anon;
grant select on v_insumos_stock, v_insumos_consumo_mensual to authenticated;
