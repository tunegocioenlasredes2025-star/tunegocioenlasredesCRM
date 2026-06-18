-- ============================================================
-- TNR · Notificaciones push (Web Push) — setup en Supabase
-- Correr DESPUÉS de supabase-setup.sql
-- ============================================================

-- 1) Tabla de suscripciones de los navegadores
create table if not exists push_subs (
  id text primary key,            -- endpoint del navegador
  data jsonb not null,            -- objeto subscription completo
  updated_at timestamptz default now()
);
alter table push_subs enable row level security;
drop policy if exists "tnr_all_push_subs" on push_subs;
create policy "tnr_all_push_subs" on push_subs for all using (true) with check (true);

-- 2) Programar el envío diario (requiere extensiones pg_cron y pg_net)
--    Activá ambas en: Database -> Extensions  (buscar "pg_cron" y "pg_net")
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 3) Cron: llama a la Edge Function "notify" todos los días 09:00 (UTC-3 = 12:00 UTC)
--    REEMPLAZÁ <PROJECT_REF> por tu ref (oqhzonwrcldwtdfurhzj) y <ANON_KEY> por tu clave anon.
select cron.unschedule('tnr-notify-daily') where exists (select 1 from cron.job where jobname = 'tnr-notify-daily');

select cron.schedule(
  'tnr-notify-daily',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/notify',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <ANON_KEY>')
  );
  $$
);
