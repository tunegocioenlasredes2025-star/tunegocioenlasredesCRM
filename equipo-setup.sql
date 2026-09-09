-- ============================================================
-- TNR · Cada vendedor con sus propios prospectos
-- ============================================================
--
-- QUÉ HACE
-- Hoy cualquiera que entra al CRM ve todo: los 1.700 prospectos, los
-- clientes, la facturación. Con Bauti y Santi De Rosa sumándose al equipo
-- eso deja de servir. Este archivo hace dos cosas:
--
--   1. Prospectos, tareas y rutinas pasan a tener dueño. El vendedor ve los
--      suyos y los compartidos ("equipo" / "ambos"). El socio ve todo.
--   2. Clientes, facturación, reuniones, proyectos, metas y campañas quedan
--      sólo para los socios.
--
-- Esto se hace en la BASE, no en la pantalla. Esconder un botón no protege
-- nada: con la anon key y el navegador se lee igual. Acá el que no tiene
-- permiso directamente no recibe las filas.
--
-- ORDEN OBLIGATORIO
--   1. Crear los 2 usuarios nuevos en Supabase → Authentication → Users →
--      Add user, con "Auto Confirm User" tildado.
--   2. Correr el BLOQUE 1 de este archivo (carga el equipo).
--   3. Verificar que el BLOQUE 1 haya devuelto las 4 filas.
--   4. Recién ahí correr el BLOQUE 2 (cierra los permisos).
--
-- Si el paso 2 no encuentra a alguien, el paso 4 lo deja afuera del CRM.
-- Por eso el BLOQUE 2 se niega a correr si no hay socios cargados.
-- Al final está el rollback.
-- ============================================================


-- ============================================================
-- BLOQUE 1 · Quién es quién
-- ============================================================

create table if not exists tnr_equipo (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email   text not null unique,
  resp_id text not null unique,          -- el mismo id que usa el CRM en `responsable`
  rol     text not null default 'vendedor' check (rol in ('socio', 'vendedor')),
  nombre  text,
  creado  timestamptz default now()
);

alter table tnr_equipo enable row level security;

-- Cada uno puede leer su propia fila (el CRM la usa para saber qué mostrar).
drop policy if exists "tnr_equipo_propia" on tnr_equipo;
create policy "tnr_equipo_propia" on tnr_equipo for select
  to authenticated using (user_id = auth.uid());

-- Carga por mail. Si un mail todavía no existe en Authentication, esa fila
-- simplemente no entra: por eso hay que crear los usuarios ANTES.
insert into tnr_equipo (user_id, email, resp_id, rol, nombre)
select u.id, u.email, v.resp_id, v.rol, v.nombre
from (values
  ('mateo@tunegocioenlasredes.com.ar',      'mateo',      'socio',    'Mateo De Rosa'),
  ('santiago@tunegocioenlasredes.com.ar',   'santiago',   'socio',    'Santiago Stalla'),
  ('santiderosa@tunegocioenlasredes.com.ar','santiderosa','vendedor', 'Santiago De Rosa'),
  ('bautista@tunegocioenlasredes.com.ar',   'bautista',   'vendedor', 'Bautista Rega')
) as v(email, resp_id, rol, nombre)
join auth.users u on lower(u.email) = v.email
on conflict (user_id) do update
  set resp_id = excluded.resp_id, rol = excluded.rol, nombre = excluded.nombre;

-- VERIFICACIÓN: tienen que salir 4 filas. Si falta alguna, ese usuario no
-- está creado en Authentication todavía. Crealo y volvé a correr el bloque.
select email, resp_id, rol, nombre from tnr_equipo order by rol, nombre;


-- ============================================================
-- BLOQUE 2 · Cerrar los permisos
-- Correr SOLO después de ver las 4 filas arriba.
-- ============================================================

-- Freno de mano: sin socios cargados, esto dejaría a todos afuera.
do $$
begin
  if (select count(*) from tnr_equipo where rol = 'socio') < 1 then
    raise exception 'Pará: no hay ningún socio en tnr_equipo. Corré el BLOQUE 1 primero.';
  end if;
end $$;

-- Dos preguntas que las políticas hacen todo el tiempo. Van como
-- `security definer` para que puedan leer tnr_equipo sin pedir permiso.
create or replace function tnr_es_socio() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from tnr_equipo e where e.user_id = auth.uid() and e.rol = 'socio');
$$;

create or replace function tnr_mi_resp() returns text
  language sql stable security definer set search_path = public as $$
  select e.resp_id from tnr_equipo e where e.user_id = auth.uid();
$$;

