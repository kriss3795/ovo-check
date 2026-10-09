-- =====================================================================
--  OVO CHECK · Servidor (Supabase)
--  Pega este archivo completo en Supabase > SQL Editor y presiona "Run".
--  Se puede volver a ejecutar sin perder datos.
-- =====================================================================

create table if not exists oc_ajustes (
  clave text primary key,
  valor text not null
);

insert into oc_ajustes (clave, valor) values
  ('max_granjas', '100'),                        -- tope de planteles que pueden existir en este servidor
  ('max_granjas_dia', '8'),                      -- planteles nuevos que se aceptan por día en todo el servidor
  ('max_galpones', '60'),                        -- galpones en producción que caben (suma de todos los planteles en uso)
  ('dias_fotos', '30'),                          -- días que se guardan las fotos en la nube
  ('max_fotos_granja', '3000'),                  -- tope de fotos guardadas por plantel
  ('max_mb_fotos_granja', '300'),                -- espacio máximo de fotos de un solo plantel
  ('max_mb_total', '900'),                       -- tope total de fotos (el plan gratis da 1.000 MB)
  ('max_mb_datos', '450'),                       -- tope de la base de datos (el plan gratis da 500 MB)
  ('max_registros_dia', '2500'),                 -- registros que un plantel puede enviar en 24 horas
  ('dias_abandono', '180'),                      -- días sin ningún uso para dar por abandonado un plantel que nunca registró nada
  ('zona_horaria', 'America/Santiago')           -- para saber qué día es en la granja al enviar recordatorios
on conflict (clave) do nothing;
delete from oc_ajustes where clave = 'clave_activacion';

-- ---------------------------------------------------------------------
--  Tablas
-- ---------------------------------------------------------------------

create table if not exists oc_granjas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  codigo text not null unique,
  config jsonb not null,
  version integer not null default 1,
  creado timestamptz not null default now()
);

create table if not exists oc_dispositivos (
  id uuid primary key default gen_random_uuid(),
  granja_id uuid not null references oc_granjas (id) on delete cascade,
  token text not null unique,
  nombre text not null default '',
  creado timestamptz not null default now(),
  visto timestamptz,
  pendientes integer not null default 0,
  usuario_id text,
  revocado boolean not null default false,
  fallos integer not null default 0,
  fallo_ultimo timestamptz
);

create table if not exists oc_sesiones (
  id uuid primary key default gen_random_uuid(),
  granja_id uuid not null references oc_granjas (id) on delete cascade,
  dispositivo_id uuid not null references oc_dispositivos (id) on delete cascade,
  usuario_id text not null,
  creado timestamptz not null default now()
);

-- Los registros solo se insertan. No existe ninguna función que los edite o borre.
create table if not exists oc_registros (
  id uuid primary key,
  granja_id uuid not null references oc_granjas (id) on delete cascade,
  dispositivo_id uuid,
  fecha date not null,
  galpon_id text,
  datos jsonb not null,
  capturado timestamptz not null,
  recibido timestamptz not null default now(),
  reloj_desfase_s integer not null default 0,
  demora_s integer not null default 0
);
create index if not exists oc_registros_granja_fecha on oc_registros (granja_id, fecha);
create index if not exists oc_registros_granja_recibido on oc_registros (granja_id, recibido);

create table if not exists oc_revisiones (
  id uuid primary key,
  granja_id uuid not null references oc_granjas (id) on delete cascade,
  registro_id uuid not null,
  usuario_id text not null,
  nota text not null default '',
  creado timestamptz not null default now()
);
create index if not exists oc_revisiones_granja on oc_revisiones (granja_id, creado);

-- Códigos de un solo uso para recuperar la clave de supervisor (se envían por correo).
create table if not exists oc_recuperaciones (
  id uuid primary key default gen_random_uuid(),
  granja_id uuid not null references oc_granjas (id) on delete cascade,
  usuario_id text not null,
  codigo_hash text not null,
  creado timestamptz not null default now(),
  intentos integer not null default 0,
  usado boolean not null default false
);
create index if not exists oc_recuperaciones_usuario on oc_recuperaciones (granja_id, usuario_id, creado);

-- Teléfonos que aceptaron recibir notificaciones.
create table if not exists oc_suscripciones (
  id uuid primary key default gen_random_uuid(),
  granja_id uuid not null references oc_granjas (id) on delete cascade,
  dispositivo_id uuid not null references oc_dispositivos (id) on delete cascade,
  usuario_id text not null,
  rol text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  creado timestamptz not null default now()
);
create index if not exists oc_suscripciones_granja on oc_suscripciones (granja_id);

-- Cada plantel tiene un nombre único (para que el operario lo encuentre escribiéndolo) y una clave
-- para sus operarios, que crea el supervisor.
alter table oc_granjas add column if not exists clave_operarios text;
alter table oc_granjas add column if not exists nombre_norm text;
create unique index if not exists oc_granjas_nombre_norm on oc_granjas (nombre_norm);
-- Cuándo se avisó a los supervisores que su plantel, abandonado sin registros, se va a eliminar.
alter table oc_granjas add column if not exists aviso_abandono timestamptz;

-- Intentos fallidos (búsquedas, claves), para frenar a quien prueba muchas veces.
create table if not exists oc_intentos (
  llave text not null,
  creado timestamptz not null default now()
);
create index if not exists oc_intentos_llave on oc_intentos (llave, creado);

-- Sesiones de supervisor: vencen solas si no se usan.
alter table oc_sesiones add column if not exists visto timestamptz not null default now();
-- Equipos nuevos: el supervisor los ve destacados hasta que los reconoce, y recibe una notificación.
alter table oc_dispositivos add column if not exists reconocido boolean not null default true;
alter table oc_dispositivos add column if not exists avisado boolean not null default true;
-- Para saber rápido a qué registro pertenece una foto.
create index if not exists oc_registros_fotos on oc_registros using gin ((datos -> 'fotos') jsonb_path_ops);

-- Marcas para avisar al supervisor una sola vez por cada problema.
alter table oc_registros add column if not exists critico boolean not null default false;
alter table oc_registros add column if not exists avisado boolean not null default false;
create index if not exists oc_registros_por_avisar on oc_registros (recibido) where critico and not avisado;

-- Nadie lee ni escribe las tablas directamente: todo pasa por las funciones de abajo.
alter table oc_ajustes enable row level security;
alter table oc_granjas enable row level security;
alter table oc_dispositivos enable row level security;
alter table oc_sesiones enable row level security;
alter table oc_registros enable row level security;
alter table oc_revisiones enable row level security;
alter table oc_recuperaciones enable row level security;
alter table oc_suscripciones enable row level security;
alter table oc_intentos enable row level security;
revoke all on oc_ajustes, oc_granjas, oc_dispositivos, oc_sesiones, oc_registros, oc_revisiones, oc_recuperaciones, oc_suscripciones, oc_intentos from anon, authenticated;

-- ---------------------------------------------------------------------
--  Funciones internas
-- ---------------------------------------------------------------------

