-- 研修生の同行枠（0＝同行不可）、検査員による日時変更の記録、前日リマインドの送信記録
alter table public.kensa_inspections
  add column if not exists trainee_slots integer not null default 1 check (trainee_slots between 0 and 5),
  add column if not exists change_note text not null default '',
  add column if not exists changed_at timestamptz,
  add column if not exists change_seen boolean not null default true;
alter table public.kensa_assignments
  add column if not exists reminded_at timestamptz;