-- ---------- Lo propio y lo compartido ----------
-- prospectos, tareas y rutinas guardan a quién pertenecen dentro del jsonb.
-- Lo exponemos como columna para poder filtrar sin cambiar cómo escribe la app.
alter table prospectos add column if not exists responsable text
  generated always as (data ->> 'responsable') stored;
alter table tareas     add column if not exists responsable text
  generated always as (data ->> 'responsable') stored;

create index if not exists prospectos_responsable_idx on prospectos (responsable);
create index if not exists tareas_responsable_idx     on tareas (responsable);

-- El socio ve todo. El vendedor ve SÓLO lo suyo, ni siquiera lo compartido:
-- Tareas para él es un anotador propio, no la agenda del equipo.
do $$
declare t text;
begin
  foreach t in array array['prospectos', 'tareas']
  loop
    execute format('drop policy if exists %I on %I', 'tnr_auth_'   || t, t);
    execute format('drop policy if exists %I on %I', 'tnr_all_'    || t, t);
    execute format('drop policy if exists %I on %I', 'tnr_socio_'  || t, t);
    execute format('drop policy if exists %I on %I', 'tnr_propios_'|| t, t);
    execute format(
      'create policy %I on %I for all to authenticated using (tnr_es_socio()) with check (tnr_es_socio())',
      'tnr_socio_' || t, t);
    execute format(
      'create policy %I on %I for all to authenticated '
      'using (responsable = tnr_mi_resp()) '
      'with check (responsable = tnr_mi_resp())',
      'tnr_propios_' || t, t);
  end loop;
end $$;

-- ---------- Lo que es sólo de los socios ----------
-- Clientes y plata, obvio. `eventos` también: son las reuniones con clientes.
-- `proyectos`, `metas` y `rutinas` son la estructura de la agencia; el
-- vendedor no tiene esas pantallas, así que tampoco necesita las filas.
do $$
declare t text;
begin
  foreach t in array array['clientes', 'eventos', 'metas', 'proyectos', 'rutinas',
                           'campanas', 'campana_destinatarios', 'plantillas',
                           'cuentas_wa', 'supresiones']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %I on %I', 'tnr_auth_' || t, t);
    execute format('drop policy if exists %I on %I', 'tnr_all_'  || t, t);
    execute format('drop policy if exists %I on %I', 'tnr_socio_'|| t, t);
    execute format(
      'create policy %I on %I for all to authenticated using (tnr_es_socio()) with check (tnr_es_socio())',
      'tnr_socio_' || t, t);
  end loop;
end $$;

-- `ajustes` queda abierto a quien tenga sesión: son las preferencias de cada
-- uno (a qué hora le suena el recordatorio). Si se cierra, el vendedor no
-- puede configurarse nada y la app le falla.
drop policy if exists "tnr_auth_ajustes"  on ajustes;
drop policy if exists "tnr_all_ajustes"   on ajustes;
drop policy if exists "tnr_socio_ajustes" on ajustes;
create policy "tnr_auth_ajustes" on ajustes for all
  to authenticated using (true) with check (true);

-- `mensajes` es el log de auditoría de las campañas: se lee y se agrega,
-- nunca se edita. Campañas es cosa de los socios.
drop policy if exists "tnr_auth_mensajes_leer"   on mensajes;
drop policy if exists "tnr_auth_mensajes_crear"  on mensajes;
drop policy if exists "tnr_socio_mensajes_leer"  on mensajes;
drop policy if exists "tnr_socio_mensajes_crear" on mensajes;
create policy "tnr_socio_mensajes_leer"  on mensajes for select
  to authenticated using (tnr_es_socio());
create policy "tnr_socio_mensajes_crear" on mensajes for insert
  to authenticated with check (tnr_es_socio());


-- ---------- Verificación ----------
select tablename, policyname, roles
  from pg_policies where schemaname = 'public'
 order by tablename, policyname;


-- ============================================================
-- ROLLBACK — si algo salió mal y hay que volver a como estaba.
-- Deja a todos los usuarios logueados viendo todo otra vez.
-- ============================================================
-- do $$
-- declare t text;
-- begin
--   foreach t in array array['prospectos','tareas','rutinas','clientes','eventos',
--                            'metas','proyectos','ajustes','campanas',
--                            'campana_destinatarios','plantillas','cuentas_wa',
--                            'supresiones']
--   loop
--     if to_regclass('public.' || t) is null then continue; end if;
--     execute format('drop policy if exists %I on %I', 'tnr_socio_'   || t, t);
--     execute format('drop policy if exists %I on %I', 'tnr_propios_' || t, t);
--     execute format('create policy %I on %I for all to authenticated using (true) with check (true)',
--                    'tnr_auth_' || t, t);
--   end loop;
-- end $$;
