-- ============================================================
-- TNR · Borrar las tareas que las rutinas les fabricaron de más
-- ============================================================
--
-- Al sumar a Bauti y a Santi De Rosa al equipo, las rutinas marcadas como
-- "ambos" empezaron a generarles una tarea a ellos también: a Bauti le
-- aparecían los 15 contactos de Mundo Ferretero, que no son cosa suya.
--
-- Ya está arreglado en el código ("ambos" vuelve a significar los socios),
-- pero las tareas que se crearon quedaron en la base. Esto las saca.
--
-- Sólo borra las que fabricó una rutina: sus ids empiezan con RT-. Lo que
-- ellos hayan escrito a mano (ids TK-) no se toca.
-- ============================================================

-- Mirá primero qué se va a borrar.
select data ->> 'responsable' as persona, count(*) as tareas
  from tareas
 where id like 'RT-%'
   and data ->> 'responsable' in ('bautista', 'santiderosa')
 group by 1;

-- Si el número cierra, corré esto.
delete from tareas
 where id like 'RT-%'
   and data ->> 'responsable' in ('bautista', 'santiderosa');
