-- ============================================================
-- TNR · Setup de base de datos en Supabase
-- Copiá y pegá TODO esto en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- Tablas (una fila por registro, los datos van en JSONB)
create table if not exists prospectos (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
create table if not exists clientes (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
create table if not exists tareas (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
create table if not exists eventos (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
create table if not exists metas (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- Seguridad a nivel de fila
alter table prospectos enable row level security;
alter table clientes  enable row level security;
alter table tareas    enable row level security;
alter table eventos   enable row level security;
alter table metas     enable row level security;

-- Acceso con la clave anónima (uso interno del equipo).
-- (Si en el futuro querés login por usuario, se reemplazan estas políticas.)
drop policy if exists "tnr_all_prospectos" on prospectos;
drop policy if exists "tnr_all_clientes"   on clientes;
drop policy if exists "tnr_all_tareas"     on tareas;

drop policy if exists "tnr_all_eventos" on eventos;
drop policy if exists "tnr_all_metas"   on metas;

create policy "tnr_all_prospectos" on prospectos for all using (true) with check (true);
create policy "tnr_all_clientes"   on clientes   for all using (true) with check (true);
create policy "tnr_all_tareas"     on tareas     for all using (true) with check (true);
create policy "tnr_all_eventos"    on eventos    for all using (true) with check (true);
create policy "tnr_all_metas"      on metas      for all using (true) with check (true);

-- Realtime (idempotente: se puede correr varias veces sin error)
do $$
declare t text;
begin
  foreach t in array array['prospectos','clientes','tareas','eventos','metas'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
