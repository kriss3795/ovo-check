-- =====================================================================
--  OVO CHECK · Base de datos (PostgreSQL)
--  La app la instala y actualiza sola cada vez que se publica (scripts/instalar.mjs).
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
  ('max_mb_fotos_granja', '250'),                -- espacio máximo de fotos de un solo plantel
  ('max_mb_total', '550'),                       -- tope total de fotos (comparten el 1 GB gratis con los datos)
  ('max_mb_datos', '900'),                       -- tope de la base de datos completa, fotos incluidas (el plan gratis da 1 GB)
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
-- Fotos de respaldo, dentro de la misma base de datos. Se borran solas al cumplir su plazo; si se elimina el
-- plantel, se van con él.
create table if not exists oc_fotos (
  nombre text primary key,
  granja_id uuid not null references oc_granjas (id) on delete cascade,
  datos bytea not null,
  tamano integer not null,
  creado timestamptz not null default now()
);
create index if not exists oc_fotos_granja on oc_fotos (granja_id, creado);
create index if not exists oc_fotos_creado on oc_fotos (creado);
alter table oc_fotos enable row level security;

-- Correcciones y anulaciones: para saber rápido qué registros siguen vigentes (inventario).
create index if not exists oc_registros_corrige on oc_registros (granja_id, (datos ->> 'corrige')) where datos ? 'corrige';

-- Bitácora: quién cambió qué en la configuración, quién entró y qué acciones de administración se hicieron.
create table if not exists oc_bitacora (
  id bigserial primary key,
  granja_id uuid not null references oc_granjas (id) on delete cascade,
  creado timestamptz not null default now(),
  usuario text,
  accion text not null,
  detalle jsonb not null default '[]'::jsonb,
  origen text
);
create index if not exists oc_bitacora_granja on oc_bitacora (granja_id, creado desc);
alter table oc_bitacora enable row level security;

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
  select count(*)::int from oc_fotos where granja_id = g;
$$;

create or replace function oc__mb_fotos(g uuid) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select round(coalesce(sum(tamano), 0) / 1048576.0, 1) from oc_fotos where granja_id = g;
$$;

-- ---------------------------------------------------------------------
--  Bitácora
-- ---------------------------------------------------------------------
create or replace function oc__bitacora(g uuid, usuario_id text, accion text, detalle jsonb default '[]'::jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare nombre text;
begin
  select x ->> 'nombre' into nombre from oc_granjas gr, jsonb_array_elements(gr.config -> 'usuarios') x
    where gr.id = g and x ->> 'id' = usuario_id;
  insert into oc_bitacora (granja_id, usuario, accion, detalle, origen)
    values (g, coalesce(nombre, usuario_id), left(accion, 80), coalesce(detalle, '[]'::jsonb), oc__origen());
  -- Se guardan los últimos 2.000 movimientos de cada plantel.
  delete from oc_bitacora b where b.granja_id = g and b.id < (
    select min(id) from (select id from oc_bitacora where granja_id = g order by id desc limit 2000) t);
end $$;

-- Qué cambió entre dos configuraciones, en palabras: agregados, quitados y modificados de cada lista.
create or replace function oc__cambios(viejo jsonb, nuevo jsonb) returns jsonb
language plpgsql immutable as $$
declare
  res jsonb := '[]'::jsonb; k text; nom text; x jsonb; y jsonb;
  listas text[] := array['usuarios', 'galpones', 'tareas', 'lotes', 'bodegas', 'calibres', 'mermas', 'clientes', 'proveedores', 'insumos', 'plan_sanitario'];
  nombres jsonb := '{"usuarios":"Persona","galpones":"Galpón","tareas":"Tarea","lotes":"Lote","bodegas":"Bodega","calibres":"Calibre","mermas":"Causa de merma","clientes":"Cliente","proveedores":"Proveedor","insumos":"Insumo","plan_sanitario":"Plan sanitario"}';
begin
  foreach k in array listas loop
    nom := nombres ->> k;
    for x in select e from jsonb_array_elements(case when jsonb_typeof(nuevo -> k) = 'array' then nuevo -> k else '[]' end) e loop
      select e into y from jsonb_array_elements(case when jsonb_typeof(viejo -> k) = 'array' then viejo -> k else '[]' end) e where e ->> 'id' = x ->> 'id';
      if y is null then
        res := res || to_jsonb(nom || ' agregado: ' || coalesce(x ->> 'nombre', x ->> 'producto', ''));
      elsif (y - 'pin_hash') is distinct from (x - 'pin_hash') then
        res := res || to_jsonb(nom || ' modificado: ' || coalesce(x ->> 'nombre', x ->> 'producto', ''));
      elsif y ->> 'pin_hash' is distinct from x ->> 'pin_hash' then
        res := res || to_jsonb(nom || ': clave o PIN cambiado: ' || coalesce(x ->> 'nombre', ''));
      end if;
    end loop;
    for y in select e from jsonb_array_elements(case when jsonb_typeof(viejo -> k) = 'array' then viejo -> k else '[]' end) e loop
      if not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(nuevo -> k) = 'array' then nuevo -> k else '[]' end) e where e ->> 'id' = y ->> 'id') then
        res := res || to_jsonb(nom || ' quitado: ' || coalesce(y ->> 'nombre', y ->> 'producto', ''));
      end if;
    end loop;
  end loop;
  if viejo -> 'granja' ->> 'nombre' is distinct from nuevo -> 'granja' ->> 'nombre' then
    res := res || to_jsonb('Nombre del plantel: ' || coalesce(nuevo -> 'granja' ->> 'nombre', ''));
  end if;
  if viejo -> 'modulos' is distinct from nuevo -> 'modulos' then res := res || '"Módulos cambiados"'::jsonb; end if;
  if viejo -> 'logica' is distinct from nuevo -> 'logica' then res := res || '"Alertas de mediciones cambiadas"'::jsonb; end if;
  if viejo -> 'envases' is distinct from nuevo -> 'envases' then res := res || '"Envases cambiados"'::jsonb; end if;
  if viejo -> 'respaldo' is distinct from nuevo -> 'respaldo' then res := res || to_jsonb('Respaldo descargado: ' || coalesce(nuevo -> 'respaldo' ->> 'por', '')); end if;
  return res;
