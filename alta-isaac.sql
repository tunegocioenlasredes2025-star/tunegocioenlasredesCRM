-- ============================================================
-- TNR · Alta de Isaac como vendedor
-- ============================================================
-- ORDEN. Esto se corre DESPUÉS de haber creado el usuario en
-- Authentication → Users. Si el mail todavía no existe ahí, el
-- insert no agrega nada (no falla, simplemente no entra la fila).
--
-- Pegar en: Supabase → SQL Editor → New query → Run
-- ============================================================

insert into tnr_equipo (user_id, email, resp_id, rol, nombre)
select u.id, u.email, v.resp_id, v.rol, v.nombre
from (values
  ('isaac@tunegocioenlasredes.com.ar', 'isaac', 'vendedor', 'Isaac')
) as v(email, resp_id, rol, nombre)
join auth.users u on lower(u.email) = v.email
on conflict (user_id) do update
  set resp_id = excluded.resp_id, rol = excluded.rol, nombre = excluded.nombre;

-- VERIFICACIÓN. Tienen que salir 6 filas y una de ellas ser isaac.
-- Si isaac no aparece, es que falta crearlo en Authentication → Users.
select email, resp_id, rol, nombre from tnr_equipo order by rol, nombre;

-- Y esto tiene que devolver 100: son los prospectos que ya le cargamos.
select count(*) as prospectos_de_isaac
from prospectos where responsable = 'isaac';
