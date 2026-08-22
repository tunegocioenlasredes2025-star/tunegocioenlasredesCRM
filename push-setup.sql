-- ============================================================
-- TNR · Notificaciones push (Web Push) — setup en Supabase
-- Correr DESPUÉS de supabase-setup.sql y de sistema-setup.sql
-- Es idempotente: se puede correr las veces que haga falta.
-- ============================================================
--
-- QUÉ CAMBIÓ RESPECTO DE ANTES
-- Antes había un único aviso, todos los días a las 9, con el mismo texto
-- para todos. Ahora cada uno elige sus horarios desde el CRM (Recordatorios)
-- y el aviso dice lo que esa persona tiene pendiente. Para que eso sea
-- posible, el cron pasa a correr cada 5 minutos y es la Edge Function la
-- que decide a quién le toca en cada vuelta.
-- ============================================================

-- 1) Tabla de suscripciones de los navegadores
create table if not exists push_subs (
  id text primary key,            -- endpoint del navegador
  data jsonb not null,            -- objeto subscription completo
  updated_at timestamptz default now()
);
-- Columna nueva: de quién es este aparato. Sin esto el servidor no puede
-- mandarle a Mateo lo de Mateo y a Santiago lo de Santiago.
alter table push_subs add column if not exists usuario text;

alter table push_subs enable row level security;
drop policy if exists "tnr_all_push_subs" on push_subs;
create policy "tnr_all_push_subs" on push_subs for all using (true) with check (true);

-- 2) Registro de lo ya avisado — es lo que evita que el mismo recordatorio
--    suene varias veces. La clave es fecha:usuario:evento; si ya está, no
--    se manda. Se limpia sola a los 30 días.
create table if not exists notif_log (
  id text primary key,
  enviado_en timestamptz default now()
);
alter table notif_log enable row level security;
drop policy if exists "tnr_all_notif_log" on notif_log;
create policy "tnr_all_notif_log" on notif_log for all using (true) with check (true);

-- 3) Extensiones necesarias para el cron
--    Si fallan, activalas a mano en: Database -> Extensions ("pg_cron" y "pg_net")
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 4) Cron cada 5 minutos. La función mira la hora de Argentina y decide.
--    REEMPLAZÁ <ANON_KEY> por la clave anon del proyecto (la misma de config.js).
select cron.unschedule('tnr-notify-daily') where exists (select 1 from cron.job where jobname = 'tnr-notify-daily');
select cron.unschedule('tnr-notify')       where exists (select 1 from cron.job where jobname = 'tnr-notify');

select cron.schedule(
  'tnr-notify',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://oqhzonwrcldwtdfurhzj.functions.supabase.co/notify',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <ANON_KEY>')
  );
  $$
);

-- 5) Limpieza del registro de avisos, una vez por día a las 4 de la mañana
select cron.unschedule('tnr-notif-log-limpieza') where exists (select 1 from cron.job where jobname = 'tnr-notif-log-limpieza');
select cron.schedule(
  'tnr-notif-log-limpieza',
  '0 7 * * *',
  $$ delete from notif_log where enviado_en < now() - interval '30 days'; $$
);

-- ---------- Verificación ----------
-- Tiene que listar 'tnr-notify' cada 5 minutos.
select jobname, schedule, active from cron.job order by jobname;

-- Para probar sin esperar (no manda nada, sólo dice qué haría):
--   https://oqhzonwrcldwtdfurhzj.functions.supabase.co/notify?debug=1
