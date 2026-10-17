-- 車の交通費：経路検索で高速道路・有料道路を使ったか
alter table public.kensa_expenses
  add column if not exists use_highway boolean not null default false,
  add column if not exists use_toll boolean not null default false;
