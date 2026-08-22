-- ============================================================
-- TNR · Campañas de WhatsApp — tablas
-- Pegar en: Supabase → SQL Editor → New query → Run
-- Es idempotente: se puede correr más de una vez sin romper nada.
--
-- Nota de diseño: las tablas viejas del CRM guardan todo en un jsonb
-- (id/data/updated_at) porque el navegador se baja la colección entera.
-- Acá NO: el worker necesita pedir "los 40 pendientes de esta campaña"
-- sin traerse 1.400 filas, y necesita que dos workers no tomen al mismo
-- destinatario. Eso pide columnas reales, índices y bloqueo de fila.
-- ============================================================

create table if not exists campanas (
  id                text primary key,
  nombre            text not null,
  estado            text not null default 'borrador',
    -- borrador | programada | en_curso | pausada | completada | cancelada
  criterio          jsonb not null default '{}'::jsonb,   -- filtros del CRM, no lista congelada
  plantilla_id      text,
  canal             text not null default 'prueba',       -- prueba | meta | evolution
  cuenta_id         text,
  programada_para   timestamptz,
  zona_horaria      text not null default 'America/Argentina/Buenos_Aires',
  ventana_desde     time,
  ventana_hasta     time,
  dias_semana       int[] default '{1,2,3,4,5}',          -- 1=lunes … 7=domingo
  cupo_diario       int not null default 50,
  intervalo_seg     int not null default 45,
  motivo_pausa      text,
  creada_por        text,
  creada_en         timestamptz not null default now(),
  actualizada_en    timestamptz not null default now()
);

-- Una fila por persona por campaña. El unique de abajo es el anti-duplicado
-- de verdad: no depende de que el código se acuerde de chequear.
create table if not exists campana_destinatarios (
  id                bigserial primary key,
  campana_id        text not null references campanas(id) on delete cascade,
  prospecto_id      text not null,
  telefono          text not null,                        -- E.164, siempre 549…
  variables         jsonb not null default '{}'::jsonb,   -- nombre, empresa… ya resueltas
  variante          text,
  estado            text not null default 'pendiente',
    -- pendiente | enviando | enviado | entregado | leido | respondido | fallido | suprimido
  motivo            text,                                 -- por qué se suprimió o por qué falló
  intentos          int not null default 0,
  proximo_intento   timestamptz,
  wamid             text,
  enviado_en        timestamptz,
  respondido_en     timestamptz,
  actualizado_en    timestamptz not null default now(),
  constraint campana_destinatarios_unicos unique (campana_id, telefono)
);

create index if not exists cd_campana_estado on campana_destinatarios (campana_id, estado);
create index if not exists cd_cola           on campana_destinatarios (campana_id, proximo_intento)
  where estado = 'pendiente';
create index if not exists cd_telefono       on campana_destinatarios (telefono);
create index if not exists cd_prospecto      on campana_destinatarios (prospecto_id);

create table if not exists plantillas (
  id                 text primary key,
  nombre             text not null,
  bloques            jsonb not null default '[]'::jsonb,  -- [{tipo:'texto', contenido:'…'}]
  variables          text[] not null default '{}',
  meta_template_name text,                                -- plantilla aprobada por Meta
  meta_idioma        text default 'es_AR',
  meta_estado        text,                                -- pendiente | aprobada | rechazada
  archivada          boolean not null default false,
  creada_en          timestamptz not null default now()
);

-- Log inmutable: una fila por intento. Nunca se actualiza ni se borra.
-- Responde "qué le mandamos exactamente, cuándo, y qué contestó el proveedor".
create table if not exists mensajes (
  id              bigserial primary key,
  campana_id      text,
  destinatario_id bigint,
  prospecto_id    text,
  telefono        text not null,
  canal           text,
  direccion       text not null default 'saliente',       -- saliente | entrante
  cuerpo          text,
  wamid           text,
  estado          text,
  error_codigo    text,
  error_detalle   text,
  costo           numeric(10,4),
  creado_en       timestamptz not null default now()
);
create index if not exists msg_telefono on mensajes (telefono, creado_en desc);
create index if not exists msg_campana  on mensajes (campana_id);
create unique index if not exists msg_wamid on mensajes (wamid) where wamid is not null;

create table if not exists cuentas_wa (
  id             text primary key,
  nombre         text not null,
  canal          text not null,                           -- meta | evolution | prueba
  identificador  text,                                    -- phone_number_id o instancia
  estado         text not null default 'desconectada',
  cupo_diario    int not null default 250,
  enviados_hoy   int not null default 0,
  dia            date,
  ultimo_error   text,
  actualizada_en timestamptz not null default now()
);

