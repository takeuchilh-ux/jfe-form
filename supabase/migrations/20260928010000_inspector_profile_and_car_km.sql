-- 検査員の自己登録（LINE 友だち追加 → 基本情報登録 → 管理者承認）と、車の交通費を距離（km）ベースにする変更

-- 検査員：基本情報・口座情報・承認
alter table public.kensa_inspectors
  add column last_name text not null default '',
  add column first_name text not null default '',
  add column address text not null default '',
  add column bank_name text not null default '',
  add column branch_name text not null default '',
  add column branch_number text not null default '',
  add column account_type text not null default '普通' check (account_type in ('普通', '当座')),
  add column account_number text not null default '',
  add column account_holder text not null default '',
  add column approved_at timestamptz;

-- 連携コード方式は廃止（LINE から自分で登録する方式へ）
alter table public.kensa_inspectors drop column link_code;

-- 車：km 単価による金額換算は行わない（距離＋任意の駐車場代）
alter table public.kensa_settings drop column car_rate_per_km;
alter table public.kensa_expenses
  drop column rate_per_km,
  add column route_from text not null default '',
  add column route_to text not null default '',
  add column round_trip boolean not null default false;
