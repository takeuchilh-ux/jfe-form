-- 50問テストを○×方式に：同じテーマの問題（正しい文／誤った文）をまとめる group_key と、1 日の受験回数上限を追加
alter table public.kensa_questions add column group_key text not null default '';
alter table public.kensa_settings add column test_daily_limit integer not null default 5 check (test_daily_limit between 1 and 100);
create index kensa_test_attempts_daily_idx on public.kensa_test_attempts (inspector_id, started_at);
