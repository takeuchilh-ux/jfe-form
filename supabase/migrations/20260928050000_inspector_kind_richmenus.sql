-- 検査員の区分（検査員／研修生）と、区分ごとのリッチメニュー
alter table public.kensa_inspectors
  add column kind text not null default 'trainee' check (kind in ('inspector', 'trainee'));

-- アサインの役割：main＝担当検査員（必要人数に数える）、trainee＝同行（研修）
alter table public.kensa_assignments
  add column role text not null default 'main' check (role in ('main', 'trainee'));

-- LINE リッチメニュー ID（未登録者用・検査員用・研修生用）
alter table public.kensa_settings
  add column richmenu_guest_id text not null default '',
  add column richmenu_inspector_id text not null default '',
  add column richmenu_trainee_id text not null default '';
