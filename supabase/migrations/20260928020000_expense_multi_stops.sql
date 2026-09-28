-- 交通費：1 件の申請で複数店舗（複数の検査）をまとめて申請できるようにする
-- 車の経路は「出発地 → 店舗A → 店舗B → … → 帰着地」の経由地リストで保持する

create table public.kensa_expense_inspections (
  expense_id uuid not null references public.kensa_expenses(id) on delete cascade,
  inspection_id uuid not null references public.kensa_inspections(id) on delete cascade,
  primary key (expense_id, inspection_id)
);
create index kensa_expense_inspections_inspection_idx on public.kensa_expense_inspections (inspection_id);
alter table public.kensa_expense_inspections enable row level security;

insert into public.kensa_expense_inspections (expense_id, inspection_id)
select id, inspection_id from public.kensa_expenses where inspection_id is not null;

alter table public.kensa_expenses
  drop column inspection_id,
  drop column route_from,
  drop column route_to,
  drop column round_trip,
  add column route_stops jsonb not null default '[]'::jsonb check (jsonb_typeof(route_stops) = 'array');
