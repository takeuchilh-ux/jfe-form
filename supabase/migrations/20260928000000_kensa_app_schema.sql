-- 衛生検査スケジュール管理アプリ（LINE 版）スキーマ
-- 既存の eisei_* テーブルには手を加えず、kensa_* として新規作成する。
-- すべてのテーブルは RLS 有効・ポリシーなし＝サーバー（service_role）経由でのみアクセス可能。

create extension if not exists pgcrypto with schema extensions;

-- 更新日時の自動更新
create or replace function public.kensa_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 管理者
create table public.kensa_admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 検査員（LINE と連携）
create table public.kensa_inspectors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_kana text not null default '',
  phone text not null default '',
  email text not null default '',
  area text not null default '',
  notes text not null default '',
  active boolean not null default true,
  -- LINE 連携
  line_user_id text unique,
  line_display_name text not null default '',
  link_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  linked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 店舗マスタ
create table public.kensa_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  group_name text not null default '',
  area text not null default '',
  address text not null default '',
  lat double precision,
  lng double precision,
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 月次スケジュール（リリース単位）
create table public.kensa_periods (
  id uuid primary key default gen_random_uuid(),
  year_month text not null unique check (year_month ~ '^\d{4}-\d{2}$'),
  status text not null default 'draft' check (status in ('draft', 'released', 'closed')),
  response_deadline date,
  released_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 検査（1 店舗 1 日程）
create table public.kensa_inspections (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.kensa_periods(id) on delete cascade,
  store_id uuid not null references public.kensa_stores(id),
  inspection_date date not null,
  time_slot text not null default '',
  required_count integer not null default 1 check (required_count between 1 and 10),
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index kensa_inspections_period_idx on public.kensa_inspections (period_id, inspection_date);

-- 検査員の受注可否回答
create table public.kensa_availabilities (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.kensa_inspections(id) on delete cascade,
  inspector_id uuid not null references public.kensa_inspectors(id) on delete cascade,
  answer text not null check (answer in ('yes', 'no')),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_id, inspector_id)
);

-- アサイン（確定）
create table public.kensa_assignments (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.kensa_inspections(id) on delete cascade,
  inspector_id uuid not null references public.kensa_inspectors(id) on delete cascade,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (inspection_id, inspector_id)
);
create index kensa_assignments_inspector_idx on public.kensa_assignments (inspector_id);

-- 交通費申請
create table public.kensa_expenses (
  id uuid primary key default gen_random_uuid(),
  inspector_id uuid not null references public.kensa_inspectors(id) on delete cascade,
  inspection_id uuid references public.kensa_inspections(id) on delete set null,
  use_date date not null,
  transport text not null check (transport in ('car', 'train')),
  -- 車
  distance_km numeric(7, 1),
  rate_per_km integer,
  parking_fee integer not null default 0,
  receipt_paths jsonb not null default '[]'::jsonb,
  -- 電車: [{ "from": "横浜", "to": "川崎", "fare": 220, "round_trip": true }]
  train_legs jsonb not null default '[]'::jsonb,
  amount integer not null default 0,
  note text not null default '',
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected', 'paid')),
  admin_comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index kensa_expenses_inspector_idx on public.kensa_expenses (inspector_id, use_date);

-- 50問テスト：問題
create table public.kensa_questions (
  id uuid primary key default gen_random_uuid(),
  sort_order integer not null default 0,
  category text not null default '',
  question text not null,
  choices jsonb not null check (jsonb_typeof(choices) = 'array'),
  correct_index integer not null check (correct_index >= 0),
  explanation text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 50問テスト：受験結果
create table public.kensa_test_attempts (
  id uuid primary key default gen_random_uuid(),
  inspector_id uuid not null references public.kensa_inspectors(id) on delete cascade,
  question_ids jsonb not null,
  answers jsonb,
  score integer,
  total integer not null,
  passed boolean,
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index kensa_test_attempts_inspector_idx on public.kensa_test_attempts (inspector_id, started_at desc);

-- 設定（1 行のみ）
create table public.kensa_settings (
  id integer primary key default 1 check (id = 1),
  car_rate_per_km integer not null default 20,
  test_question_count integer not null default 50,
  test_pass_score integer not null default 40,
  updated_at timestamptz not null default now()
);
insert into public.kensa_settings (id) values (1);

-- updated_at トリガー
do $$
declare t text;
begin
  foreach t in array array[
    'kensa_admins', 'kensa_inspectors', 'kensa_stores', 'kensa_periods', 'kensa_inspections',
    'kensa_availabilities', 'kensa_expenses', 'kensa_questions', 'kensa_settings'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.kensa_touch_updated_at()',
      t || '_touch', t
    );
  end loop;
end $$;

-- RLS（ポリシーなし＝anon / authenticated からは一切アクセス不可）
alter table public.kensa_admins enable row level security;
alter table public.kensa_inspectors enable row level security;
alter table public.kensa_stores enable row level security;
alter table public.kensa_periods enable row level security;
alter table public.kensa_inspections enable row level security;
alter table public.kensa_availabilities enable row level security;
alter table public.kensa_assignments enable row level security;
alter table public.kensa_expenses enable row level security;
alter table public.kensa_questions enable row level security;
alter table public.kensa_test_attempts enable row level security;
alter table public.kensa_settings enable row level security;

-- 領収書用の非公開バケット
insert into storage.buckets (id, name, public)
values ('kensa-receipts', 'kensa-receipts', false)
on conflict (id) do nothing;

-- 旧アプリの店舗マスタを引き継ぐ（存在する場合のみ）
do $$
begin
  if to_regclass('public.eisei_stores') is not null then
    insert into public.kensa_stores (name, group_name, area, address, lat, lng)
    select name, coalesce(group_name, ''), coalesce(area, ''), coalesce(address, ''), lat, lng
    from public.eisei_stores
    order by created_at;
  end if;
end $$;
