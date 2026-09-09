-- ============================================================
-- TNR · Ajuste: el vendedor se queda con tres pantallas
-- ============================================================
--
-- Para correr DESPUÉS de equipo-setup.sql, que ya está aplicado.
--
-- Cambia dos cosas respecto de lo anterior:
--   1. En tareas, el vendedor ve SÓLO las suyas. Antes veía también las de
--      "equipo". Tareas para él es un anotador propio, no la agenda de la
--      agencia.
--   2. `rutinas` pasa a ser sólo de los socios: el vendedor ya no tiene esa
--      pantalla, así que tampoco necesita las filas.
--
-- Mateo y Santiago no cambian: siguen viendo todo.
-- ============================================================

do $$
begin
  if (select count(*) from tnr_equipo where rol = 'socio') < 1 then
    raise exception 'Pará: no hay ningún socio en tnr_equipo.';
  end if;
end $$;

-- ---------- Tareas: sólo las propias ----------
drop policy if exists "tnr_propios_tareas" on tareas;
create policy "tnr_propios_tareas" on tareas for all to authenticated
  using (responsable = tnr_mi_resp())
  with check (responsable = tnr_mi_resp());

-- ---------- Rutinas: sólo socios ----------
drop policy if exists "tnr_propios_rutinas" on rutinas;
drop policy if exists "tnr_socio_rutinas"   on rutinas;
create policy "tnr_socio_rutinas" on rutinas for all to authenticated
  using (tnr_es_socio()) with check (tnr_es_socio());

-- Qué quedó, por tabla. `tnr_socio_*` = sólo socios;
-- `tnr_propios_*` = además, cada uno lo suyo.
select tablename, policyname from pg_policies
 where schemaname = 'public' and tablename in ('prospectos','tareas','rutinas','clientes')
 order by tablename, policyname;
