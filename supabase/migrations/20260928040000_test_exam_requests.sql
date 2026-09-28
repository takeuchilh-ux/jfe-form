-- 50問テスト：練習用（記録なし）と本番用（申請→管理者承認→受験日に受験）に分ける
-- 本番テストの受験申請
create table public.kensa_test_requests (
  id uuid primary key default gen_random_uuid(),
  inspector_id uuid not null references public.kensa_inspectors(id) on delete cascade,
  exam_date date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  admin_comment text not null default '',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index kensa_test_requests_inspector_idx on public.kensa_test_requests (inspector_id, created_at desc);
create index kensa_test_requests_status_idx on public.kensa_test_requests (status, exam_date);
create trigger kensa_test_requests_touch before update on public.kensa_test_requests
  for each row execute function public.kensa_touch_updated_at();
alter table public.kensa_test_requests enable row level security;

-- 本番の受験記録と申請を 1 対 1 で紐づける
alter table public.kensa_test_attempts
  add column request_id uuid unique references public.kensa_test_requests(id) on delete set null;

-- 1 日の受験回数上限は廃止（本番は承認制、練習は無制限）
alter table public.kensa_settings drop column test_daily_limit;