end $$;

-- ---------------------------------------------------------------------
--  Espacio: el servidor se mide a sí mismo para no llenarse nunca
-- ---------------------------------------------------------------------
-- Si la base de datos gratuita se llena, deja de aceptar datos nuevos y nadie puede ni siquiera registrar.
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
        mb_fotos = round(coalesce((select sum(tamano) from oc_fotos), 0) / 1048576.0, 1)
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
-- Plantel de demostración (datos de ejemplo, se borra solo al día siguiente): no ocupa cupos.
create or replace function oc__es_demo(g oc_granjas) returns boolean
language sql immutable as $$
  select coalesce((g.config ->> 'demo')::boolean, false);
$$;

create or replace function oc__galpones_en_uso() returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum((select count(*) from jsonb_array_elements(g.config -> 'galpones') x
                       where coalesce((x ->> 'activo')::boolean, true))), 0)::int
  from oc_granjas g
  where jsonb_typeof(g.config -> 'galpones') = 'array' and not oc__es_demo(g)
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
  if (select count(*) from oc_granjas x where not oc__es_demo(x)) >= coalesce(oc__ajuste('max_granjas')::int, 100) then
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
  if (select count(*) from oc_granjas x where x.creado > now() - interval '1 day' and not oc__es_demo(x)) >= coalesce(oc__ajuste('max_granjas_dia')::int, 8) then
    return jsonb_build_object('error', 'OC_CUPO_HOY');
  end if;
  n := oc__norma(cfg -> 'granja' ->> 'nombre');
  select u into sup from jsonb_array_elements(cfg -> 'usuarios') u
    where u ->> 'rol' = 'supervisor' and length(u ->> 'pin_hash') = 64 limit 1;
  if sup is null or length(n) < 3 or length(cfg::text) > 800000
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
  perform oc__bitacora(g.id, null, 'Equipo nuevo con la clave del plantel', jsonb_build_array(d.nombre));
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
  perform oc__bitacora(g.id, u ->> 'id', 'Entrada de supervisor', jsonb_build_array(d.nombre));
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
  perform oc__bitacora(g.id, u ->> 'id', 'Operario agregado desde un teléfono', jsonb_build_array(n));
  return jsonb_build_object('usuario_id', id_nuevo, 'version', g.version, 'config', oc__config_para(g, false),
    'autorizo', u ->> 'nombre');
end $$;

-- Inventario: saldo de cada artículo en cada lugar, a partir de los movimientos de los registros vigentes
-- (no anulados ni reemplazados por una corrección). Un conteo físico deja el saldo en lo contado; se informa
-- además cuánto difería de lo que decía el sistema justo antes. Solo el supervisor, para que nadie cuente "a ojo".
-- Momento del registro original de una cadena de correcciones: una corrección ocupa el lugar del original en el tiempo
-- (si se corrige el lunes un ingreso, el saldo lo cuenta el lunes, antes del conteo del martes).
create or replace function oc__momento_original(rid uuid) returns timestamptz
language sql stable security definer set search_path = public, pg_temp as $$
  with recursive cadena(id, corrige, capturado, n) as (
    select r.id, r.datos ->> 'corrige', r.capturado, 0 from oc_registros r where r.id = rid
    union all
    select o.id, o.datos ->> 'corrige', o.capturado, c.n + 1 from cadena c join oc_registros o on o.id::text = c.corrige where c.n < 50
  )
  select capturado from cadena order by n desc limit 1;
$$;

