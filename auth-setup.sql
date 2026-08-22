-- ============================================================
-- TNR · Cerrar la base con login
-- ============================================================
--
-- QUÉ ARREGLA ESTO
-- Hoy las políticas de las tablas del CRM son `using (true)`. Eso significa
-- que cualquiera que abra el sitio y mire el código fuente tiene la anon key,
-- y con esa key puede leer, modificar y borrar los 1.700 prospectos desde
-- cualquier lado. Mientras el CRM era una libreta interna era un riesgo
-- tolerable. Un módulo que manda mensajes en nombre de TNR no puede quedar
-- detrás de esa misma puerta.
--
-- ORDEN OBLIGATORIO — NO correr este archivo antes de tiempo:
--   1. Crear los usuarios en Supabase → Authentication → Users → Add user
--      (mail + contraseña, uno por persona del equipo).
--   2. Deployar la versión del CRM que tiene pantalla de login.
--   3. Iniciar sesión y confirmar que se ven los prospectos.
--   4. RECIÉN AHÍ correr este archivo.
--
-- Si se corre antes del paso 2, el CRM deja de mostrar datos hasta que se
-- deploye el login. No se pierde nada: los datos siguen ahí, es sólo acceso.
-- Al final del archivo está el rollback para volver atrás en 10 segundos.
-- ============================================================

-- ---------- Tablas nuevas de campañas: sólo usuarios logueados ----------
-- Primero saco los permisos temporales que dejó campanas-setup.sql.
drop policy if exists "tnr_tmp_campanas"      on campanas;
drop policy if exists "tnr_tmp_destinatarios" on campana_destinatarios;
drop policy if exists "tnr_tmp_plantillas"    on plantillas;
drop policy if exists "tnr_tmp_mensajes"      on mensajes;
drop policy if exists "tnr_tmp_cuentas"       on cuentas_wa;
drop policy if exists "tnr_tmp_supresiones"   on supresiones;

drop policy if exists "tnr_auth_campanas"       on campanas;
drop policy if exists "tnr_auth_destinatarios"  on campana_destinatarios;
drop policy if exists "tnr_auth_plantillas"     on plantillas;
drop policy if exists "tnr_auth_mensajes"       on mensajes;
drop policy if exists "tnr_auth_cuentas"        on cuentas_wa;
drop policy if exists "tnr_auth_supresiones"    on supresiones;

create policy "tnr_auth_campanas"      on campanas              for all
  to authenticated using (true) with check (true);
create policy "tnr_auth_destinatarios" on campana_destinatarios for all
  to authenticated using (true) with check (true);
create policy "tnr_auth_plantillas"    on plantillas            for all
  to authenticated using (true) with check (true);
create policy "tnr_auth_cuentas"       on cuentas_wa            for all
  to authenticated using (true) with check (true);
create policy "tnr_auth_supresiones"   on supresiones           for all
  to authenticated using (true) with check (true);

-- `mensajes` es el log de auditoría: se lee y se agrega, no se edita ni se
-- borra. Sin política de update/delete, nadie puede reescribir el historial
-- de lo que se mandó — ni desde el navegador ni con la key en la mano.
create policy "tnr_auth_mensajes_leer"  on mensajes for select
  to authenticated using (true);
create policy "tnr_auth_mensajes_crear" on mensajes for insert
  to authenticated with check (true);

-- ---------- Tablas viejas del CRM: cerrar el acceso anónimo ----------
-- PASO 4. Hasta acá el CRM sigue funcionando igual que siempre.
drop policy if exists "tnr_all_prospectos" on prospectos;
drop policy if exists "tnr_all_clientes"   on clientes;
drop policy if exists "tnr_all_tareas"     on tareas;
drop policy if exists "tnr_all_eventos"    on eventos;
drop policy if exists "tnr_all_metas"      on metas;
drop policy if exists "tnr_all_proyectos"  on proyectos;
drop policy if exists "tnr_all_rutinas"    on rutinas;

create policy "tnr_auth_prospectos" on prospectos for all
  to authenticated using (true) with check (true);
create policy "tnr_auth_clientes"   on clientes   for all
  to authenticated using (true) with check (true);
create policy "tnr_auth_tareas"     on tareas     for all
  to authenticated using (true) with check (true);
create policy "tnr_auth_eventos"    on eventos    for all
  to authenticated using (true) with check (true);
create policy "tnr_auth_metas"      on metas      for all
  to authenticated using (true) with check (true);
-- Tablas del Sistema Operativo (ver sistema-setup.sql). Correr ese archivo primero.
create policy "tnr_auth_proyectos"  on proyectos  for all
  to authenticated using (true) with check (true);
create policy "tnr_auth_rutinas"    on rutinas    for all
  to authenticated using (true) with check (true);

-- ---------- Verificación ----------
-- Tiene que devolver `authenticated` en la columna roles para cada fila.
-- Si alguna dice {public} o {anon}, esa tabla quedó abierta.
select tablename, policyname, roles
  from pg_policies
 where schemaname = 'public'
 order by tablename, policyname;


-- ============================================================
-- ROLLBACK — sólo si algo salió mal y hay que volver a abrir el CRM
-- ya mismo. Deja los datos accesibles con la anon key otra vez, o sea
-- vuelve a poner el problema que este archivo arregla. Es un parche
-- de emergencia, no un estado para quedarse.
-- ============================================================
-- drop policy if exists "tnr_auth_prospectos" on prospectos;
-- create policy "tnr_all_prospectos" on prospectos for all using (true) with check (true);
-- drop policy if exists "tnr_auth_clientes" on clientes;
-- create policy "tnr_all_clientes" on clientes for all using (true) with check (true);
-- drop policy if exists "tnr_auth_tareas" on tareas;
-- create policy "tnr_all_tareas" on tareas for all using (true) with check (true);
-- drop policy if exists "tnr_auth_eventos" on eventos;
-- create policy "tnr_all_eventos" on eventos for all using (true) with check (true);
-- drop policy if exists "tnr_auth_metas" on metas;
-- create policy "tnr_all_metas" on metas for all using (true) with check (true);