create or replace function oc__ajuste(k text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select valor from oc_ajustes where clave = k;
$$;

create or replace function oc__hash(usuario_id text, clave text) returns text
language sql immutable as $$
  select encode(sha256(convert_to(usuario_id || ':' || clave, 'UTF8')), 'hex');
$$;

create or replace function oc__dispositivo(t text) returns oc_dispositivos
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos;
begin
  select * into d from oc_dispositivos where token = t and not revocado;
  if not found then
    raise exception 'OC_TOKEN';
  end if;
  return d;
end $$;

-- Devuelve el id del supervisor si la sesión es válida, se usó en los últimos 30 días y sigue siendo
-- supervisor activo; si no, null.
create or replace function oc__sesion(d oc_dispositivos, s text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare u text; v timestamptz;
begin
  if s is null or s !~ '^[0-9a-f-]{36}$' then
    return null;
  end if;
  select se.usuario_id, se.visto into u, v from oc_sesiones se
    where se.id = s::uuid and se.granja_id = d.granja_id and se.dispositivo_id = d.id;
  if u is null or v < now() - interval '30 days' then
    return null;
  end if;
  if not exists (
    select 1 from oc_granjas g, jsonb_array_elements(g.config -> 'usuarios') x
    where g.id = d.granja_id and x ->> 'id' = u and x ->> 'rol' = 'supervisor' and (x ->> 'activo')::boolean
  ) then
    return null;
  end if;
  if v < now() - interval '1 hour' then
    update oc_sesiones set visto = now() where id = s::uuid;
  end if;
  return u;
end $$;

create or replace function oc__supervisor(d oc_dispositivos, s text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare u text;
begin
  u := oc__sesion(d, s);
  if u is null then
    raise exception 'OC_SESION';
  end if;
  return u;
end $$;

-- La configuración que recibe un teléfono. Sin sesión de supervisor no viajan las claves de supervisores.
create or replace function oc__config_para(g oc_granjas, completo boolean) returns jsonb
language sql stable as $$
  select jsonb_set(
    case when completo then g.config else
      jsonb_set(g.config, '{usuarios}', coalesce((
        select jsonb_agg(case when u ->> 'rol' = 'supervisor' then (u - 'correo') || '{"pin_hash": ""}'::jsonb else u end)
        from jsonb_array_elements(g.config -> 'usuarios') u), '[]'::jsonb))
    end,
    '{granja,creado}',
    to_jsonb(((g.creado at time zone coalesce(oc__ajuste('zona_horaria'), 'America/Santiago'))::date)::text));
$$;

create or replace function oc__cambiar_usuario(config jsonb, usuario text, cambios jsonb) returns jsonb
language sql immutable as $$
  select jsonb_set(config, '{usuarios}', coalesce((
    select jsonb_agg(case when u ->> 'id' = usuario then u || cambios else u end)
    from jsonb_array_elements(config -> 'usuarios') u), '[]'::jsonb));
$$;

create or replace function oc__reg(r oc_registros) returns jsonb
language sql stable as $$
  select r.datos || jsonb_build_object(
    'capturado', r.capturado, 'recibido', r.recibido,
    'reloj_desfase_s', r.reloj_desfase_s, 'demora_s', r.demora_s, 'dispositivo_id', r.dispositivo_id);
$$;

create or replace function oc__codigo_nuevo() returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare letras text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text;
begin
  loop
    select string_agg(substr(letras, 1 + floor(random() * length(letras))::int, 1), '') into c from generate_series(1, 8);
    exit when not exists (select 1 from oc_granjas where codigo = c);
  end loop;
  return c;
end $$;

create or replace function oc__token_nuevo() returns text
language sql volatile as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

-- Nombre de plantel sin mayúsculas, tildes ni espacios, para compararlo tal como lo escriba el operario.
create or replace function oc__norma(t text) returns text
language sql immutable as $$
  select regexp_replace(translate(lower(coalesce(t, '')), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun'), '[^a-z0-9]', '', 'g');
$$;
update oc_granjas g set nombre_norm = oc__norma(g.nombre) || case when exists (
    select 1 from oc_granjas o where o.id <> g.id and oc__norma(o.nombre) = oc__norma(g.nombre) and o.creado <= g.creado)
  then left(g.id::text, 6) else '' end
  where g.nombre_norm is null;

-- Desde qué conexión llega el pedido (para contar intentos fallidos por separado).
create or replace function oc__origen() returns text
language sql stable as $$
  select coalesce(nullif(trim(split_part(
    coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'x-forwarded-for', ',', 1)), ''), 'sin-ip');
$$;

create or replace function oc__frenado(llave_buscada text, maximo integer, ventana interval default '10 minutes') returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*) >= maximo from oc_intentos where llave = llave_buscada and creado > now() - ventana;
$$;

create or replace function oc__anotar(llave_nueva text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from oc_intentos where creado < now() - interval '2 days';
  insert into oc_intentos (llave) values (llave_nueva);
end $$;

-- Claves que cualquiera adivinaría: muy comunes, un solo carácter repetido, una secuencia o el nombre del plantel.
create or replace function oc__clave_debil(clave text, nombre_plantel text) returns boolean
language sql immutable as $$
  select c in ('123456', '1234567', '12345678', '123456789', '1234567890', '654321', '112233', '121212', '123123', 'abc123',
               'abcdef', 'qwerty', 'qwertyuiop', 'asdfgh', 'password', 'contrasena', 'clave123', 'clave1234', 'claveplantel',
               'plantel', 'plantel123', 'granja', 'granja123', 'gallina', 'gallinas', 'huevos', 'huevo123', 'huevos123',
               'ovocheck', 'operario', 'operarios', 'supervisor', 'avicola', 'postura', 'galpon', 'galpon1', 'galpones')
      or (length(c) >= 3 and (c ~ '^(.)\1+$'
          or position(c in '01234567890123456789') > 0 or position(c in '98765432109876543210') > 0
          or position(c in 'abcdefghijklmnopqrstuvwxyz') > 0))
      or (length(oc__norma(nombre_plantel)) >= 3 and oc__norma(clave) = oc__norma(nombre_plantel))
  from (select regexp_replace(translate(lower(coalesce(clave, '')), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun'), '\s', '', 'g') as c) x;
$$;

create or replace function oc__fotos_usadas(g uuid) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from storage.objects where bucket_id = 'ovocheck' and name like g::text || '/%';
$$;

create or replace function oc__mb_fotos(g uuid) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select round(coalesce(sum((metadata ->> 'size')::bigint), 0) / 1048576.0, 1)
  from storage.objects where bucket_id = 'ovocheck' and name like g::text || '/%';
$$;

-- ---------------------------------------------------------------------
--  Espacio: el servidor se mide a sí mismo para no llenarse nunca
-- ---------------------------------------------------------------------
-- Si la base de datos gratuita se llena, Supabase la deja en "solo lectura" y nadie puede ni siquiera entrar.
-- Para que eso no pase, la app deja de aceptar cosas un poco antes, por etapas:
--   al 70 % no se crean planteles nuevos; al 100 % del tope (que ya es menor que el límite real) los registros
--   esperan en cada teléfono, sin perderse, hasta que haya espacio.
create table if not exists oc_espacio (
  id boolean primary key default true check (id),
  medido timestamptz not null default 'epoch',
  mb_datos numeric not null default 0,
  mb_fotos numeric not null default 0,
  nivel_avisado integer not null default 0,
  avisado timestamptz
);
insert into oc_espacio (id) values (true) on conflict (id) do nothing;
alter table oc_espacio enable row level security;
revoke all on oc_espacio from anon, authenticated;

-- Mide cuánto espacio hay ocupado. La medida se guarda diez minutos para no repetirla en cada envío.
create or replace function oc__medir(forzar boolean default false) returns oc_espacio
language plpgsql security definer set search_path = public, pg_temp as $$
declare m oc_espacio;
begin
  select * into m from oc_espacio where id;
  if forzar or m.medido < now() - interval '10 minutes' then
    -- Si varios teléfonos llegan a la vez, solo el primero mide; los demás usan esa medida.
    update oc_espacio set medido = now(),
        mb_datos = round(pg_database_size(current_database()) / 1048576.0, 1),
        mb_fotos = round(coalesce((select sum((o.metadata ->> 'size')::bigint) from storage.objects o where o.bucket_id = 'ovocheck'), 0) / 1048576.0, 1)
      where id and (forzar or medido < now() - interval '10 minutes');
    select * into m from oc_espacio where id;
  end if;
  return m;
end $$;

create or replace function oc__lleno() returns boolean
language sql security definer set search_path = public, pg_temp as $$
  select (oc__medir()).mb_datos >= coalesce(oc__ajuste('max_mb_datos')::numeric, 450);
$$;

-- Días sin ningún uso para considerar abandonado un plantel (nunca menos de 60).
create or replace function oc__dias_abandono() returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select greatest(coalesce(oc__ajuste('dias_abandono')::int, 180), 60);
$$;

-- Galpones en producción de los planteles que se están usando. Un plantel que ya tiene registros conserva su cupo
-- aunque pase meses sin abrir la app (por ejemplo, durante un vacío sanitario largo). Uno que nunca registró nada
-- solo cuenta mientras alguien lo abra (30 días).
create or replace function oc__galpones_en_uso() returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum((select count(*) from jsonb_array_elements(g.config -> 'galpones') x
                       where coalesce((x ->> 'activo')::boolean, true))), 0)::int
  from oc_granjas g
  where jsonb_typeof(g.config -> 'galpones') = 'array'
    and exists (select 1 from oc_dispositivos d where d.granja_id = g.id
                and d.visto > now() - make_interval(days => case
                  when exists (select 1 from oc_registros r where r.granja_id = g.id) then oc__dias_abandono() else 30 end));
$$;

-- ---------------------------------------------------------------------
--  Funciones que usa la app
-- ---------------------------------------------------------------------

-- Crear un plantel. Quien lo crea queda como supervisor y elige dos claves: la suya y la que usarán sus operarios.
create or replace function oc_crear_granja(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  g oc_granjas; d oc_dispositivos; s uuid; cfg jsonb; sup jsonb; cod text; n text;
  clave_op text := trim(coalesce(p ->> 'clave_operarios', ''));
  origen text := oc__origen(); m oc_espacio; nuevos integer;
begin
  cfg := p -> 'config';
  if origen <> 'sin-ip' and oc__frenado('crear:' || origen, 20, interval '1 day') then
    return jsonb_build_object('error', 'OC_BLOQUEO');
  end if;
  -- Cupos: un plantel nuevo solo entra si hay espacio de sobra para los que ya están trabajando.
  if (select count(*) from oc_granjas) >= coalesce(oc__ajuste('max_granjas')::int, 100) then
    return jsonb_build_object('error', 'OC_CUPO_GRANJAS');
  end if;
  m := oc__medir();
  if m.mb_datos >= 0.7 * coalesce(oc__ajuste('max_mb_datos')::numeric, 450)
     or m.mb_fotos >= 0.7 * coalesce(oc__ajuste('max_mb_total')::numeric, 900) then
    return jsonb_build_object('error', 'OC_CUPO_GRANJAS');
  end if;
  nuevos := case when jsonb_typeof(cfg -> 'galpones') = 'array' then jsonb_array_length(cfg -> 'galpones') else 0 end;
  if oc__galpones_en_uso() + nuevos > coalesce(oc__ajuste('max_galpones')::int, 60) then
    return jsonb_build_object('error', 'OC_CUPO_GRANJAS');
  end if;
  -- Si la app se hace conocida de golpe, los planteles nuevos entran de a pocos por día.
  if (select count(*) from oc_granjas where creado > now() - interval '1 day') >= coalesce(oc__ajuste('max_granjas_dia')::int, 8) then
    return jsonb_build_object('error', 'OC_CUPO_HOY');
  end if;
  n := oc__norma(cfg -> 'granja' ->> 'nombre');
  select u into sup from jsonb_array_elements(cfg -> 'usuarios') u
    where u ->> 'rol' = 'supervisor' and length(u ->> 'pin_hash') = 64 limit 1;
  if sup is null or length(n) < 3 or length(cfg::text) > 300000
     or length(clave_op) < 6 or length(clave_op) > 40
     or coalesce(sup ->> 'correo', '') !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'OC_DATOS';
  end if;
  if exists (select 1 from oc_granjas where nombre_norm = n) then
    return jsonb_build_object('error', 'OC_NOMBRE_USADO');
  end if;
  if oc__clave_debil(clave_op, cfg -> 'granja' ->> 'nombre') then
    return jsonb_build_object('error', 'OC_CLAVE_FACIL');
  end if;
  cod := oc__codigo_nuevo();
  insert into oc_granjas (nombre, nombre_norm, clave_operarios, codigo, config)
    values (cfg -> 'granja' ->> 'nombre', n, clave_op, cod, cfg) returning * into g;
  cfg := jsonb_set(cfg, '{granja}', (cfg -> 'granja') || jsonb_build_object('id', g.id, 'codigo', cod));
  update oc_granjas set config = cfg where id = g.id returning * into g;
  insert into oc_dispositivos (granja_id, token, nombre, visto, usuario_id)
    values (g.id, oc__token_nuevo(), left(coalesce(p ->> 'dispositivo', ''), 60), now(), sup ->> 'id') returning * into d;
  insert into oc_sesiones (granja_id, dispositivo_id, usuario_id) values (g.id, d.id, sup ->> 'id') returning id into s;
  perform oc__anotar('crear:' || origen);
  return jsonb_build_object('token', d.token, 'dispositivo_id', d.id, 'sesion', s, 'version', g.version,
    'config', oc__config_para(g, true), 'clave_operarios', g.clave_operarios);
end $$;

-- El operario busca su plantel escribiendo el nombre exacto. No existe ninguna lista de planteles
-- y la respuesta no entrega nada más que el nombre tal como lo escribió el supervisor.
create or replace function oc_buscar_granja(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare g oc_granjas; n text := oc__norma(p ->> 'nombre'); origen text := oc__origen(); llave text;
begin
  llave := 'buscar:' || origen;
  -- Dos frenos: por conexión y, por si alguien disfraza la suya, uno general.
  if oc__frenado(llave, case when origen = 'sin-ip' then 600 else 30 end) or oc__frenado('buscar', 600) then
    return jsonb_build_object('error', 'OC_BLOQUEO');
  end if;
  select * into g from oc_granjas where nombre_norm = n and length(n) >= 3;
  if not found then
    perform oc__anotar(llave);
    perform oc__anotar('buscar');
    perform pg_sleep(0.2);
    return jsonb_build_object('error', 'OC_SIN_GRANJA');
  end if;
  return jsonb_build_object('nombre', g.nombre);
end $$;

-- Sumar un teléfono al plantel con la clave que creó el supervisor para sus operarios.
-- Cada equipo nuevo queda destacado para el supervisor hasta que lo reconoce.
create or replace function oc_unirse(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare g oc_granjas; d oc_dispositivos; n text := oc__norma(p ->> 'granja'); origen text := oc__origen(); llave text; general text;
begin
  if length(n) < 3 then
    raise exception 'OC_DATOS';
  end if;
  llave := 'unirse:' || n || ':' || origen;
  general := 'unirse:' || n;
  if oc__frenado(llave, case when origen = 'sin-ip' then 40 else 12 end)
     or oc__frenado(general, 40) or oc__frenado(general, 120, interval '1 day') then
    return jsonb_build_object('error', 'OC_BLOQUEO');
  end if;
  select * into g from oc_granjas where nombre_norm = n;
  if not found or coalesce(g.clave_operarios, '') = ''
     or lower(trim(coalesce(p ->> 'clave', ''))) <> lower(trim(g.clave_operarios)) then
    perform oc__anotar(llave);
    perform oc__anotar(general);
    perform pg_sleep(0.4);
    return jsonb_build_object('error', 'OC_CLAVE_GRANJA');
  end if;
  -- Aunque alguien tenga la clave, no puede sumar equipos sin límite.
  if oc__frenado('alta:' || g.id, 40, interval '1 hour')
     or (select count(*) from oc_dispositivos x where x.granja_id = g.id) >= 2000 then
    return jsonb_build_object('error', 'OC_BLOQUEO');
  end if;
  perform oc__anotar('alta:' || g.id);
  insert into oc_dispositivos (granja_id, token, nombre, visto, reconocido, avisado)
    values (g.id, oc__token_nuevo(), left(coalesce(p ->> 'dispositivo', ''), 60), now(), false, false) returning * into d;
  return jsonb_build_object('token', d.token, 'dispositivo_id', d.id, 'version', g.version, 'config', oc__config_para(g, false));
end $$;

-- Entrada del supervisor con su correo y su clave, desde un equipo que aún no está en el plantel.
-- Si el mismo correo y clave sirven en más de un plantel, devuelve la lista para que elija.
create or replace function oc_entrar_supervisor(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  correo_b text := lower(trim(coalesce(p ->> 'correo', ''))); clave text := coalesce(p ->> 'clave', '');
  llave text; opciones jsonb; elegido jsonb; g oc_granjas; d oc_dispositivos; s uuid; u jsonb;
begin
  llave := 'entrar:' || correo_b;
  if oc__frenado(llave, 8) then
    return jsonb_build_object('error', 'OC_BLOQUEO');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre, 'usuario', x.usuario) order by x.creado), '[]'::jsonb)
    into opciones
    from (select gr.id, gr.nombre, gr.creado, us ->> 'id' as usuario
          from oc_granjas gr, jsonb_array_elements(gr.config -> 'usuarios') us
          where correo_b <> '' and us ->> 'rol' = 'supervisor' and (us ->> 'activo')::boolean
            and lower(us ->> 'correo') = correo_b and length(coalesce(us ->> 'pin_hash', '')) = 64
            and us ->> 'pin_hash' = oc__hash(us ->> 'id', clave)) x;
  if jsonb_array_length(opciones) = 0 then
    perform oc__anotar(llave);
    perform pg_sleep(0.5);
    return jsonb_build_object('error', 'OC_CORREO_CLAVE');
  end if;
  select o into elegido from jsonb_array_elements(opciones) o
    where jsonb_array_length(opciones) = 1 or o ->> 'id' = p ->> 'granja_id' limit 1;
  if elegido is null then
    return jsonb_build_object('elegir', (select jsonb_agg(o - 'usuario') from jsonb_array_elements(opciones) o));
  end if;
  select * into g from oc_granjas where id = (elegido ->> 'id')::uuid;
  select x into u from jsonb_array_elements(g.config -> 'usuarios') x where x ->> 'id' = elegido ->> 'usuario';
  insert into oc_dispositivos (granja_id, token, nombre, visto, usuario_id, reconocido, avisado)
    values (g.id, oc__token_nuevo(), left(coalesce(p ->> 'dispositivo', ''), 60), now(), u ->> 'id', false, false) returning * into d;
  insert into oc_sesiones (granja_id, dispositivo_id, usuario_id) values (g.id, d.id, u ->> 'id') returning id into s;
  return jsonb_build_object('token', d.token, 'dispositivo_id', d.id, 'sesion', s, 'usuario_id', u ->> 'id',
    'version', g.version, 'config', oc__config_para(g, true), 'clave_operarios', g.clave_operarios,
    'temporal', coalesce((u ->> 'temporal')::boolean, false));
end $$;

-- Entrada del supervisor: la clave se verifica aquí, no en el teléfono.
create or replace function oc_login(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos; g oc_granjas; u jsonb; s uuid;
begin
  d := oc__dispositivo(p ->> 'token');
  if d.fallos >= 8 and d.fallo_ultimo > now() - interval '10 minutes' then
    return jsonb_build_object('error', 'OC_BLOQUEO');
  end if;
  select * into g from oc_granjas where id = d.granja_id;
  -- Quien tenga la clave del plantel podría sumar muchos equipos para probar claves: el freno también cuenta por persona.
  if oc__frenado('login:' || g.id || ':' || coalesce(p ->> 'usuario_id', ''), 20) then
    return jsonb_build_object('error', 'OC_BLOQUEO');
  end if;
  select x into u from jsonb_array_elements(g.config -> 'usuarios') x
    where x ->> 'id' = p ->> 'usuario_id' and (x ->> 'activo')::boolean and x ->> 'rol' = 'supervisor';
  if u is null or length(coalesce(u ->> 'pin_hash', '')) <> 64
     or u ->> 'pin_hash' <> oc__hash(u ->> 'id', coalesce(p ->> 'clave', '')) then
    perform oc__anotar('login:' || g.id || ':' || coalesce(p ->> 'usuario_id', ''));
    update oc_dispositivos set
      fallos = case when fallo_ultimo > now() - interval '10 minutes' then fallos + 1 else 1 end,
      fallo_ultimo = now() where id = d.id;
    return jsonb_build_object('error', 'OC_CLAVE');
  end if;
  update oc_dispositivos set fallos = 0 where id = d.id;
  delete from oc_sesiones where visto < now() - interval '30 days';
  insert into oc_sesiones (granja_id, dispositivo_id, usuario_id) values (g.id, d.id, u ->> 'id') returning id into s;
  return jsonb_build_object('sesion', s, 'version', g.version, 'config', oc__config_para(g, true),
    'temporal', coalesce((u ->> 'temporal')::boolean, false));
end $$;

-- Un operario nuevo se suma desde el mismo teléfono del plantel, con la clave de un supervisor que lo autoriza.
-- Sirve para el teléfono de la empresa que pasa de una persona a otra: no hay que desvincular nada.
-- Si esa persona ya existía con licencia o de baja, vuelve a quedar activa y crea un PIN nuevo.
create or replace function oc_autorizar_operario(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d oc_dispositivos; g oc_granjas; u jsonb; ya jsonb; id_nuevo text; llave text;
  n text := regexp_replace(trim(coalesce(p ->> 'nombre', '')), '\s+', ' ', 'g');
begin
  d := oc__dispositivo(p ->> 'token');
  if d.fallos >= 8 and d.fallo_ultimo > now() - interval '10 minutes' then
    return jsonb_build_object('error', 'OC_BLOQUEO');
  end if;
  select * into g from oc_granjas where id = d.granja_id for update;
  llave := 'login:' || g.id || ':' || coalesce(p ->> 'supervisor_id', '');
  if oc__frenado(llave, 20) then
    return jsonb_build_object('error', 'OC_BLOQUEO');
  end if;
  select x into u from jsonb_array_elements(g.config -> 'usuarios') x
    where x ->> 'id' = p ->> 'supervisor_id' and (x ->> 'activo')::boolean and x ->> 'rol' = 'supervisor';
  if u is null or length(coalesce(u ->> 'pin_hash', '')) <> 64
     or u ->> 'pin_hash' <> oc__hash(u ->> 'id', coalesce(p ->> 'clave', '')) then
    perform oc__anotar(llave);
    update oc_dispositivos set
      fallos = case when fallo_ultimo > now() - interval '10 minutes' then fallos + 1 else 1 end,
      fallo_ultimo = now() where id = d.id;
    return jsonb_build_object('error', 'OC_CLAVE');
  end if;
  update oc_dispositivos set fallos = 0 where id = d.id;
  if length(n) < 3 or length(n) > 50 then
    raise exception 'OC_DATOS';
  end if;
  select x into ya from jsonb_array_elements(g.config -> 'usuarios') x where lower(x ->> 'nombre') = lower(n) limit 1;
  if ya is not null then
    if ya ->> 'rol' <> 'operario' or (ya ->> 'activo')::boolean then
      return jsonb_build_object('error', 'OC_PERSONA_EXISTE');
    end if;
    id_nuevo := ya ->> 'id';
    update oc_granjas set config = oc__cambiar_usuario(config, id_nuevo,
        jsonb_build_object('activo', true, 'estado', 'activo', 'pin_hash', '')), version = version + 1
      where id = g.id returning * into g;
  else
    if jsonb_array_length(g.config -> 'usuarios') >= 300 then
      raise exception 'OC_DATOS';
    end if;
    id_nuevo := gen_random_uuid()::text;
    update oc_granjas set config = jsonb_set(config, '{usuarios}', (config -> 'usuarios') || jsonb_build_object(
        'id', id_nuevo, 'nombre', n, 'rol', 'operario', 'pin_hash', '', 'activo', true, 'estado', 'activo')), version = version + 1
      where id = g.id returning * into g;
  end if;
  return jsonb_build_object('usuario_id', id_nuevo, 'version', g.version, 'config', oc__config_para(g, false),
    'autorizo', u ->> 'nombre');
end $$;

-- Al cerrar sesión, la sesión de supervisor deja de existir también en el servidor.
create or replace function oc_salir(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos;
begin
  d := oc__dispositivo(p ->> 'token');
  if coalesce(p ->> 'sesion', '') ~ '^[0-9a-f-]{36}$' then
    delete from oc_sesiones where id = (p ->> 'sesion')::uuid and dispositivo_id = d.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- El operario crea su propio PIN la primera vez (o después de que el supervisor lo reinicie).
create or replace function oc_crear_pin(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos; g oc_granjas; u jsonb;
begin
  d := oc__dispositivo(p ->> 'token');
  select * into g from oc_granjas where id = d.granja_id for update;
  select x into u from jsonb_array_elements(g.config -> 'usuarios') x where x ->> 'id' = p ->> 'usuario_id';
  if u is null or u ->> 'rol' <> 'operario' or length(coalesce(p ->> 'pin_hash', '')) <> 64 then
    raise exception 'OC_DATOS';
  end if;
  if coalesce(u ->> 'pin_hash', '') = '' then
    update oc_granjas set config = oc__cambiar_usuario(config, u ->> 'id', jsonb_build_object('pin_hash', p ->> 'pin_hash')),
      version = version + 1 where id = g.id returning * into g;
    return jsonb_build_object('version', g.version, 'config', oc__config_para(g, false));
  end if;
  -- Ya tenía PIN (se creó antes en otro teléfono): se conserva el primero.
  return jsonb_build_object('error', 'OC_PIN_EXISTE', 'version', g.version, 'config', oc__config_para(g, false));
end $$;

-- El supervisor cambia su propia clave.
create or replace function oc_cambiar_clave(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos; g oc_granjas; u text;
begin
  d := oc__dispositivo(p ->> 'token');
  u := oc__supervisor(d, p ->> 'sesion');
  if length(coalesce(p ->> 'pin_hash', '')) <> 64 then
    raise exception 'OC_DATOS';
  end if;
  update oc_granjas set
    config = oc__cambiar_usuario(config, u, jsonb_build_object('pin_hash', p ->> 'pin_hash', 'temporal', false)),
    version = version + 1 where id = d.granja_id returning * into g;
  -- Las sesiones abiertas en otros teléfonos con la clave anterior dejan de servir.
  delete from oc_sesiones where granja_id = g.id and usuario_id = u and id <> (p ->> 'sesion')::uuid;
  return jsonb_build_object('version', g.version, 'config', oc__config_para(g, true));
end $$;

-- "Olvidé mi clave", paso 1: genera un código de 6 dígitos para enviarlo al correo del supervisor.
-- Solo la puede llamar el servidor de correos (clave de servicio): el código nunca vuelve al teléfono.
create or replace function oc_recuperacion_pedir(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d oc_dispositivos; g oc_granjas; u jsonb; cod text; f record; n integer := 0; nombre_p text; granjas_p text;
  correo_b text := lower(trim(coalesce(p ->> 'correo', '')));
begin
  cod := lpad((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 7))::bit(28)::int % 1000000)::text, 6, '0');
  -- Desde un equipo que aún no está en el plantel: se pide solo con el correo.
  if coalesce(p ->> 'token', '') = '' then
    delete from oc_recuperaciones where creado < now() - interval '2 days';
    if oc__frenado('pedir:' || correo_b, 4, interval '1 hour') then
      return jsonb_build_object('error', 'OC_BLOQUEO');
    end if;
    for f in select gr.id as gid, gr.nombre as granja, us ->> 'id' as uid, us ->> 'nombre' as nombre
             from oc_granjas gr, jsonb_array_elements(gr.config -> 'usuarios') us
             where correo_b <> '' and us ->> 'rol' = 'supervisor' and (us ->> 'activo')::boolean and lower(us ->> 'correo') = correo_b
             order by gr.creado loop
      update oc_recuperaciones set usado = true where granja_id = f.gid and usuario_id = f.uid and not usado;
      insert into oc_recuperaciones (granja_id, usuario_id, codigo_hash) values (f.gid, f.uid, oc__hash(f.uid, cod));
      n := n + 1;
      nombre_p := coalesce(nombre_p, f.nombre);
      granjas_p := coalesce(granjas_p || ', ', '') || f.granja;
    end loop;
    if n = 0 then
      perform pg_sleep(1);
      return jsonb_build_object('error', 'OC_SIN_CUENTA');
    end if;
    perform oc__anotar('pedir:' || correo_b);
    return jsonb_build_object('correo', correo_b, 'nombre', nombre_p, 'granja', granjas_p, 'codigo', cod, 'minutos', 20);
  end if;
  d := oc__dispositivo(p ->> 'token');
  select * into g from oc_granjas where id = d.granja_id;
  select x into u from jsonb_array_elements(g.config -> 'usuarios') x
    where x ->> 'id' = p ->> 'usuario_id' and (x ->> 'activo')::boolean and x ->> 'rol' = 'supervisor';
  if u is null then
    return jsonb_build_object('error', 'OC_DATOS');
  end if;
  if coalesce(u ->> 'correo', '') = '' then
    return jsonb_build_object('error', 'OC_SIN_CORREO');
  end if;
  delete from oc_recuperaciones where creado < now() - interval '2 days';
  if (select count(*) from oc_recuperaciones r where r.granja_id = g.id and r.usuario_id = u ->> 'id'
        and r.creado > now() - interval '1 hour') >= 4 then
    return jsonb_build_object('error', 'OC_BLOQUEO');
  end if;
  update oc_recuperaciones set usado = true where granja_id = g.id and usuario_id = u ->> 'id' and not usado;
  insert into oc_recuperaciones (granja_id, usuario_id, codigo_hash) values (g.id, u ->> 'id', oc__hash(u ->> 'id', cod));
  return jsonb_build_object('correo', u ->> 'correo', 'nombre', u ->> 'nombre', 'granja', g.nombre, 'codigo', cod, 'minutos', 20);
end $$;

-- "Olvidé mi clave", paso 2: con el código recibido por correo se elige una clave nueva.
create or replace function oc_recuperar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos; g oc_granjas; u jsonb; r oc_recuperaciones; s uuid;
begin
  d := oc__dispositivo(p ->> 'token');
  if length(coalesce(p ->> 'pin_hash', '')) <> 64 then
    raise exception 'OC_DATOS';
  end if;
  select * into g from oc_granjas where id = d.granja_id for update;
  select x into u from jsonb_array_elements(g.config -> 'usuarios') x
    where x ->> 'id' = p ->> 'usuario_id' and (x ->> 'activo')::boolean and x ->> 'rol' = 'supervisor';
  if u is null then
    raise exception 'OC_DATOS';
  end if;
  select * into r from oc_recuperaciones x
    where x.granja_id = g.id and x.usuario_id = u ->> 'id' and not x.usado and x.creado > now() - interval '20 minutes'
    order by x.creado desc limit 1;
  if not found or r.intentos >= 5 then
    return jsonb_build_object('error', 'OC_RECUPERACION_VENCIDA');
  end if;
  if r.codigo_hash <> oc__hash(u ->> 'id', regexp_replace(coalesce(p ->> 'codigo', ''), '[^0-9]', '', 'g')) then
    update oc_recuperaciones set intentos = intentos + 1 where id = r.id;
    return jsonb_build_object('error', 'OC_RECUPERACION');
  end if;
  update oc_recuperaciones set usado = true where id = r.id;
  update oc_granjas set
    config = oc__cambiar_usuario(config, u ->> 'id', jsonb_build_object('pin_hash', p ->> 'pin_hash', 'temporal', false)),
    version = version + 1 where id = g.id returning * into g;
  delete from oc_sesiones where granja_id = g.id and usuario_id = u ->> 'id';
  insert into oc_sesiones (granja_id, dispositivo_id, usuario_id) values (g.id, d.id, u ->> 'id') returning id into s;
  return jsonb_build_object('sesion', s, 'version', g.version, 'config', oc__config_para(g, true));
end $$;

-- "Olvidé mi clave" desde un equipo que aún no está en el plantel: correo, código recibido y clave nueva.
create or replace function oc_recuperar_correo(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  correo_b text := lower(trim(coalesce(p ->> 'correo', ''))); clave text := coalesce(p ->> 'clave', '');
  cod text := regexp_replace(coalesce(p ->> 'codigo', ''), '[^0-9]', '', 'g');
  llave text; f record; r oc_recuperaciones; n integer := 0;
begin
  if length(clave) < 6 or length(clave) > 200 then
    raise exception 'OC_DATOS';
  end if;
  llave := 'recuperar:' || correo_b;
  if oc__frenado(llave, 8) then
    return jsonb_build_object('error', 'OC_BLOQUEO');
  end if;
  for f in select gr.id as gid, us ->> 'id' as uid
           from oc_granjas gr, jsonb_array_elements(gr.config -> 'usuarios') us
           where correo_b <> '' and us ->> 'rol' = 'supervisor' and (us ->> 'activo')::boolean and lower(us ->> 'correo') = correo_b loop
    select * into r from oc_recuperaciones x
      where x.granja_id = f.gid and x.usuario_id = f.uid and not x.usado and x.creado > now() - interval '20 minutes'
      order by x.creado desc limit 1;
    if found and r.intentos < 5 and r.codigo_hash = oc__hash(f.uid, cod) then
      update oc_recuperaciones set usado = true where id = r.id;
      update oc_granjas set
        config = oc__cambiar_usuario(config, f.uid, jsonb_build_object('pin_hash', oc__hash(f.uid, clave), 'temporal', false)),
        version = version + 1 where id = f.gid;
      delete from oc_sesiones where granja_id = f.gid and usuario_id = f.uid;
      n := n + 1;
    elsif found then
      update oc_recuperaciones set intentos = intentos + 1 where id = r.id;
    end if;
  end loop;
  if n = 0 then
    perform oc__anotar(llave);
    return jsonb_build_object('error', 'OC_RECUPERACION');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- El supervisor guarda galpones, tareas y personas.
create or replace function oc_guardar_config(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos; g oc_granjas; u text; cfg jsonb; usuarios jsonb; n text;
begin
  d := oc__dispositivo(p ->> 'token');
  u := oc__supervisor(d, p ->> 'sesion');
  select * into g from oc_granjas where id = d.granja_id for update;
  if (p ->> 'version')::int <> g.version then
    return jsonb_build_object('error', 'OC_CONFLICTO', 'version', g.version, 'config', oc__config_para(g, true));
  end if;
  cfg := p -> 'config';
  if cfg is null or length(cfg::text) > 300000 or jsonb_typeof(cfg -> 'usuarios') <> 'array'
     or jsonb_typeof(cfg -> 'galpones') <> 'array' or jsonb_typeof(cfg -> 'tareas') <> 'array' then
    raise exception 'OC_DATOS';
  end if;
  n := oc__norma(cfg -> 'granja' ->> 'nombre');
  if length(n) < 3 then
    raise exception 'OC_DATOS';
  end if;
  if exists (select 1 from oc_granjas o where o.nombre_norm = n and o.id <> g.id) then
    return jsonb_build_object('error', 'OC_NOMBRE_USADO');
  end if;
  -- Cada supervisor entra con su correo: dentro del plantel no puede repetirse.
  if exists (select 1 from jsonb_array_elements(cfg -> 'usuarios') x
             where x ->> 'rol' = 'supervisor' and coalesce(x ->> 'correo', '') <> ''
             group by lower(x ->> 'correo') having count(*) > 1) then
    return jsonb_build_object('error', 'OC_CORREO_REPETIDO');
  end if;
  -- Un supervisor que llega sin clave conserva la que ya tenía.
  select jsonb_agg(case
      when x ->> 'rol' = 'supervisor' and coalesce(x ->> 'pin_hash', '') = '' then
        x || jsonb_build_object('pin_hash', coalesce((
          select o ->> 'pin_hash' from jsonb_array_elements(g.config -> 'usuarios') o
          where o ->> 'id' = x ->> 'id' and o ->> 'rol' = 'supervisor'), ''))
      else x end)
    into usuarios from jsonb_array_elements(cfg -> 'usuarios') x;
  cfg := jsonb_set(cfg, '{usuarios}', coalesce(usuarios, '[]'::jsonb));
  if not exists (select 1 from jsonb_array_elements(cfg -> 'usuarios') x
      where x ->> 'rol' = 'supervisor' and (x ->> 'activo')::boolean and length(x ->> 'pin_hash') = 64) then
    raise exception 'OC_SIN_SUPERVISOR';
  end if;
  cfg := jsonb_set(cfg, '{granja}', (cfg -> 'granja') || jsonb_build_object('id', g.id, 'codigo', g.codigo));
  update oc_granjas set config = cfg, nombre = coalesce(cfg -> 'granja' ->> 'nombre', nombre), nombre_norm = n, version = version + 1
    where id = g.id returning * into g;
  return jsonb_build_object('version', g.version, 'config', oc__config_para(g, true));
end $$;

-- Recibir registros. El servidor no confía en lo que diga el teléfono:
--   * la hora la pone él: hora de llegada menos el tiempo que el registro esperó en el teléfono;
--   * el día del registro tiene que calzar con esa hora (no se puede anotar hoy algo "de la semana pasada");
--   * el nombre de quien firma se toma de la ficha del plantel, no del teléfono;
--   * lo que firma un supervisor exige su sesión abierta con clave en ese mismo equipo;
--   * un operario solo corrige registros del día, y nunca anula.
create or replace function oc_registrar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d oc_dispositivos; g oc_granjas; it jsonb; r jsonb; ms numeric; desfase integer; res jsonb := '[]'::jsonb; fila oc_registros;
  u jsonb; sup text; rechazados jsonb := '[]'::jsonb; cap timestamptz; dia date; orig oc_registros;
  zona text := coalesce(oc__ajuste('zona_horaria'), 'America/Santiago');
begin
  d := oc__dispositivo(p ->> 'token');
  if jsonb_array_length(p -> 'items') > 200 then
    raise exception 'OC_DATOS';
  end if;
  -- Sin espacio no se recibe nada: el teléfono conserva sus registros y los reenvía solo más tarde.
  if oc__lleno() then
    return jsonb_build_object('error', 'OC_LLENO');
  end if;
  if (select count(*) from oc_registros x where x.granja_id = d.granja_id and x.recibido > now() - interval '1 day')
     >= coalesce(oc__ajuste('max_registros_dia')::int, 2500) then
    return jsonb_build_object('error', 'OC_TOPE_DIA');
  end if;
  select * into g from oc_granjas where id = d.granja_id;
  sup := oc__sesion(d, p ->> 'sesion');
  desfase := coalesce(round(extract(epoch from (now() - (p ->> 'ahora')::timestamptz)))::int, 0);
  for it in select * from jsonb_array_elements(p -> 'items') loop
    r := (it -> 'registro') - 'capturado' - 'recibido' - 'reloj_desfase_s' - 'demora_s' - 'dispositivo_id';
    if length(r::text) > 6000 or coalesce(r ->> 'id', '') !~ '^[0-9a-f-]{36}$' or coalesce(r ->> 'fecha', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      continue;
    end if;
    select * into fila from oc_registros where id = (r ->> 'id')::uuid;
    if found then
      -- Reenvío de algo que ya llegó: no se toca. (Si ese id es de otro plantel, se ignora.)
      if fila.granja_id = d.granja_id then
        res := res || jsonb_build_object('id', fila.id, 'capturado', fila.capturado, 'recibido', fila.recibido,
          'reloj_desfase_s', fila.reloj_desfase_s, 'demora_s', fila.demora_s);
      end if;
      continue;
    end if;
    ms := least(greatest(coalesce((it ->> 'transcurrido_ms')::numeric, 0), 0), 86400000::numeric * 60);
    cap := now() - (ms || ' milliseconds')::interval;
    dia := (cap at time zone zona)::date;
    select x into u from jsonb_array_elements(g.config -> 'usuarios') x where x ->> 'id' = r ->> 'usuario_id';
    if u is not null and u ->> 'rol' = 'supervisor' and (sup is null or sup <> u ->> 'id') then
      rechazados := rechazados || jsonb_build_object('id', r ->> 'id', 'motivo', 'sesion');
      continue;
    end if;
    if u is null or u ->> 'rol' <> 'supervisor' then
      if coalesce((r ->> 'anulado')::boolean, false) then
        rechazados := rechazados || jsonb_build_object('id', r ->> 'id', 'motivo', 'permiso');
        continue;
      end if;
      if coalesce(r ->> 'corrige', '') <> '' then
        select * into orig from oc_registros
          where id::text = r ->> 'corrige' and granja_id = d.granja_id;
        if not found or abs(orig.fecha - dia) > 1 then
          rechazados := rechazados || jsonb_build_object('id', r ->> 'id', 'motivo', 'permiso');
          continue;
        end if;
      elsif abs((r ->> 'fecha')::date - dia) > 1 then
        r := r || jsonb_build_object('fecha', dia::text);
      end if;
    end if;
    r := r || jsonb_build_object('usuario_nombre', case
      when u is not null then u ->> 'nombre'
      else left(coalesce(r ->> 'usuario_nombre', 'Sin nombre'), 50) || ' (ya no está en el plantel)' end);
    insert into oc_registros (id, granja_id, dispositivo_id, fecha, galpon_id, datos, capturado, reloj_desfase_s, demora_s, critico)
      values ((r ->> 'id')::uuid, d.granja_id, d.id, (r ->> 'fecha')::date, r ->> 'galpon_id', r,
              cap, desfase, round(ms / 1000)::int,
              coalesce(jsonb_typeof(r -> 'flags') = 'array' and (r -> 'flags') ?| array['problema', 'retrocede', 'no_calza', 'ilogico'], false)
                and not coalesce((r ->> 'anulado')::boolean, false))
      on conflict (id) do nothing;
    select * into fila from oc_registros where id = (r ->> 'id')::uuid and granja_id = d.granja_id;
    if found then
      res := res || jsonb_build_object('id', fila.id, 'capturado', fila.capturado, 'recibido', fila.recibido,
        'reloj_desfase_s', fila.reloj_desfase_s, 'demora_s', fila.demora_s);
    end if;
  end loop;
  update oc_dispositivos set visto = now() where id = d.id;
  return jsonb_build_object('ahora', now(), 'resultados', res, 'rechazados', rechazados);
end $$;

-- Sincronizar: entrega lo nuevo desde la última vez y anota que el teléfono sigue vivo.
create or replace function oc_sync(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d oc_dispositivos; g oc_granjas; sup text; desde date; cur timestamptz; regs jsonb; revs jsonb; res jsonb;
begin
  d := oc__dispositivo(p ->> 'token');
  update oc_dispositivos set visto = now(), pendientes = coalesce((p ->> 'pendientes')::int, 0),
    usuario_id = coalesce(nullif(p ->> 'usuario_id', ''), usuario_id) where id = d.id;
  select * into g from oc_granjas where id = d.granja_id;
  sup := oc__sesion(d, p ->> 'sesion');
  desde := greatest(coalesce((p ->> 'desde')::date, current_date - 10), current_date - 400);
  cur := (p ->> 'cursor')::timestamptz;
  select coalesce(jsonb_agg(oc__reg(r) order by r.capturado), '[]'::jsonb) into regs
    from oc_registros r where r.granja_id = g.id and r.fecha >= desde and (cur is null or r.recibido > cur);
  select coalesce(jsonb_agg(to_jsonb(v) - 'granja_id' order by v.creado), '[]'::jsonb) into revs
    from oc_revisiones v where v.granja_id = g.id and (cur is null or v.creado > cur)
      and (cur is not null or v.creado > now() - interval '120 days');
  res := jsonb_build_object('ahora', now(), 'cursor', now() - interval '20 seconds', 'version', g.version,
    'registros', regs, 'revisiones', revs, 'sesion_ok', sup is not null, 'lleno', oc__lleno());
  if (p ->> 'version') is null or (p ->> 'version')::int <> g.version then
    res := res || jsonb_build_object('config', oc__config_para(g, sup is not null));
  end if;
  if sup is not null then
    res := res || jsonb_build_object(
      'dispositivos', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre, 'visto', x.visto,
          'pendientes', x.pendientes, 'usuario_id', x.usuario_id, 'creado', x.creado, 'reconocido', x.reconocido,
          'revocado', x.revocado)
          order by x.visto desc nulls last), '[]'::jsonb)
        from oc_dispositivos x where x.granja_id = g.id and (not x.revocado or x.visto > now() - interval '90 days')),
      'intentos_fallidos', (select count(*)::int from oc_intentos i
        where i.llave = 'unirse:' || g.nombre_norm and i.creado > now() - interval '1 day'),
      'clave_operarios', g.clave_operarios,
      'fotos', jsonb_build_object('usadas', oc__fotos_usadas(g.id),
        'max', oc__ajuste('max_fotos_granja')::int, 'dias', oc__ajuste('dias_fotos')::int,
        'lleno', (oc__medir()).mb_fotos >= coalesce(oc__ajuste('max_mb_total')::numeric, 900)
                 or oc__mb_fotos(g.id) >= coalesce(oc__ajuste('max_mb_fotos_granja')::numeric, 300)));
  end if;
  return res;
end $$;

-- Historial de un período (solo supervisor).
create or replace function oc_registros(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos; regs jsonb; n integer; ult_cap timestamptz; ult_id uuid; tope constant integer := 5000;
begin
  d := oc__dispositivo(p ->> 'token');
  perform oc__supervisor(d, p ->> 'sesion');
  select coalesce(jsonb_agg(t.j order by t.cap, t.id), '[]'::jsonb), count(*)::int,
         (array_agg(t.cap order by t.cap desc, t.id desc))[1], (array_agg(t.id order by t.cap desc, t.id desc))[1]
    into regs, n, ult_cap, ult_id
    from (select oc__reg(x) as j, x.capturado as cap, x.id from oc_registros x
          where x.granja_id = d.granja_id
            and x.fecha between (p ->> 'desde')::date and (p ->> 'hasta')::date
            and (coalesce(p ->> 'despues', '') = ''
                 or (x.capturado, x.id) > ((p ->> 'despues')::timestamptz, (p ->> 'despues_id')::uuid))
          order by x.capturado, x.id limit tope) t;
  return jsonb_build_object('registros', regs, 'mas', n >= tope, 'despues', ult_cap, 'despues_id', ult_id);
end $$;

-- El supervisor marca una alerta como revisada (queda anotado quién y cuándo).
create or replace function oc_revisar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos; u text;
begin
  d := oc__dispositivo(p ->> 'token');
  u := oc__supervisor(d, p ->> 'sesion');
  insert into oc_revisiones (id, granja_id, registro_id, usuario_id, nota)
    values ((p ->> 'id')::uuid, d.granja_id, (p ->> 'registro_id')::uuid, u, left(coalesce(p ->> 'nota', ''), 500))
    on conflict (id) do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- Acciones de administración del supervisor: desvincular o reconocer un teléfono, cambiar la clave del plantel
-- para operarios, o eliminar el plantel completo.
create or replace function oc_admin(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos; g oc_granjas; u text;
begin
  d := oc__dispositivo(p ->> 'token');
  u := oc__supervisor(d, p ->> 'sesion');
  if p ->> 'accion' = 'desvincular' then
    update oc_dispositivos set revocado = true
      where granja_id = d.granja_id and id = (p ->> 'dispositivo_id')::uuid and id <> d.id;
    delete from oc_sesiones where granja_id = d.granja_id and dispositivo_id = (p ->> 'dispositivo_id')::uuid and dispositivo_id <> d.id;
    delete from oc_suscripciones where granja_id = d.granja_id and dispositivo_id = (p ->> 'dispositivo_id')::uuid and dispositivo_id <> d.id;
    return jsonb_build_object('ok', true);
  elsif p ->> 'accion' = 'permitir' then
    -- Deshace una desvinculación: el mismo teléfono vuelve a funcionar sin escribir nada en él.
    update oc_dispositivos set revocado = false, reconocido = true, avisado = true, fallos = 0
      where granja_id = d.granja_id and id = (p ->> 'dispositivo_id')::uuid;
    return jsonb_build_object('ok', true);
  elsif p ->> 'accion' = 'reconocer' then
    update oc_dispositivos set reconocido = true, avisado = true
      where granja_id = d.granja_id and (p ->> 'dispositivo_id' is null or id::text = p ->> 'dispositivo_id');
    return jsonb_build_object('ok', true);
  elsif p ->> 'accion' = 'clave_operarios' then
    if length(trim(coalesce(p ->> 'clave', ''))) < 6 or length(trim(p ->> 'clave')) > 40 then
      raise exception 'OC_DATOS';
    end if;
    select * into g from oc_granjas where id = d.granja_id;
    if oc__clave_debil(p ->> 'clave', g.nombre) then
      return jsonb_build_object('error', 'OC_CLAVE_FACIL');
    end if;
    update oc_granjas set clave_operarios = trim(p ->> 'clave') where id = d.granja_id returning * into g;
    return jsonb_build_object('ok', true, 'clave_operarios', g.clave_operarios);
  elsif p ->> 'accion' = 'eliminar_plantel' then
    -- Borra el plantel completo. Exige escribir de nuevo la clave de supervisor.
    select * into g from oc_granjas where id = d.granja_id;
    if not exists (select 1 from jsonb_array_elements(g.config -> 'usuarios') x
        where x ->> 'id' = u and x ->> 'pin_hash' = oc__hash(u, coalesce(p ->> 'clave', ''))) then
      perform pg_sleep(1);
      return jsonb_build_object('error', 'OC_CLAVE');
    end if;
    delete from oc_granjas where id = d.granja_id;
    return jsonb_build_object('ok', true, 'eliminado', true);
  end if;
  raise exception 'OC_DATOS';
end $$;

-- ---------------------------------------------------------------------
--  Notificaciones
-- ---------------------------------------------------------------------

-- El teléfono se inscribe para recibir notificaciones. El rol lo decide el servidor, no el teléfono.
create or replace function oc_suscribir(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos; sup text; rol_final text;
begin
  d := oc__dispositivo(p ->> 'token');
  -- Solo se aceptan direcciones de los servicios de notificaciones de los navegadores.
  if coalesce(p ->> 'endpoint', '') !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|[a-z0-9.-]+[.]push[.]apple[.]com|[a-z0-9.-]+[.]notify[.]windows[.]com)/'
     or length(p ->> 'endpoint') > 1000 or coalesce(p ->> 'p256dh', '') = '' or coalesce(p ->> 'auth', '') = '' then
    raise exception 'OC_DATOS';
  end if;
  sup := oc__sesion(d, p ->> 'sesion');
  if sup is not null and sup = p ->> 'usuario_id' then
    rol_final := 'supervisor';
  elsif exists (select 1 from oc_granjas g, jsonb_array_elements(g.config -> 'usuarios') x
      where g.id = d.granja_id and x ->> 'id' = p ->> 'usuario_id' and x ->> 'rol' = 'operario' and (x ->> 'activo')::boolean) then
    rol_final := 'operario';
  else
    raise exception 'OC_DATOS';
  end if;
  delete from oc_suscripciones where dispositivo_id = d.id and endpoint <> p ->> 'endpoint';
  insert into oc_suscripciones (granja_id, dispositivo_id, usuario_id, rol, endpoint, p256dh, auth)
    values (d.granja_id, d.id, p ->> 'usuario_id', rol_final, p ->> 'endpoint', p ->> 'p256dh', p ->> 'auth')
    on conflict (endpoint) do update set granja_id = excluded.granja_id, dispositivo_id = excluded.dispositivo_id,
      usuario_id = excluded.usuario_id, rol = excluded.rol, p256dh = excluded.p256dh, auth = excluded.auth;
  return jsonb_build_object('ok', true, 'rol', rol_final);
end $$;

create or replace function oc_desuscribir(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos;
begin
  d := oc__dispositivo(p ->> 'token');
  delete from oc_suscripciones where dispositivo_id = d.id;
  return jsonb_build_object('ok', true);
end $$;

-- Suscripciones vigentes de una granja para un rol: solo de personas que siguen activas con ese rol.
create or replace function oc__suscripciones(g oc_granjas, rol_buscado text) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'usuario_id', s.usuario_id)), '[]'::jsonb)
  from oc_suscripciones s
  join oc_dispositivos d on d.id = s.dispositivo_id and not d.revocado
  where s.granja_id = g.id and s.rol = rol_buscado
    and exists (select 1 from jsonb_array_elements(g.config -> 'usuarios') x
                where x ->> 'id' = s.usuario_id and x ->> 'rol' = rol_buscado and (x ->> 'activo')::boolean);
$$;

-- Problemas que aún no se avisan al supervisor. Los entrega una sola vez. (Solo el servidor de la app.)
create or replace function oc_avisos_pendientes(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos; solo uuid; res jsonb;
begin
  if coalesce(p ->> 'token', '') <> '' then
    d := oc__dispositivo(p ->> 'token');
    solo := d.granja_id;
  end if;
  with tomados as (
    update oc_registros r set avisado = true
    where r.id in (select x.id from oc_registros x
                   where x.critico and not x.avisado and x.recibido > now() - interval '2 days'
                     and (solo is null or x.granja_id = solo)
                   order by x.recibido limit 60 for update skip locked)
    returning r.granja_id, r.datos, r.recibido
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'granja', g.nombre,
      'suscripciones', oc__suscripciones(g, 'supervisor'),
      'registros', t.regs)), '[]'::jsonb) into res
  from (select granja_id, jsonb_agg(jsonb_build_object(
          'id', datos ->> 'id', 'tipo', datos ->> 'tipo', 'galpon', datos ->> 'galpon_nombre', 'persona', datos ->> 'usuario_nombre',
          'usuario_id', datos ->> 'usuario_id', 'tarea', datos -> 'tarea' ->> 'nombre', 'categoria', datos ->> 'categoria',
          'nota', datos ->> 'nota', 'flags', datos -> 'flags', 'avisos', datos -> 'avisos') order by recibido) as regs
        from tomados group by granja_id) t
  join oc_granjas g on g.id = t.granja_id;
  return res;
end $$;

-- Equipos que entraron al plantel y aún no se avisan a los supervisores. Los entrega una sola vez. (Solo el servidor de la app.)
create or replace function oc_equipos_por_avisar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare res jsonb;
begin
  with tomados as (
    update oc_dispositivos x set avisado = true
    where not x.avisado and not x.revocado and x.creado > now() - interval '3 days'
    returning x.id, x.granja_id, x.nombre, x.usuario_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'granja', g.nombre, 'suscripciones', oc__suscripciones(g, 'supervisor'), 'equipos', t.equipos)), '[]'::jsonb) into res
  from (select tm.granja_id, jsonb_agg(jsonb_build_object('id', tm.id, 'nombre', tm.nombre, 'usuario_id', tm.usuario_id,
          'persona', (select x ->> 'nombre' from oc_granjas gg, jsonb_array_elements(gg.config -> 'usuarios') x
                      where gg.id = tm.granja_id and x ->> 'id' = tm.usuario_id))) as equipos
        from tomados tm group by tm.granja_id) t
  join oc_granjas g on g.id = t.granja_id;
  return res;
end $$;

-- Las tareas programadas (recordatorios) solo hacen su trabajo una vez por turno, aunque alguien abra su dirección muchas veces.
create or replace function oc_turno(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare llave text := 'turno:' || left(coalesce(p ->> 'nombre', ''), 40);
begin
  if oc__frenado(llave, 1, make_interval(hours => least(greatest(coalesce((p ->> 'horas')::int, 6), 1), 48))) then
    return jsonb_build_object('toca', false);
  end if;
  perform oc__anotar(llave);
  return jsonb_build_object('toca', true);
end $$;

-- Tareas del bloque (mañana o tarde) que siguen sin registrar hoy, por granja. (Solo el servidor de la app.)
create or replace function oc_pendientes_del_dia(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare zona text := coalesce(oc__ajuste('zona_horaria'), 'America/Santiago'); hoy date; dia int; res jsonb;
begin
  hoy := (now() at time zone zona)::date;
  dia := extract(dow from hoy)::int;
  select coalesce(jsonb_agg(jsonb_build_object(
      'granja', g.nombre, 'total', f.total, 'galpones', f.galpones,
      'supervisores', oc__suscripciones(g, 'supervisor'), 'operarios', oc__suscripciones(g, 'operario'))), '[]'::jsonb) into res
  from oc_granjas g
  join lateral (
    select sum(q.n)::int as total,
           jsonb_agg(jsonb_build_object('galpon', q.nombre, 'n', q.n, 'encargados', q.encargados) order by q.orden) as galpones
    from (
      select gp.x ->> 'nombre' as nombre, gp.orden,
             case when jsonb_typeof(gp.x -> 'encargados') = 'array' then gp.x -> 'encargados' else '[]'::jsonb end as encargados,
             count(*) as n
      from jsonb_array_elements(g.config -> 'galpones') with ordinality as gp(x, orden)
      cross join jsonb_array_elements(g.config -> 'tareas') as t(x)
      where (gp.x ->> 'activo')::boolean and (t.x ->> 'activo')::boolean
        and t.x ->> 'bloque' = p ->> 'bloque'
        and (t.x -> 'dias') @> to_jsonb(dia)
        and (jsonb_typeof(t.x -> 'galpones') <> 'array' or (t.x -> 'galpones') ? (gp.x ->> 'id'))
        and not exists (
          select 1 from oc_registros r
          where r.granja_id = g.id and r.fecha = hoy and r.galpon_id = gp.x ->> 'id' and r.datos ->> 'tarea_id' = t.x ->> 'id'
            and not coalesce((r.datos ->> 'anulado')::boolean, false)
            and not exists (select 1 from oc_registros c where c.granja_id = g.id and c.fecha = hoy and c.datos ->> 'corrige' = r.id::text))
      group by 1, 2, 3
    ) q
  ) f on f.total > 0
  -- Solo granjas en uso: con algún registro en los últimos 4 días.
  where exists (select 1 from oc_registros r where r.granja_id = g.id and r.recibido > now() - interval '4 days');
  return res;
end $$;

-- Granjas con fotos que la nube borrará en los próximos 7 días. (Solo el servidor de la app.)
create or replace function oc_fotos_por_vencer(p jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('granja', g.nombre, 'fotos', f.n, 'dias', oc__ajuste('dias_fotos')::int,
           'supervisores', oc__suscripciones(g, 'supervisor'))), '[]'::jsonb)
  from oc_granjas g
  join lateral (select count(*)::int as n from storage.objects o
                where o.bucket_id = 'ovocheck' and o.name like g.id::text || '/%'
                  and o.created_at < now() - ((oc__ajuste('dias_fotos')::int - 7) || ' days')::interval) f on f.n > 0;
$$;

-- Suscripción del propio teléfono (para la notificación de prueba) y limpieza de las que ya no existen.
create or replace function oc_suscripcion_propia(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos;
begin
  d := oc__dispositivo(p ->> 'token');
  return coalesce((select jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)
                   from oc_suscripciones s where s.dispositivo_id = d.id limit 1), 'null'::jsonb);
end $$;

create or replace function oc_suscripciones_borrar(p jsonb) returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  with b as (delete from oc_suscripciones where endpoint in (select jsonb_array_elements_text(p -> 'endpoints')) returning 1)
  select jsonb_build_object('borradas', (select count(*) from b));
$$;

-- ---------------------------------------------------------------------
--  Fotos (Storage)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('ovocheck', 'ovocheck', true, 250000, array['image/jpeg'])
  on conflict (id) do update set public = true, file_size_limit = 250000, allowed_mime_types = array['image/jpeg'];

-- Una foto solo se acepta si pertenece a un registro que ese plantel ya envió (los registros exigen un teléfono
-- del plantel), y mientras quede cupo. Así nadie de fuera puede llenar el espacio con archivos.
create or replace function oc_cupo_ok(nombre text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare carpeta text := split_part(nombre, '/', 1); foto text; total bigint;
begin
  if nombre !~ '^[0-9a-f-]{36}/[0-9a-z-]{36,60}\.jpg$' then
    return false;
  end if;
  foto := regexp_replace(split_part(nombre, '/', 2), '\.jpg$', '');
  if not exists (select 1 from oc_granjas where id = carpeta::uuid) then
    return false;
  end if;
  if not exists (select 1 from oc_registros r
                 where r.granja_id = carpeta::uuid and (r.datos -> 'fotos') @> jsonb_build_array(jsonb_build_object('id', foto)))
     and not exists (select 1 from oc_intentos i where i.llave = 'foto:' || nombre and i.creado > now() - interval '5 minutes') then
    return false;
  end if;
  if oc__fotos_usadas(carpeta::uuid) >= coalesce(oc__ajuste('max_fotos_granja')::int, 3000)
     or oc__mb_fotos(carpeta::uuid) >= coalesce(oc__ajuste('max_mb_fotos_granja')::numeric, 300) then
    return false;
  end if;
  select coalesce(sum((metadata ->> 'size')::bigint), 0) into total from storage.objects where bucket_id = 'ovocheck';
  if total >= coalesce(oc__ajuste('max_mb_total')::bigint, 900) * 1048576 then
    return false;
  end if;
  return true;
end $$;

-- Permiso de cinco minutos para subir la foto de prueba de "Probar conexión".
create or replace function oc_permitir_prueba(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos;
begin
  d := oc__dispositivo(p ->> 'token');
  if coalesce(p ->> 'foto', '') !~ '^prueba-[0-9a-f-]{36}$' then
    raise exception 'OC_DATOS';
  end if;
  if oc__frenado('prueba:' || d.id, 6, interval '1 hour') then
    return jsonb_build_object('error', 'OC_BLOQUEO');
  end if;
  perform oc__anotar('prueba:' || d.id);
  perform oc__anotar('foto:' || d.granja_id || '/' || (p ->> 'foto') || '.jpg');
  return jsonb_build_object('ok', true);
end $$;

drop policy if exists "ovocheck subir fotos" on storage.objects;
create policy "ovocheck subir fotos" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'ovocheck' and public.oc_cupo_ok(name));

-- Lista de fotos por borrar en la limpieza diaria (solo con la clave de servicio): las que cumplieron su plazo,
-- las de planteles eliminados y las de prueba.
create or replace function oc_fotos_vencidas(p jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'dias', oc__ajuste('dias_fotos')::int,
    'nombres', coalesce((select jsonb_agg(n) from (
      select o.name as n from storage.objects o
      where o.bucket_id = 'ovocheck'
        and (o.created_at < now() - (oc__ajuste('dias_fotos') || ' days')::interval
             or (o.created_at < now() - interval '1 hour'
                 and (split_part(o.name, '/', 2) like 'prueba-%'
                      or not exists (select 1 from oc_granjas g where g.id::text = split_part(o.name, '/', 1)))))
      order by o.created_at limit least(coalesce((p ->> 'limite')::int, 500), 1000)) t), '[]'::jsonb));
$$;

-- Cuánto espacio queda (solo el servidor de la app, una vez al día). Dice además si toca avisar por correo
-- a quien administra la app: al pasar el 60 %, el 80 % y el 95 %, y una vez por semana mientras siga sobre el 80 %.
create or replace function oc_uso(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  m oc_espacio; maxd numeric := coalesce(oc__ajuste('max_mb_datos')::numeric, 450);
  maxf numeric := coalesce(oc__ajuste('max_mb_total')::numeric, 900);
  maxg integer := coalesce(oc__ajuste('max_galpones')::int, 60);
  galpones integer := oc__galpones_en_uso(); pct integer; nivel integer; avisar boolean;
begin
  if p ? 'avisado' then
    update oc_espacio set nivel_avisado = (p ->> 'avisado')::int, avisado = now() where id;
    return jsonb_build_object('ok', true);
  end if;
  m := oc__medir(true);
  pct := greatest(round(100 * m.mb_datos / maxd), round(100 * m.mb_fotos / maxf), round(100.0 * galpones / greatest(maxg, 1)))::int;
  nivel := case when pct >= 95 then 95 when pct >= 80 then 80 when pct >= 60 then 60 else 0 end;
  if nivel < m.nivel_avisado then
    update oc_espacio set nivel_avisado = nivel where id;
  end if;
  avisar := nivel > m.nivel_avisado or (nivel >= 80 and coalesce(m.avisado, 'epoch') < now() - interval '7 days');
  return jsonb_build_object('pct', pct, 'nivel', nivel, 'avisar', avisar,
    'mb_datos', m.mb_datos, 'max_mb_datos', maxd, 'mb_fotos', m.mb_fotos, 'max_mb_total', maxf,
    'galpones', galpones, 'max_galpones', maxg,
    'planteles', (select count(*) from oc_granjas), 'max_granjas', coalesce(oc__ajuste('max_granjas')::int, 100),
    'nuevos_hoy', (select count(*) from oc_granjas where creado > now() - interval '1 day'),
    'max_granjas_dia', coalesce(oc__ajuste('max_granjas_dia')::int, 8),
    'mayores', coalesce((select jsonb_agg(t) from (
        select g.nombre, (select count(*) from oc_registros r where r.granja_id = g.id) as registros, oc__mb_fotos(g.id) as mb_fotos
        from oc_granjas g order by 2 desc, 3 desc limit 5) t), '[]'::jsonb));
end $$;

-- Limpieza diaria (solo el servidor de la app): planteles que alguien creó para probar y dejó botados, para que no
-- ocupen cupos. Solo se borra un plantel que NUNCA registró nada y que nadie abrió en 180 días (ajuste dias_abandono),
-- y solo después de haberle avisado por correo a sus supervisores con un mes de anticipación.
-- Un plantel con registros no se borra jamás por su cuenta, aunque sus galpones pasen meses vacíos.
create or replace function oc_limpieza(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  delete from oc_granjas g
    where g.creado < now() - make_interval(days => oc__dias_abandono())
      -- Nunca sin aviso: a sus supervisores se les escribió al menos 25 días antes.
      and g.aviso_abandono < now() - interval '25 days'
      and not exists (select 1 from oc_registros r where r.granja_id = g.id)
      and not exists (select 1 from oc_dispositivos d where d.granja_id = g.id and d.visto > now() - make_interval(days => oc__dias_abandono()));
  get diagnostics n = row_count;
  delete from oc_intentos where creado < now() - interval '2 days';
  return jsonb_build_object('planteles_abandonados', n);
end $$;

-- Planteles abandonados que se eliminarán en unos 30 días: se entregan una sola vez, con los correos de sus
-- supervisores, para avisarles antes. Si alguien vuelve a abrir el plantel, el aviso se olvida. (Solo el servidor de la app.)
create or replace function oc_abandono_por_avisar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare res jsonb; margen integer := oc__dias_abandono() - 30;
begin
  update oc_granjas g set aviso_abandono = null
    where g.aviso_abandono is not null
      and (exists (select 1 from oc_dispositivos d where d.granja_id = g.id and d.visto > g.aviso_abandono)
           or exists (select 1 from oc_registros r where r.granja_id = g.id));
  with marcados as (
    update oc_granjas g set aviso_abandono = now()
    where g.aviso_abandono is null
      and g.creado < now() - make_interval(days => margen)
      and not exists (select 1 from oc_registros r where r.granja_id = g.id)
      and not exists (select 1 from oc_dispositivos d where d.granja_id = g.id and d.visto > now() - make_interval(days => margen))
    returning g.nombre, g.config
  )
  select coalesce(jsonb_agg(jsonb_build_object('granja', m.nombre, 'dias', 30,
      'correos', coalesce((select jsonb_agg(distinct lower(x ->> 'correo')) from jsonb_array_elements(m.config -> 'usuarios') x
                           where x ->> 'rol' = 'supervisor' and coalesce(x ->> 'correo', '') <> ''), '[]'::jsonb))), '[]'::jsonb)
    into res from marcados m;
  return res;
end $$;

-- Teléfonos que llevan más de un día sin conectarse y con registros sin enviar: lo que tienen guardado solo existe
-- en ese teléfono. (Solo el servidor de la app.)
create or replace function oc_telefonos_atrasados(p jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('granja', g.nombre, 'supervisores', oc__suscripciones(g, 'supervisor'), 'telefonos', t.lista)), '[]'::jsonb)
  from oc_granjas g
  join lateral (
    select jsonb_agg(jsonb_build_object(
        'persona', (select x ->> 'nombre' from jsonb_array_elements(g.config -> 'usuarios') x where x ->> 'id' = d.usuario_id),
        'nombre', d.nombre, 'pendientes', d.pendientes,
        'dias', greatest(1, floor(extract(epoch from (now() - d.visto)) / 86400)::int)) order by d.visto) as lista
    from oc_dispositivos d
    where d.granja_id = g.id and not d.revocado and d.pendientes > 0
      and d.visto < now() - interval '24 hours' and d.visto > now() - interval '21 days'
  ) t on t.lista is not null;
$$;

-- Planteles en uso, con las suscripciones de sus supervisores, para el recordatorio mensual de respaldo.
create or replace function oc_respaldo_mensual(p jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('granja', g.nombre, 'supervisores', oc__suscripciones(g, 'supervisor'))), '[]'::jsonb)
  from oc_granjas g
  where exists (select 1 from oc_registros r where r.granja_id = g.id and r.recibido > now() - interval '35 days');
$$;

-- ---------------------------------------------------------------------
--  Soporte (se ejecuta solo desde este SQL Editor)
-- ---------------------------------------------------------------------
-- Si contratas el plan Pro de Supabase, avísale a la app que ahora tiene más espacio:
--   select oc_soporte_plan('pro');       (para volver atrás: select oc_soporte_plan('gratis');)
drop function if exists oc_soporte_plan(text);
create function oc_soporte_plan(plan text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  v := case lower(trim(plan))
    when 'pro' then '{"max_mb_datos":"7200","max_mb_total":"95000","max_mb_fotos_granja":"4000","max_fotos_granja":"30000","max_galpones":"1500","max_granjas":"1000","max_granjas_dia":"50","max_registros_dia":"10000"}'::jsonb
    when 'gratis' then '{"max_mb_datos":"450","max_mb_total":"900","max_mb_fotos_granja":"300","max_fotos_granja":"3000","max_galpones":"60","max_granjas":"100","max_granjas_dia":"8","max_registros_dia":"2500"}'::jsonb
    else null end;
  if v is null then return 'Escribe pro o gratis'; end if;
  insert into oc_ajustes (clave, valor) select key, value from jsonb_each_text(v)
    on conflict (clave) do update set valor = excluded.valor;
  update oc_espacio set medido = 'epoch' where id;
  return 'Listo: límites del plan ' || lower(trim(plan));
end $$;

-- Para borrar un plantel completo desde aquí (por ejemplo, uno creado para abusar del espacio):
--   select oc_soporte_eliminar('Nombre del plantel');
drop function if exists oc_soporte_eliminar(text);
create function oc_soporte_eliminar(nombre_plantel text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare g oc_granjas;
begin
  select * into g from oc_granjas where nombre_norm = oc__norma(nombre_plantel);
  if not found then return 'No existe un plantel con ese nombre'; end if;
  delete from oc_granjas where id = g.id;
  return 'Plantel eliminado: ' || g.nombre || '. Sus fotos se borran en la limpieza de esta noche.';
end $$;

-- Si un supervisor perdió su clave y también el acceso a su correo, y no hay otro supervisor que se la cambie:
--   select oc_soporte_clave('Nombre del plantel', 'Nombre del supervisor', 'claveTemporal');
-- La app le pedirá cambiarla apenas entre.
drop function if exists oc_soporte_clave(text, text, text);
create function oc_soporte_clave(nombre_plantel text, nombre_supervisor text, clave_temporal text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare g oc_granjas; u jsonb;
begin
  select * into g from oc_granjas where nombre_norm = oc__norma(nombre_plantel);
  if not found then return 'No existe un plantel con ese nombre'; end if;
  select x into u from jsonb_array_elements(g.config -> 'usuarios') x
    where x ->> 'rol' = 'supervisor' and lower(x ->> 'nombre') = lower(trim(nombre_supervisor));
  if u is null then return 'No hay un supervisor con ese nombre en ' || g.nombre; end if;
  if length(clave_temporal) < 6 then return 'La clave debe tener al menos 6 caracteres'; end if;
  update oc_granjas set config = oc__cambiar_usuario(config, u ->> 'id',
      jsonb_build_object('pin_hash', oc__hash(u ->> 'id', clave_temporal), 'temporal', true, 'activo', true, 'estado', 'activo')),
    version = version + 1 where id = g.id;
  delete from oc_sesiones where granja_id = g.id and usuario_id = u ->> 'id';
  return 'Listo: ' || (u ->> 'nombre') || ' puede entrar con la clave temporal';
end $$;

-- Resumen de uso, para mirar de vez en cuando:  select * from oc_soporte_uso;
drop view if exists oc_soporte_uso;
create view oc_soporte_uso with (security_invoker = true) as
  select g.nombre, g.creado::date as creado,
    (select count(*) from oc_registros r where r.granja_id = g.id) as registros,
    (select max(r.recibido) from oc_registros r where r.granja_id = g.id) as ultimo_registro,
    oc__fotos_usadas(g.id) as fotos, oc__mb_fotos(g.id) as mb_fotos
  from oc_granjas g order by g.creado;
revoke all on oc_soporte_uso from anon, authenticated;

-- ---------------------------------------------------------------------
--  Permisos
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, p.proname from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'oc\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.firma);
    if f.proname in ('oc_crear_granja', 'oc_buscar_granja', 'oc_unirse', 'oc_entrar_supervisor', 'oc_recuperar_correo', 'oc_login', 'oc_crear_pin', 'oc_cambiar_clave', 'oc_recuperar',
                     'oc_guardar_config', 'oc_registrar', 'oc_sync', 'oc_registros', 'oc_revisar', 'oc_salir', 'oc_permitir_prueba', 'oc_autorizar_operario',
                     'oc_admin', 'oc_cupo_ok', 'oc_suscribir', 'oc_desuscribir') then
      execute format('grant execute on function %s to anon, authenticated', f.firma);
    end if;
    if f.proname in ('oc_fotos_vencidas', 'oc_recuperacion_pedir', 'oc_avisos_pendientes', 'oc_pendientes_del_dia',
                     'oc_fotos_por_vencer', 'oc_suscripcion_propia', 'oc_suscripciones_borrar', 'oc_equipos_por_avisar', 'oc_turno',
                     'oc_uso', 'oc_limpieza', 'oc_abandono_por_avisar', 'oc_telefonos_atrasados', 'oc_respaldo_mensual') then
      execute format('grant execute on function %s to service_role', f.firma);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

select 'Ovo Check instalado' as resultado;
