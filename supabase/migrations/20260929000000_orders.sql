-- 備品の発注（検査員が LINE から申請 → 指定先へメール送信）
create table public.kensa_orders (
  id uuid primary key default gen_random_uuid(),
  inspector_id uuid references public.kensa_inspectors(id) on delete set null,
  inspector_name text not null default '',
  company text not null default '',
  -- [{ "name": "不織布の白衣", "qty": 10 }]
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  delivery text not null default '',
  note text not null default '',
  mail_status text not null default 'pending' check (mail_status in ('pending', 'sent', 'failed')),
  mail_error text not null default '',
  created_at timestamptz not null default now()
);
create index kensa_orders_created_idx on public.kensa_orders (created_at desc);
alter table public.kensa_orders enable row level security;