-- No contactar. Gana sobre cualquier campaña, siempre.
create table if not exists supresiones (
  telefono   text primary key,
  motivo     text,                                        -- baja | sin_whatsapp | rebote | manual
  origen     text,
  creada_en  timestamptz not null default now()
);

-- ============================================================
-- La cola. Toma un lote y lo marca como 'enviando' en la misma
-- operación: si dos workers corren a la vez, el segundo saltea las
-- filas ya tomadas (skip locked) en vez de mandar el mensaje dos veces.
-- ============================================================
create or replace function campana_tomar_lote(p_campana text, p_limite int)
returns setof campana_destinatarios
language plpgsql as $fn$
begin
  return query
  update campana_destinatarios d
     set estado = 'enviando',
         intentos = d.intentos + 1,
         actualizado_en = now()
   where d.id in (
     select c.id
       from campana_destinatarios c
      where c.campana_id = p_campana
        and c.estado = 'pendiente'
        and (c.proximo_intento is null or c.proximo_intento <= now())
      order by c.id
      limit p_limite
      for update skip locked
   )
  returning d.*;
end $fn$;

-- Contadores de una campaña sin traer las filas al navegador.
create or replace function campana_resumen(p_campana text)
returns table (estado text, total bigint)
language sql stable as $fn$
  select d.estado, count(*)::bigint
    from campana_destinatarios d
   where d.campana_id = p_campana
   group by d.estado;
$fn$;

-- Contadores de TODAS las campañas de una sola vez. La lista los necesita
-- para la barra de progreso: sin esto sería una consulta por campaña.
create or replace function campanas_resumen_todas()
returns table (campana_id text, estado text, total bigint)
language sql stable as $fn$
  select d.campana_id, d.estado, count(*)::bigint
    from campana_destinatarios d
   group by d.campana_id, d.estado;
$fn$;

-- Devuelve a la cola una tanda que quedó colgada en 'enviando'
-- porque se cayó el worker a mitad del lote.
create or replace function campana_recuperar_colgados(p_minutos int default 15)
returns int
language sql as $fn$
  with vueltos as (
    update campana_destinatarios
       set estado = 'pendiente', actualizado_en = now()
     where estado = 'enviando'
       and actualizado_en < now() - (p_minutos || ' minutes')::interval
    returning 1
  ) select count(*)::int from vueltos;
$fn$;

alter table campanas              enable row level security;
alter table campana_destinatarios enable row level security;
alter table plantillas            enable row level security;
alter table mensajes              enable row level security;
alter table cuentas_wa            enable row level security;
alter table supresiones           enable row level security;

-- ============================================================
-- PERMISOS TEMPORALES
-- ------------------------------------------------------------
-- Lo correcto es que estas tablas sólo las vea alguien con usuario y
-- contraseña. Eso está en auth-setup.sql y todavía no se aplicó, así que
-- por ahora quedan con el mismo acceso abierto que ya tienen las tablas
-- viejas del CRM: cualquiera con la dirección del sitio puede entrar.
--
-- Cuando se corra auth-setup.sql, estas cinco políticas se borran solas y
-- las reemplazan las que piden login. Mientras tanto, NO cargar acá nada
-- que no estés dispuesto a que se vea (por ejemplo, claves de proveedores).
-- ============================================================
drop policy if exists "tnr_tmp_campanas"      on campanas;
drop policy if exists "tnr_tmp_destinatarios" on campana_destinatarios;
drop policy if exists "tnr_tmp_plantillas"    on plantillas;
drop policy if exists "tnr_tmp_mensajes"      on mensajes;
drop policy if exists "tnr_tmp_cuentas"       on cuentas_wa;
drop policy if exists "tnr_tmp_supresiones"   on supresiones;

create policy "tnr_tmp_campanas"      on campanas              for all using (true) with check (true);
create policy "tnr_tmp_destinatarios" on campana_destinatarios for all using (true) with check (true);
create policy "tnr_tmp_plantillas"    on plantillas            for all using (true) with check (true);
create policy "tnr_tmp_mensajes"      on mensajes              for all using (true) with check (true);
create policy "tnr_tmp_cuentas"       on cuentas_wa            for all using (true) with check (true);
create policy "tnr_tmp_supresiones"   on supresiones           for all using (true) with check (true);
