-- ============================================================
-- TNR · Sistema Operativo — tablas nuevas
-- Copiá y pegá TODO esto en: Supabase → SQL Editor → New query → Run
-- Es idempotente: se puede correr las veces que haga falta.
-- ============================================================
--
-- QUÉ AGREGA
--   proyectos → los trabajos abiertos (Thiago, MC E-Bike, Motos Roll, F5…)
--   rutinas   → las plantillas de las tareas que se repiten todos los días
--               (los 15 mails de MF, los 20 mensajes de IG, etc.)
--
-- Las tareas del día siguen viviendo en la tabla `tareas` que ya existía.
-- Nada de lo que ya está cargado se toca.
-- ============================================================

create table if not exists proyectos (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists rutinas (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- Los horarios de recordatorio de cada persona (una fila por usuario).
-- Van en la nube y no en el celular porque el aviso lo manda el servidor:
-- si vivieran en el teléfono, no llegarían con la app cerrada.
create table if not exists ajustes (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table proyectos enable row level security;
alter table rutinas   enable row level security;
alter table ajustes   enable row level security;

-- Mismo criterio que el resto del CRM hoy (clave anónima).
-- Cuando se cierre la base con login, auth-setup.sql reemplaza estas políticas.
drop policy if exists "tnr_all_proyectos" on proyectos;
drop policy if exists "tnr_all_rutinas"   on rutinas;
drop policy if exists "tnr_all_ajustes"   on ajustes;
create policy "tnr_all_proyectos" on proyectos for all using (true) with check (true);
create policy "tnr_all_rutinas"   on rutinas   for all using (true) with check (true);
create policy "tnr_all_ajustes"   on ajustes   for all using (true) with check (true);

-- Realtime (para que si Mateo marca una tarea, a Santiago se le actualice sola)
do $$
declare t text;
begin
  foreach t in array array['proyectos','rutinas','ajustes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
