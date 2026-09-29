-- 発注メールは端末のメールアプリで作成する方式に変更：状態に draft（メールアプリで作成）を追加
alter table public.kensa_orders drop constraint kensa_orders_mail_status_check;
alter table public.kensa_orders add constraint kensa_orders_mail_status_check check (mail_status in ('pending', 'draft', 'sent', 'failed'));
