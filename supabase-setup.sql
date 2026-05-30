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

-- Seguridad a nivel de fila
alter table prospectos enable row level security;
alter table clientes  enable row level security;
alter table tareas    enable row level security;

-- Acceso con la clave anónima (uso interno del equipo).
-- (Si en el futuro querés login por usuario, se reemplazan estas políticas.)
drop policy if exists "tnr_all_prospectos" on prospectos;
drop policy if exists "tnr_all_clientes"   on clientes;
drop policy if exists "tnr_all_tareas"     on tareas;

create policy "tnr_all_prospectos" on prospectos for all using (true) with check (true);
create policy "tnr_all_clientes"   on clientes   for all using (true) with check (true);
create policy "tnr_all_tareas"     on tareas     for all using (true) with check (true);

-- Realtime (para que los cambios aparezcan al instante en todos los dispositivos)
alter publication supabase_realtime add table prospectos;
alter publication supabase_realtime add table clientes;
alter publication supabase_realtime add table tareas;