create or replace function oc_saldos(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d oc_dispositivos; m record; clave text; saldo numeric := 0; actual text := '';
  res jsonb := '[]'::jsonb; ult_conteo timestamptz; dif numeric; ult_mov timestamptz;
begin
  d := oc__dispositivo(p ->> 'token');
  perform oc__supervisor(d, p ->> 'sesion');
  for m in
    select x ->> 'b' as b, x ->> 'k' as k, (x ->> 'q')::numeric as q, coalesce((x ->> 'set')::boolean, false) as fija,
      case when coalesce(r.datos ->> 'corrige', '') <> '' then oc__momento_original(r.id) else r.capturado end as capturado
    from oc_registros r, jsonb_array_elements(r.datos -> 'mov') x
    where r.granja_id = d.granja_id and jsonb_typeof(r.datos -> 'mov') = 'array'
      and not coalesce((r.datos ->> 'anulado')::boolean, false)
      and not exists (select 1 from oc_registros c where c.granja_id = r.granja_id and c.datos ->> 'corrige' = r.id::text)
    order by 1, 2, 5, r.id
  loop
    clave := m.b || '|' || m.k;
    if clave <> actual then
      if actual <> '' then
        res := res || jsonb_build_object('b', split_part(actual, '|', 1), 'k', split_part(actual, '|', 2), 'q', saldo,
          'conteo', ult_conteo, 'diferencia', dif, 'ultimo', ult_mov);
      end if;
      actual := clave; saldo := 0; ult_conteo := null; dif := null;
    end if;
    if m.fija then
      dif := m.q - saldo; saldo := m.q; ult_conteo := m.capturado;
    else
      saldo := saldo + m.q;
    end if;
    ult_mov := m.capturado;
  end loop;
  if actual <> '' then
    res := res || jsonb_build_object('b', split_part(actual, '|', 1), 'k', split_part(actual, '|', 2), 'q', saldo,
      'conteo', ult_conteo, 'diferencia', dif, 'ultimo', ult_mov);
  end if;
  return jsonb_build_object('saldos', res, 'ahora', now());
end $$;

-- Bitácora del plantel (solo supervisor): los últimos movimientos, del más nuevo al más antiguo.
create or replace function oc_bitacora_ver(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos;
begin
  d := oc__dispositivo(p ->> 'token');
  perform oc__supervisor(d, p ->> 'sesion');
  return coalesce((select jsonb_agg(jsonb_build_object('creado', b.creado, 'usuario', b.usuario, 'accion', b.accion, 'detalle', b.detalle) order by b.id desc)
    from (select * from oc_bitacora where granja_id = d.granja_id order by id desc limit least(coalesce((p ->> 'limite')::int, 200), 500)) b), '[]'::jsonb);
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
    -- Al crear su PIN la persona ya vio qué datos se guardan (Ley 21.719): queda anotado cuándo.
    update oc_granjas set config = oc__cambiar_usuario(config, u ->> 'id', jsonb_build_object('pin_hash', p ->> 'pin_hash', 'informado', now())),
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
  if cfg is null or length(cfg::text) > 800000 or jsonb_typeof(cfg -> 'usuarios') <> 'array'
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
  perform oc__bitacora(g.id, u, 'Configuración', oc__cambios(g.config, cfg));
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
    if coalesce(r ->> 'id', '') !~ '^[0-9a-f-]{36}$' or coalesce(r ->> 'fecha', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or coalesce(r ->> 'tipo', '') not in ('tarea', 'problema', 'proceso', 'bodega', 'despacho', 'recuperacion', 'insumo', 'sanidad', 'lote')
       or length(r::text) > (case when r ->> 'tipo' in ('tarea', 'problema') then 6000 else 20000 end) then
      continue;
    end if;
    -- Movimientos de inventario: una lista corta de números razonables.
    if r ? 'mov' and (jsonb_typeof(r -> 'mov') <> 'array' or jsonb_array_length(r -> 'mov') > 80 or exists (
         select 1 from jsonb_array_elements(r -> 'mov') m
         where jsonb_typeof(m -> 'q') <> 'number' or abs((m ->> 'q')::numeric) > 100000000
            or length(coalesce(m ->> 'b', '')) not between 1 and 60 or length(coalesce(m ->> 'k', '')) not between 1 and 60)) then
      rechazados := rechazados || jsonb_build_object('id', r ->> 'id', 'motivo', 'datos');
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
      -- Un operario solo registra en las áreas que el supervisor le asignó. Los lotes los maneja el supervisor.
      if r ->> 'tipo' not in ('tarea', 'problema') and (r ->> 'tipo' = 'lote' or u is null or not (
           coalesce(u -> 'areas', '[]'::jsonb) ? (case r ->> 'tipo' when 'despacho' then 'despachos' when 'insumo' then 'insumos' else r ->> 'tipo' end))) then
        rechazados := rechazados || jsonb_build_object('id', r ->> 'id', 'motivo', 'permiso');
        continue;
      end if;
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
    -- Una corrección siempre es del mismo día, galpón y tarea que el original, y solo de su versión vigente
    -- (no de una ya corregida o anulada): así nadie rellena días con correcciones ni revive algo anulado.
    if coalesce(r ->> 'corrige', '') <> '' then
      select * into orig from oc_registros where id::text = r ->> 'corrige' and granja_id = d.granja_id;
      if not found or coalesce((orig.datos ->> 'anulado')::boolean, false)
         or exists (select 1 from oc_registros x where x.granja_id = d.granja_id and x.datos ->> 'corrige' = orig.id::text and x.id::text <> r ->> 'id') then
        rechazados := rechazados || jsonb_build_object('id', r ->> 'id', 'motivo', 'version');
        continue;
      end if;
      r := r || jsonb_build_object('fecha', orig.fecha::text, 'galpon_id', orig.galpon_id,
                                   'tarea_id', orig.datos -> 'tarea_id', 'tipo', orig.datos -> 'tipo');
    end if;
    r := r || jsonb_build_object('usuario_nombre', case
      when u is not null then u ->> 'nombre'
      else left(coalesce(r ->> 'usuario_nombre', 'Sin nombre'), 50) || ' (ya no está en el plantel)' end);
    insert into oc_registros (id, granja_id, dispositivo_id, fecha, galpon_id, datos, capturado, reloj_desfase_s, demora_s, critico)
      values ((r ->> 'id')::uuid, d.granja_id, d.id, (r ->> 'fecha')::date, r ->> 'galpon_id', r,
              cap, desfase, round(ms / 1000)::int,
              coalesce(jsonb_typeof(r -> 'flags') = 'array' and (r -> 'flags') ?| array['problema', 'retrocede', 'no_calza', 'ilogico', 'gps_apagado'], false)
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
  if p ->> 'accion' in ('desvincular', 'permitir', 'clave_operarios') then
    perform oc__bitacora(d.granja_id, u, case p ->> 'accion' when 'desvincular' then 'Teléfono desvinculado'
      when 'permitir' then 'Teléfono permitido de nuevo' else 'Clave del plantel cambiada' end,
      coalesce((select jsonb_build_array(x.nombre) from oc_dispositivos x where x.id::text = p ->> 'dispositivo_id'), '[]'::jsonb));
  end if;
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
        and coalesce(t.x ->> 'etapa', 'produccion') in ('todas', coalesce(gp.x ->> 'tipo', 'produccion'))
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
  join lateral (select count(*)::int as n from oc_fotos o
                where o.granja_id = g.id
                  and o.creado < now() - ((oc__ajuste('dias_fotos')::int - 7) || ' days')::interval) f on f.n > 0;
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
--  Fotos
-- ---------------------------------------------------------------------
drop function if exists oc_cupo_ok(text);
drop function if exists oc_fotos_vencidas(jsonb);

-- Guarda una foto. Solo se acepta desde un teléfono del plantel, si pertenece a un registro que ese plantel ya
-- envió (o es la foto de prueba de "Probar conexión") y mientras quede espacio. Así nadie de fuera llena la base.
create or replace function oc_foto_guardar(p jsonb, datos bytea) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos; n text := coalesce(p ->> 'nombre', ''); carpeta text; foto text; total bigint;
begin
  d := oc__dispositivo(p ->> 'token');
  if n !~ '^[0-9a-f-]{36}/[0-9a-z-]{36,60}\.jpg$' then
    raise exception 'OC_DATOS';
  end if;
  carpeta := split_part(n, '/', 1);
  foto := regexp_replace(split_part(n, '/', 2), '\.jpg$', '');
  if carpeta <> d.granja_id::text or datos is null or length(datos) > 250000 or length(datos) < 100
     or substring(datos from 1 for 3) <> '\xffd8ff'::bytea then
    raise exception 'OC_DATOS';
  end if;
  if exists (select 1 from oc_fotos f where f.nombre = n) then
    return jsonb_build_object('ok', true, 'repetida', true);
  end if;
  if not exists (select 1 from oc_registros r
                 where r.granja_id = d.granja_id and (r.datos -> 'fotos') @> jsonb_build_array(jsonb_build_object('id', foto)))
     and not exists (select 1 from oc_intentos i where i.llave = 'foto:' || n and i.creado > now() - interval '5 minutes') then
    return jsonb_build_object('error', 'OC_FOTO_SIN_REGISTRO');
  end if;
  if oc__fotos_usadas(d.granja_id) >= coalesce(oc__ajuste('max_fotos_granja')::int, 3000)
     or oc__mb_fotos(d.granja_id) >= coalesce(oc__ajuste('max_mb_fotos_granja')::numeric, 250) then
    return jsonb_build_object('error', 'OC_CUPO');
  end if;
  select coalesce(sum(tamano), 0) into total from oc_fotos;
  if total >= coalesce(oc__ajuste('max_mb_total')::bigint, 550) * 1048576 or oc__lleno() then
    return jsonb_build_object('error', 'OC_CUPO');
  end if;
  insert into oc_fotos (nombre, granja_id, datos, tamano) values (n, d.granja_id, datos, length(datos))
    on conflict do nothing;
  return jsonb_build_object('ok', true);
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

-- Limpieza diaria: borra las fotos que cumplieron su plazo y las de prueba. (Solo el servidor de la app.)
create or replace function oc_fotos_borrar_vencidas(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  delete from oc_fotos o
    where o.creado < now() - (oc__ajuste('dias_fotos') || ' days')::interval
       or (o.creado < now() - interval '1 hour' and split_part(o.nombre, '/', 2) like 'prueba-%');
  get diagnostics n = row_count;
  return jsonb_build_object('dias', oc__ajuste('dias_fotos')::int, 'borradas', n);
end $$;

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
  perform oc__borrar_demos();
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

-- Vacunas y tratamientos del plan sanitario que tocan hoy o mañana según la edad de cada lote activo, sin registro
-- de aplicación todavía. (Solo el servidor de la app.)
create or replace function oc_sanidad_por_avisar(p jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with hoy as (select (now() at time zone coalesce(oc__ajuste('zona_horaria'), 'America/Santiago'))::date as d),
  item as (
    select g.id as gid, g.nombre as granja, l.x ->> 'nombre' as lote, l.x ->> 'id' as lote_id, pl.x ->> 'producto' as producto,
           pl.x ->> 'id' as plan_id, (l.x ->> 'nacimiento')::date + ((pl.x ->> 'semana')::int - 1) * 7 as fecha
    from oc_granjas g, hoy,
         jsonb_array_elements(case when jsonb_typeof(g.config -> 'lotes') = 'array' then g.config -> 'lotes' else '[]' end) l(x),
         jsonb_array_elements(case when jsonb_typeof(g.config -> 'plan_sanitario') = 'array' then g.config -> 'plan_sanitario' else '[]' end) pl(x)
    where l.x ->> 'estado' = 'activo' and coalesce(l.x ->> 'nacimiento', '') ~ '^\d{4}-\d{2}-\d{2}$'
      and coalesce(pl.x ->> 'etapa', l.x ->> 'etapa') = l.x ->> 'etapa'
      and (g.config -> 'modulos' ->> 'sanidad') is distinct from 'false'
  )
  select coalesce(jsonb_agg(jsonb_build_object('granja', t.granja, 'supervisores', oc__suscripciones(g, 'supervisor'), 'items', t.items)), '[]'::jsonb)
  from (
    select i.gid, i.granja, jsonb_agg(jsonb_build_object('lote', i.lote, 'producto', i.producto, 'fecha', i.fecha) order by i.fecha) as items
    from item i, hoy
    where i.fecha between hoy.d and hoy.d + 1
      and not exists (select 1 from oc_registros r where r.granja_id = i.gid and r.datos ->> 'tipo' = 'sanidad'
                      and not coalesce((r.datos ->> 'anulado')::boolean, false)
                      and r.datos -> 'detalle' ->> 'plan_id' = i.plan_id and r.datos -> 'detalle' -> 'lote_ids' ? i.lote_id)
    group by i.gid, i.granja
  ) t join oc_granjas g on g.id = t.gid;
$$;

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

-- Recordatorio diario de respaldo: planteles que recibieron registros hoy y cuyos supervisores todavía no descargan
-- el respaldo del día. (Solo el servidor de la app.)
drop function if exists oc_respaldo_mensual(jsonb);
create or replace function oc_respaldo_diario(p jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('granja', g.nombre, 'registros', n.hoy, 'supervisores', oc__suscripciones(g, 'supervisor'))), '[]'::jsonb)
  from oc_granjas g
  join lateral (select count(*)::int as hoy from oc_registros r
                where r.granja_id = g.id
                  and r.fecha = (now() at time zone coalesce(oc__ajuste('zona_horaria'), 'America/Santiago'))::date) n on n.hoy > 0
  where coalesce(g.config -> 'respaldo' ->> 'fecha', '') <> (now() at time zone coalesce(oc__ajuste('zona_horaria'), 'America/Santiago'))::date::text;
$$;

-- ---------------------------------------------------------------------
--  Soporte (se ejecuta a mano en la consola SQL de Neon)
-- ---------------------------------------------------------------------
-- Si contratas un plan pagado de Neon, avísale a la app que ahora tiene más espacio:
--   select oc_soporte_plan('pro');       (para volver atrás: select oc_soporte_plan('gratis');)
drop function if exists oc_soporte_plan(text);
create function oc_soporte_plan(plan text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  v := case lower(trim(plan))
    when 'pro' then '{"max_mb_datos":"9000","max_mb_total":"6000","max_mb_fotos_granja":"1500","max_fotos_granja":"30000","max_galpones":"300","max_granjas":"1000","max_granjas_dia":"50","max_registros_dia":"10000"}'::jsonb
    when 'gratis' then '{"max_mb_datos":"900","max_mb_total":"550","max_mb_fotos_granja":"250","max_fotos_granja":"3000","max_galpones":"60","max_granjas":"100","max_granjas_dia":"8","max_registros_dia":"2500"}'::jsonb
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
create view oc_soporte_uso as
  select g.nombre, g.creado::date as creado,
    (select count(*) from oc_registros r where r.granja_id = g.id) as registros,
    (select max(r.recibido) from oc_registros r where r.granja_id = g.id) as ultimo_registro,
    oc__fotos_usadas(g.id) as fotos, oc__mb_fotos(g.id) as mb_fotos
  from oc_granjas g order by g.creado;

-- ===================== Entrar con QR =====================
-- 1) Invitación del plantel: el supervisor muestra un QR; el operario lo escanea y su teléfono queda en el plantel,
--    sin escribir el nombre ni la clave. El código vence a los 30 días y se puede cambiar (el anterior deja de servir).
-- 2) Entrar en el computador con el celular: el computador muestra un QR que dura 3 minutos; el supervisor lo
--    escanea desde la app en su celular (ya con su sesión abierta), lo aprueba, y el computador entra con su nombre.
create table if not exists oc_invitaciones (
  codigo text primary key,
  granja_id uuid not null references oc_granjas (id) on delete cascade,
  creado timestamptz not null default now(),
  vence timestamptz not null,
  usos integer not null default 0,
  creado_por text
);
create index if not exists oc_invitaciones_granja on oc_invitaciones (granja_id);

create table if not exists oc_qr_entradas (
  codigo text primary key,
  secreto text not null,
  creado timestamptz not null default now(),
  dispositivo text not null default '',
  granja_id uuid references oc_granjas (id) on delete cascade,
  usuario_id text,
  aprobado timestamptz,
  usado boolean not null default false
);

-- Código corto, sin letras que se confundan, para el QR (y para dictarlo si la cámara falla).
create or replace function oc__codigo_corto(largo integer) returns text
language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, largo);
$$;

-- Supervisor: ver (o crear) la invitación vigente del plantel. {token, sesion, nueva?:true}
create or replace function oc_invitacion(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos; u text; i oc_invitaciones;
begin
  d := oc__dispositivo(p ->> 'token');
  u := oc__supervisor(d, p ->> 'sesion');
  if coalesce((p ->> 'nueva')::boolean, false) then
    delete from oc_invitaciones where granja_id = d.granja_id;
    perform oc__bitacora(d.granja_id, u, 'Cambió el QR para sumar teléfonos', '[]'::jsonb);
  end if;
  select * into i from oc_invitaciones where granja_id = d.granja_id and vence > now() order by creado desc limit 1;
  if not found then
    delete from oc_invitaciones where granja_id = d.granja_id;
    insert into oc_invitaciones (codigo, granja_id, vence, creado_por)
      values (oc__codigo_corto(12), d.granja_id, now() + interval '30 days', u) returning * into i;
  end if;
  return jsonb_build_object('codigo', i.codigo, 'vence', i.vence, 'usos', i.usos);
end $$;

-- Teléfono nuevo con el QR del plantel. {invitacion, dispositivo}
create or replace function oc_unirse_qr(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare i oc_invitaciones; g oc_granjas; d oc_dispositivos; origen text := oc__origen(); c text := upper(trim(coalesce(p ->> 'invitacion', '')));
begin
  if oc__frenado('qr:' || origen, case when origen = 'sin-ip' then 60 else 15 end) then
    return jsonb_build_object('error', 'OC_BLOQUEO');
  end if;
  select * into i from oc_invitaciones where codigo = c and vence > now();
  if not found then
    perform oc__anotar('qr:' || origen);
    perform pg_sleep(0.3);
    return jsonb_build_object('error', 'OC_QR_VENCIDO');
  end if;
  select * into g from oc_granjas where id = i.granja_id;
  if oc__frenado('alta:' || g.id, 40, interval '1 hour')
     or (select count(*) from oc_dispositivos x where x.granja_id = g.id) >= 2000 then
    return jsonb_build_object('error', 'OC_BLOQUEO');
  end if;
  perform oc__anotar('alta:' || g.id);
  update oc_invitaciones set usos = usos + 1 where codigo = c;
  insert into oc_dispositivos (granja_id, token, nombre, visto, reconocido, avisado)
    values (g.id, oc__token_nuevo(), left(coalesce(p ->> 'dispositivo', ''), 60), now(), false, false) returning * into d;
  perform oc__bitacora(g.id, null, 'Equipo nuevo con el QR del plantel', jsonb_build_array(d.nombre));
  return jsonb_build_object('token', d.token, 'dispositivo_id', d.id, 'version', g.version, 'config', oc__config_para(g, false),
    'granja', g.nombre);
end $$;

-- Computador: pedir un QR para entrar. {dispositivo}  ->  {codigo, secreto}
create or replace function oc_qr_pedir(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare origen text := oc__origen(); c text; s text;
begin
  if oc__frenado('qrpedir:' || origen, case when origen = 'sin-ip' then 120 else 30 end) then
    return jsonb_build_object('error', 'OC_BLOQUEO');
  end if;
  perform oc__anotar('qrpedir:' || origen);
  delete from oc_qr_entradas where creado < now() - interval '1 hour';
  c := oc__codigo_corto(10);
  s := oc__token_nuevo();
  insert into oc_qr_entradas (codigo, secreto, dispositivo) values (c, s, left(coalesce(p ->> 'dispositivo', ''), 60));
  return jsonb_build_object('codigo', c, 'secreto', s, 'dura', 180);
end $$;

-- Celular del supervisor: aprobar la entrada del computador. {token, sesion, codigo}
create or replace function oc_qr_aprobar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos; u text; q oc_qr_entradas;
begin
  d := oc__dispositivo(p ->> 'token');
  u := oc__supervisor(d, p ->> 'sesion');
  select * into q from oc_qr_entradas where codigo = upper(trim(coalesce(p ->> 'codigo', '')))
    and creado > now() - interval '3 minutes' and aprobado is null and not usado;
  if not found then
    return jsonb_build_object('error', 'OC_QR_VENCIDO');
  end if;
  update oc_qr_entradas set aprobado = now(), granja_id = d.granja_id, usuario_id = u where codigo = q.codigo;
  return jsonb_build_object('ok', true, 'dispositivo', q.dispositivo);
end $$;

-- Computador: preguntar si ya lo aprobaron. {codigo, secreto}  ->  {espera:true} | datos de entrada | error
create or replace function oc_qr_esperar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare q oc_qr_entradas; g oc_granjas; u jsonb; d oc_dispositivos; s uuid;
begin
  select * into q from oc_qr_entradas where codigo = upper(trim(coalesce(p ->> 'codigo', '')))
    and secreto = coalesce(p ->> 'secreto', '') and not usado;
  if not found or (q.aprobado is null and q.creado < now() - interval '3 minutes') then
    return jsonb_build_object('error', 'OC_QR_VENCIDO');
  end if;
  if q.aprobado is null then
    return jsonb_build_object('espera', true);
  end if;
  update oc_qr_entradas set usado = true where codigo = q.codigo;
  select * into g from oc_granjas where id = q.granja_id;
  select x into u from jsonb_array_elements(g.config -> 'usuarios') x
    where x ->> 'id' = q.usuario_id and (x ->> 'activo')::boolean and x ->> 'rol' = 'supervisor';
  if u is null then
    return jsonb_build_object('error', 'OC_QR_VENCIDO');
  end if;
  insert into oc_dispositivos (granja_id, token, nombre, visto, usuario_id, reconocido, avisado)
    values (g.id, oc__token_nuevo(), coalesce(nullif(q.dispositivo, ''), 'Computador'), now(), u ->> 'id', true, true) returning * into d;
  insert into oc_sesiones (granja_id, dispositivo_id, usuario_id) values (g.id, d.id, u ->> 'id') returning id into s;
  perform oc__bitacora(g.id, u ->> 'id', 'Entrada con QR desde otro equipo', jsonb_build_array(d.nombre));
  return jsonb_build_object('token', d.token, 'dispositivo_id', d.id, 'sesion', s, 'usuario_id', u ->> 'id',
    'version', g.version, 'config', oc__config_para(g, true), 'clave_operarios', g.clave_operarios,
    'temporal', coalesce((u ->> 'temporal')::boolean, false));
end $$;

-- Ley 21.719 (derecho de supresión): borra los datos personales de una persona que ya no trabaja en el plantel.
-- Los registros productivos se conservan (trazabilidad sanitaria), pero sin su nombre ni la ubicación del teléfono.
-- Las fotos llevan el nombre impreso: se borran las suyas. {token, sesion, usuario_id}
create or replace function oc_anonimizar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d oc_dispositivos; g oc_granjas; s text; u jsonb; n integer; etiqueta text;
begin
  d := oc__dispositivo(p ->> 'token');
  s := oc__supervisor(d, p ->> 'sesion');
  select * into g from oc_granjas where id = d.granja_id for update;
  select x into u from jsonb_array_elements(g.config -> 'usuarios') x where x ->> 'id' = p ->> 'usuario_id';
  if u is null or u ->> 'id' = s then
    raise exception 'OC_DATOS';
  end if;
  etiqueta := 'Persona eliminada ' || upper(left(md5(u ->> 'id'), 4));
  update oc_granjas set config = oc__cambiar_usuario(config, u ->> 'id', jsonb_build_object(
      'nombre', etiqueta, 'correo', '', 'pin_hash', '', 'activo', false, 'estado', 'baja', 'anonimizado', now())),
    version = version + 1 where id = g.id;
  update oc_registros set datos = datos || jsonb_build_object('usuario_nombre', etiqueta, 'lat', null, 'lng', null, 'precision', null)
    where granja_id = g.id and datos ->> 'usuario_id' = u ->> 'id';
  get diagnostics n = row_count;
  delete from oc_fotos f where f.granja_id = g.id and exists (
    select 1 from oc_registros r, jsonb_array_elements(coalesce(r.datos -> 'fotos', '[]'::jsonb)) x
    where r.granja_id = g.id and r.datos ->> 'usuario_id' = u ->> 'id' and f.nombre = g.id || '/' || (x ->> 'id') || '.jpg');
  update oc_dispositivos set usuario_id = null where granja_id = g.id and usuario_id = u ->> 'id';
  delete from oc_suscripciones where usuario_id = u ->> 'id';
  perform oc__bitacora(g.id, s, 'Datos personales eliminados', jsonb_build_array(etiqueta, n || ' registros'));
  return jsonb_build_object('ok', true, 'registros', n, 'nombre', etiqueta);
end $$;

-- ===================== Demostración =====================
-- Un plantel de ejemplo con varias semanas de datos inventados, para conocer la app sin tener operarios.
-- Los datos los arma la app (con las mismas tareas y cálculos de siempre); aquí solo se guardan.
-- Se borra solo a las 24 horas. No ocupa cupos de planteles. {config, registros: [...], dispositivo}
create or replace function oc__borrar_demos() returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from oc_granjas g where oc__es_demo(g) and g.creado < now() - interval '24 hours';
$$;

create or replace function oc_demo_crear(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  g oc_granjas; d oc_dispositivos; s uuid; cfg jsonb := p -> 'config'; sup jsonb; cod text; nombre text;
  origen text := oc__origen(); r jsonb; n integer := 0;
begin
  if oc__frenado('demo:' || origen, case when origen = 'sin-ip' then 60 else 20 end, interval '1 day') then
    return jsonb_build_object('error', 'OC_BLOQUEO');
  end if;
  perform oc__borrar_demos();
  -- Nunca más de 15 demostraciones vivas: si hay más, se borra la más antigua.
  delete from oc_granjas viejas where viejas.id in (
    select x.id from oc_granjas x where oc__es_demo(x) order by x.creado desc offset 14);
  if oc__lleno() or jsonb_typeof(cfg) <> 'object' or jsonb_typeof(p -> 'registros') <> 'array'
     or jsonb_array_length(p -> 'registros') > 4000 or length(p::text) > 9000000 or length(cfg::text) > 200000 then
    raise exception 'OC_DATOS';
  end if;
  select u into sup from jsonb_array_elements(cfg -> 'usuarios') u where u ->> 'rol' = 'supervisor' limit 1;
  if sup is null then
    raise exception 'OC_DATOS';
  end if;
  cod := oc__codigo_nuevo();
  nombre := 'Demostración ' || upper(left(md5(random()::text), 4));
  cfg := cfg || jsonb_build_object('demo', true);
  insert into oc_granjas (nombre, nombre_norm, clave_operarios, codigo, config)
    values (nombre, oc__norma(nombre) || left(md5(random()::text), 6), 'demo' || left(md5(random()::text), 10), cod, cfg) returning * into g;
  cfg := jsonb_set(cfg, '{granja}', (cfg -> 'granja') || jsonb_build_object('id', g.id, 'codigo', cod, 'nombre', nombre));
  update oc_granjas set config = cfg where id = g.id returning * into g;
  insert into oc_dispositivos (granja_id, token, nombre, visto, usuario_id, reconocido, avisado)
    values (g.id, oc__token_nuevo(), left(coalesce(p ->> 'dispositivo', ''), 60), now(), sup ->> 'id', true, true) returning * into d;
  insert into oc_sesiones (granja_id, dispositivo_id, usuario_id) values (g.id, d.id, sup ->> 'id') returning id into s;
  for r in select * from jsonb_array_elements(p -> 'registros') loop
    if coalesce(r ->> 'id', '') !~ '^[0-9a-f-]{36}$' or coalesce(r ->> 'fecha', '') !~ '^\d{4}-\d{2}-\d{2}$' or length(r::text) > 6000 then
      continue;
    end if;
    insert into oc_registros (id, granja_id, dispositivo_id, fecha, galpon_id, datos, capturado, reloj_desfase_s, demora_s, critico)
      values ((r ->> 'id')::uuid, g.id, d.id, (r ->> 'fecha')::date, r ->> 'galpon_id', r - 'capturado' - 'recibido',
              coalesce((r ->> 'capturado_dispositivo')::timestamptz, now()), 0, 0,
              coalesce(jsonb_typeof(r -> 'flags') = 'array' and (r -> 'flags') ?| array['problema', 'retrocede', 'no_calza', 'ilogico', 'gps_apagado'], false))
      on conflict (id) do nothing;
    n := n + 1;
  end loop;
  perform oc__anotar('demo:' || origen);
  return jsonb_build_object('token', d.token, 'dispositivo_id', d.id, 'sesion', s, 'usuario_id', sup ->> 'id', 'version', g.version,
    'config', oc__config_para(g, true), 'clave_operarios', g.clave_operarios, 'registros', n);
end $$;

-- Informe diario por correo (al cierre del día): lo de hoy por galpón, para los supervisores y los correos extra que
-- el plantel anotó (gerencia). Solo planteles reales con registros hoy y con el informe activado. (Solo el servidor.)
create or replace function oc_informe_diario(p jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with hoy as (select (now() at time zone coalesce(oc__ajuste('zona_horaria'), 'America/Santiago'))::date as d),
  v as (
    select r.granja_id, r.galpon_id, r.datos, r.critico from oc_registros r, hoy
    where r.fecha = hoy.d and not coalesce((r.datos ->> 'anulado')::boolean, false)
      and not exists (select 1 from oc_registros c where c.granja_id = r.granja_id and c.datos ->> 'corrige' = r.id::text)
  ),
  por_galpon as (
    select granja_id, galpon_id,
      max(datos ->> 'galpon_nombre') as nombre,
      max(case when jsonb_typeof(datos -> 'aves') = 'number' then (datos ->> 'aves')::numeric end) as aves,
      sum(case when datos -> 'tarea' -> 'campos' -> 0 ->> 'indicador' ilike '%postura%' and jsonb_typeof(datos -> 'valores' -> 0) = 'number'
               then (datos -> 'valores' ->> 0)::numeric end) as huevos,
      sum(case when datos -> 'tarea' -> 'campos' -> 0 ->> 'indicador' ilike '%del lote%' and jsonb_typeof(datos -> 'valores' -> 0) = 'number'
               then (datos -> 'valores' ->> 0)::numeric end) as muertas,
      max(case when datos -> 'tarea' -> 'campos' -> 0 ->> 'indicador' = 'ml por ave' and jsonb_typeof(datos -> 'indicadores' -> 0) = 'number'
               then (datos -> 'indicadores' ->> 0)::numeric end) as ml,
      max(case when datos -> 'tarea' -> 'campos' -> 0 ->> 'indicador' = 'g por ave' and jsonb_typeof(datos -> 'indicadores' -> 0) = 'number'
               then (datos -> 'indicadores' ->> 0)::numeric end) as g,
      count(*) filter (where critico)::int as alertas,
      count(*)::int as registros
    from v where datos ->> 'tipo' in ('tarea', 'problema') group by granja_id, galpon_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'granja', g.nombre, 'fecha', (select d from hoy),
    'correos', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (
        select lower(u ->> 'correo') as x from jsonb_array_elements(g.config -> 'usuarios') u
          where u ->> 'rol' = 'supervisor' and coalesce((u ->> 'activo')::boolean, false) and coalesce(u ->> 'correo', '') like '%@%'
        union select lower(trim(e)) from jsonb_array_elements_text(coalesce(g.config -> 'informe' -> 'correos', '[]'::jsonb)) e where e like '%@%') c),
    'galpones', (select jsonb_agg(to_jsonb(pg) - 'granja_id' order by pg.nombre) from por_galpon pg where pg.granja_id = g.id))), '[]'::jsonb)
  from oc_granjas g
  where not oc__es_demo(g) and coalesce((g.config -> 'informe' ->> 'activo')::boolean, true)
    and exists (select 1 from por_galpon pg where pg.granja_id = g.id);
$$;

select 'Ovo Check instalado' as resultado;
