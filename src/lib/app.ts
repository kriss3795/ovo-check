// Acciones de la app: ingreso, registros, configuración y sincronización.
import * as idb from './idb';
import { ErrorNube, api, mensajeError, nubeConfigurada, rpc, subirFoto } from './nube';
import { avisarProblema, conectarSesion, iniciarAvisos, refrescarAvisos, soltarAvisos } from './avisos';
import { avisar, iniciarNavegacion, irRaiz, leerEstado, poner, ponerSync, type Visita } from './estado';
import { FLAGS_CRITICOS } from './logica';
import { RUTINA_CLASICA, tareaDesde } from './plantillas';
import type { Config, FotoLocal, ItemCola, Registro, RegistroLocal, Revision, Usuario } from './tipos';
import { fechaLocal, hashPin, sumarDias, uid, vibrar } from './util';

// ------------------------------------------------------------------ memoria local
interface Credenciales {
  /** Sesión de supervisor entregada por el servidor, por usuario. */
  sesiones: Record<string, string>;
  /** Clave ya verificada por el servidor en este teléfono, para poder entrar sin señal. */
  hashes: Record<string, string>;
}
interface SesionLocal {
  usuario_id: string;
  fecha: string;
  ultimo: number;
}

let credenciales: Credenciales = { sesiones: {}, hashes: {} };
let pines: Record<string, string> = {}; // PIN creados en este teléfono que aún no llegan al servidor
let cursor: { cursor: string | null; desde: string } = { cursor: null, desde: '' };
let desfase = 0; // reloj del servidor menos reloj del teléfono (ms)
let cola: ItemCola[] = [];
let sincronizando = false;
let pedirOtra = false;

const DIAS_OPERARIO = 12;
const DIAS_SUPERVISOR = 35;
const DIAS_LOCALES = 60;
const HORAS_INACTIVO_OPERARIO = 4;
const DIAS_SESION_SUPERVISOR = 7;

/** Hora del teléfono, corregida con la del servidor si su reloj está muy corrido. */
const estimado = () => Date.now() + (Math.abs(desfase) > 120000 ? desfase : 0);

// La hora más avanzada que la app ha visto en este teléfono. El tiempo no retrocede: si el reloj aparece más atrás
// que esto, alguien lo cambió a mano (por ejemplo, para anotar "en la mañana" algo que se hizo en la tarde).
let relojAlto = 0;
let relojGuardado = 0;
const TOLERANCIA_RELOJ = 120000;

function subirReloj(forzar = false) {
  const e = estimado();
  if (e > relojAlto) relojAlto = e;
  if (forzar || relojAlto - relojGuardado > 60000) {
    relojGuardado = relojAlto;
    idb.guardar('kv', relojAlto, 'reloj_alto').catch(() => {});
  }
}

/** Cuánto está atrasado el reloj del teléfono respecto de la última hora conocida (0 si no lo está). */
const atrasoReloj = () => {
  const d = relojAlto - estimado();
  return d > TOLERANCIA_RELOJ ? d : 0;
};

/** Hora actual. Nunca anterior a la última hora que la app ya vio en este teléfono. */
export function ahora(): Date {
  return new Date(atrasoReloj() ? relojAlto : estimado());
}

const sesionDe = (u: Usuario | null) => (u ? credenciales.sesiones[u.id] : undefined);
export const haySesionSupervisor = () => Boolean(sesionDe(leerEstado().usuario));

function contarCola() {
  ponerSync({
    pendientes: cola.filter((c) => c.tipo !== 'foto').length,
    fotosPendientes: cola.filter((c) => c.tipo === 'foto').length,
    cupo: cola.some((c) => c.tipo === 'foto' && c.error === 'cupo'),
  });
}

async function encolar(items: ItemCola[]) {
  cola.push(...items);
  await idb.guardarVarios('cola', items);
  contarCola();
}

async function desencolar(ids: string[]) {
  const s = new Set(ids);
  cola = cola.filter((c) => !s.has(c.id));
  await idb.borrarVarios('cola', ids);
  contarCola();
}

function ordenar(regs: RegistroLocal[]) {
  return regs.sort((a, b) => a.capturado_dispositivo.localeCompare(b.capturado_dispositivo));
}

function mezclarRegistros(nuevos: RegistroLocal[]) {
  if (!nuevos.length) return;
  const mapa = new Map(leerEstado().registros.map((r) => [r.id, r]));
  for (const r of nuevos) mapa.set(r.id, r);
  poner({ registros: ordenar([...mapa.values()]) });
}

// ------------------------------------------------------------------ arranque
export async function iniciar() {
  iniciarNavegacion();
  conectarSesion(() => sesionDe(leerEstado().usuario) ?? null);
  iniciarAvisos();
  if (!nubeConfigurada) {
    poner({ fase: 'sin_nube' });
    return;
  }
  idb.pedirPersistencia();
  try {
    const [cfg, disp, ses, cred, cur, des, vis, pin, regs, revs, col, alto] = await Promise.all([
      idb.leer<{ config: Config; version: number }>('kv', 'config'),
      idb.leer<{ token: string; id: string; nombre: string }>('kv', 'dispositivo'),
      idb.leer<SesionLocal>('kv', 'sesion'),
      idb.leer<Credenciales>('kv', 'credenciales'),
      idb.leer<typeof cursor>('kv', 'cursor'),
      idb.leer<number>('kv', 'desfase'),
      idb.leer<Record<string, Visita>>('kv', 'visitas'),
      idb.leer<Record<string, string>>('kv', 'pines'),
      idb.todos<RegistroLocal>('registros'),
      idb.todos<Revision>('revisiones'),
      idb.todos<ItemCola>('cola'),
      idb.leer<number>('kv', 'reloj_alto'),
    ]);
    credenciales = cred ?? credenciales;
    cursor = cur ?? cursor;
    desfase = des ?? 0;
    relojAlto = relojGuardado = alto ?? 0;
    pines = pin ?? {};
    cola = (col ?? []).sort((a, b) => a.creado - b.creado);
    const hoy = fechaLocal(ahora());
    poner({ hoy, registros: ordenar(regs ?? []), revisiones: revs ?? [], visitas: vis ?? {} });
    contarCola();
    if (!cfg || !disp) {
      poner({ fase: 'bienvenida' });
    } else {
      poner({ config: cfg.config, version: cfg.version, dispositivo: disp });
      const u = ses ? cfg.config.usuarios.find((x) => x.id === ses.usuario_id && x.activo) : undefined;
      if (u && ses && sesionVigente(u, ses, hoy)) {
        poner({ usuario: u, fase: 'app' });
        irRaiz(raizDe(u));
      } else {
        poner({ fase: 'ingreso' });
      }
    }
  } catch (e) {
    console.error(e);
    avisar('No se pudo abrir el almacenamiento del teléfono', 'mal');
    poner({ fase: 'bienvenida' });
  }
  window.addEventListener('online', () => {
    ponerSync({ enLinea: true });
    sincronizar();
  });
  window.addEventListener('offline', () => ponerSync({ enLinea: false }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      revisarSesion();
      sincronizar();
    }
  });
  setInterval(latido, 20000);
  sincronizar();
}

function sesionVigente(u: Usuario, s: SesionLocal, hoy: string) {
  if (u.rol === 'supervisor') return Date.now() - s.ultimo < DIAS_SESION_SUPERVISOR * 86400000;
  // Operario: la sesión se cierra tras varias horas sin uso (teléfonos compartidos entre turnos). No se corta a
  // medianoche: quien está registrando a esa hora no pierde lo que tiene a medio anotar.
  return Date.now() - s.ultimo < HORAS_INACTIVO_OPERARIO * 3600000;
}

export const raizDe = (u: Usuario) => (u.rol === 'supervisor' ? { p: 'sup', tab: 'hoy' } : { p: 'op' });

let ultimoToque = 0;
/** Anota actividad del usuario (para el cierre por inactividad). */
export function tocar() {
  const u = leerEstado().usuario;
  if (!u || Date.now() - ultimoToque < 60000) return;
  ultimoToque = Date.now();
  idb.guardar('kv', { usuario_id: u.id, fecha: leerEstado().hoy, ultimo: Date.now() } satisfies SesionLocal, 'sesion');
}

async function revisarSesion() {
  const e = leerEstado();
  const hoy = fechaLocal(ahora());
  if (hoy !== e.hoy) poner({ hoy });
  if (e.fase !== 'app' || !e.usuario) return;
  const s = await idb.leer<SesionLocal>('kv', 'sesion');
  if (!s || !sesionVigente(e.usuario, s, hoy)) salir();
}

function latido() {
  const e = leerEstado();
  poner({ tic: e.tic + 1 });
  subirReloj();
  revisarSesion();
  if (document.visibilityState !== 'visible' || !e.dispositivo) return;
  const hace = Date.now() - (e.sync.ultima ?? 0);
  const esSup = e.usuario?.rol === 'supervisor';
  const frenado = Date.now() < frenoHasta;
  const hayCola = cola.some((c) => (c.tipo === 'registro' ? !frenado && c.error !== 'sesion' : !c.proximo || c.proximo <= Date.now()));
  if (hayCola || hace > (esSup ? 25000 : 180000)) sincronizar();
}

// ------------------------------------------------------------------ vincular / crear
/**
 * Antes de pasar este equipo a otro plantel: si quedan registros o fotos sin enviar del plantel actual, se perderían.
 * (Si el equipo fue desvinculado ya no hay cómo enviarlos, así que no se bloquea.)
 */
function exigirColaVacia() {
  const e = leerEstado();
  if (e.config && e.dispositivo && !e.desvinculado && cola.length > 0) {
    throw new ErrorNube(
      'PENDIENTES',
      `Este equipo tiene ${cola.length} ${cola.length === 1 ? 'dato' : 'datos'} sin enviar a ${e.config.granja.nombre}. Conéctalo a internet, espera a que diga "Todo enviado" y vuelve a intentarlo.`,
    );
  }
}

async function instalarGranja(r: { token: string; dispositivo_id: string; version: number; config: Config }, nombreDisp: string) {
  const previa = leerEstado().config;
  if (previa && previa.granja.id !== r.config.granja.id) {
    await idb.vaciarTodo();
    cola = [];
    credenciales = { sesiones: {}, hashes: {} };
    pines = {};
    poner({ registros: [], revisiones: [], visitas: {} });
    contarCola();
  }
  cursor = { cursor: null, desde: '' };
  const dispositivo = { token: r.token, id: r.dispositivo_id, nombre: nombreDisp };
  await idb.guardar('kv', { config: r.config, version: r.version }, 'config');
  await idb.guardar('kv', dispositivo, 'dispositivo');
  await idb.guardar('kv', cursor, 'cursor');
  poner({ config: r.config, version: r.version, dispositivo, desvinculado: false });
}

export async function crearGranja(d: {
  granja: string;
  supervisor: string;
  correo: string;
  clave: string;
  claveOperarios: string;
  galpones: number;
  dispositivo: string;
}) {
  exigirColaVacia();
  const supId = uid();
  const config: Config = {
    granja: { id: '', nombre: d.granja.trim(), codigo: '' },
    usuarios: [
      { id: supId, nombre: d.supervisor.trim(), rol: 'supervisor', pin_hash: await hashPin(supId, d.clave), activo: true, estado: 'activo', correo: d.correo.trim().toLowerCase() },
    ],
    galpones: Array.from({ length: d.galpones }, (_, i) => ({
      id: uid(),
      nombre: `Galpón ${i + 1}`,
      aves: null,
      lote: '',
      lat: null,
      lng: null,
      activo: true,
      desde: fechaLocal(ahora()),
    })),
    tareas: RUTINA_CLASICA.map((b) => tareaDesde(b, fechaLocal(ahora()))),
  };
  const r = await rpc('oc_crear_granja', { config, clave_operarios: d.claveOperarios.trim(), dispositivo: d.dispositivo });
  await instalarGranja(r, d.dispositivo);
  poner({ clavePlantel: r.clave_operarios ?? null });
  credenciales.sesiones[supId] = r.sesion;
  credenciales.hashes[supId] = config.usuarios[0].pin_hash;
  await idb.guardar('kv', credenciales, 'credenciales');
  const u = (r.config as Config).usuarios.find((x) => x.id === supId)!;
  await abrirSesion(u);
}

/** El operario busca su plantel por el nombre exacto. No hay lista de planteles. */
export async function buscarPlantel(nombre: string): Promise<{ nombre: string }> {
  return rpc('oc_buscar_granja', { nombre });
}

/** Suma este teléfono al plantel con la clave que el supervisor creó para sus operarios. */
export async function vincular(plantel: string, clave: string, nombreDisp: string) {
  exigirColaVacia();
  const r = await rpc('oc_unirse', { granja: plantel, clave, dispositivo: nombreDisp });
  await instalarGranja(r, nombreDisp);
  poner({ fase: 'ingreso', usuario: null, rolIngreso: 'operario' });
  avisarProblema(); // los supervisores reciben el aviso de que entró un equipo nuevo
  sincronizar();
}

/**
 * Entrada del supervisor con correo y clave, desde un equipo que aún no está en su plantel.
 * Si ese correo supervisa más de un plantel, devuelve la lista para elegir.
 */
export async function entrarSupervisorCorreo(
  correo: string,
  clave: string,
  nombreDisp: string,
  granjaId?: string,
): Promise<{ id: string; nombre: string }[] | null> {
  exigirColaVacia();
  const r = await rpc('oc_entrar_supervisor', { correo: correo.trim().toLowerCase(), clave, granja_id: granjaId, dispositivo: nombreDisp });
  if (r.elegir) return r.elegir;
  await instalarGranja(r, nombreDisp);
  credenciales.sesiones[r.usuario_id] = r.sesion;
  credenciales.hashes[r.usuario_id] = await hashPin(r.usuario_id, clave);
  await idb.guardar('kv', credenciales, 'credenciales');
  const u = (r.config as Config).usuarios.find((x) => x.id === r.usuario_id)!;
  poner({ cambiarClave: Boolean(r.temporal), clavePlantel: r.clave_operarios ?? null });
  await abrirSesion(u);
  avisarProblema(); // los demás supervisores reciben el aviso de que entró un equipo nuevo
  return null;
}

/** "Olvidé mi clave" con solo el correo: el servidor envía un código a esa dirección. */
export async function pedirCodigoCorreo(correo: string): Promise<{ correo: string; minutos: number }> {
  return api('recuperar', { correo: correo.trim().toLowerCase() });
}

/** Con el código recibido se elige la clave nueva. Después se entra con ella. */
export async function recuperarClaveCorreo(correo: string, codigo: string, nueva: string) {
  await rpc('oc_recuperar_correo', { correo: correo.trim().toLowerCase(), codigo, clave: nueva });
}

// ------------------------------------------------------------------ ingreso
async function abrirSesion(u: Usuario) {
  ultimoToque = Date.now();
  await idb.guardar('kv', { usuario_id: u.id, fecha: fechaLocal(ahora()), ultimo: Date.now() } satisfies SesionLocal, 'sesion');
  poner({ usuario: u, fase: 'app', hoy: fechaLocal(ahora()) });
  irRaiz(raizDe(u));
  sincronizar();
  refrescarAvisos();
}

let intentosPin = { n: 0, hasta: 0 };

export async function entrarOperario(u: Usuario, pin: string): Promise<'ok' | 'mal' | 'espera'> {
  if (Date.now() < intentosPin.hasta) return 'espera';
  if ((await hashPin(u.id, pin)) !== u.pin_hash) {
    intentosPin.n++;
    if (intentosPin.n >= 5) intentosPin = { n: 0, hasta: Date.now() + 30000 };
    return 'mal';
  }
  intentosPin = { n: 0, hasta: 0 };
  await abrirSesion(u);
  return 'ok';
}

/** El operario crea su propio PIN. Funciona sin señal: se guarda aquí y sube después. */
export async function crearPin(u: Usuario, pin: string) {
  const e = leerEstado();
  if (!e.config) return;
  const pin_hash = await hashPin(u.id, pin);
  pines[u.id] = pin_hash;
  await idb.guardar('kv', pines, 'pines');
  const config = aplicarPines(e.config);
  await idb.guardar('kv', { config, version: e.version }, 'config');
  poner({ config });
  await encolar([{ id: uid(), tipo: 'pin', ref: u.id, creado: Date.now(), intentos: 0 }]);
  await abrirSesion(config.usuarios.find((x) => x.id === u.id)!);
}

function aplicarPines(config: Config): Config {
  if (!Object.keys(pines).length) return config;
  return {
    ...config,
    usuarios: config.usuarios.map((u) => (u.rol === 'operario' && !u.pin_hash && pines[u.id] ? { ...u, pin_hash: pines[u.id] } : u)),
  };
}

export async function entrarSupervisor(u: Usuario, clave: string): Promise<void> {
  const e = leerEstado();
  const hash = await hashPin(u.id, clave);
  try {
    const r = await rpc('oc_login', { token: e.dispositivo!.token, usuario_id: u.id, clave });
    credenciales.sesiones[u.id] = r.sesion;
    credenciales.hashes[u.id] = hash;
    await idb.guardar('kv', credenciales, 'credenciales');
    await ponerConfig(r.config, r.version);
    poner({ cambiarClave: Boolean(r.temporal) });
    await abrirSesion(leerEstado().config!.usuarios.find((x) => x.id === u.id) ?? u);
  } catch (err) {
    if (err instanceof ErrorNube && err.red) {
      // Sin señal: solo entra si ya entró antes en este teléfono con esta misma clave.
      if (credenciales.hashes[u.id] && credenciales.hashes[u.id] === hash) {
        await abrirSesion(u);
        avisar('Entraste sin conexión: puedes ver lo guardado en este teléfono', 'info');
        return;
      }
      throw new ErrorNube(
        'SIN_VERIFICAR',
        credenciales.hashes[u.id]
          ? 'Sin conexión no se puede verificar esa clave. Revísala o inténtalo cuando tengas señal.'
          : 'Sin conexión no se puede entrar como supervisor en este equipo. Inténtalo cuando tengas señal.',
        true,
      );
    }
    if (err instanceof ErrorNube && err.codigo === 'OC_TOKEN') marcarDesvinculado();
    throw err;
  }
}

export async function cambiarClave(nueva: string) {
  const e = leerEstado();
  const u = e.usuario!;
  const pin_hash = await hashPin(u.id, nueva);
  const r = await rpc('oc_cambiar_clave', { token: e.dispositivo!.token, sesion: sesionDe(u), pin_hash });
  credenciales.hashes[u.id] = pin_hash;
  await idb.guardar('kv', credenciales, 'credenciales');
  await ponerConfig(r.config, r.version);
  poner({ cambiarClave: false });
}

/** "Olvidé mi clave", paso 1: pide al servidor que envíe un código al correo del supervisor. */
export async function pedirCodigo(u: Usuario): Promise<{ correo: string; minutos: number }> {
  const e = leerEstado();
  return api('recuperar', { token: e.dispositivo!.token, usuario_id: u.id });
}

/** "Olvidé mi clave", paso 2: con el código recibido se elige una clave nueva y se entra. */
export async function recuperarClave(u: Usuario, codigo: string, nueva: string) {
  const e = leerEstado();
  const pin_hash = await hashPin(u.id, nueva);
  try {
    const r = await rpc('oc_recuperar', { token: e.dispositivo!.token, usuario_id: u.id, codigo, pin_hash });
    credenciales.sesiones[u.id] = r.sesion;
    credenciales.hashes[u.id] = pin_hash;
    await idb.guardar('kv', credenciales, 'credenciales');
    await ponerConfig(r.config, r.version);
    poner({ cambiarClave: false });
    await abrirSesion(leerEstado().config!.usuarios.find((x) => x.id === u.id) ?? u);
  } catch (err) {
    if (err instanceof ErrorNube && err.codigo === 'OC_TOKEN') marcarDesvinculado();
    throw err;
  }
}

/**
 * Cierra la sesión. Con `olvidar` (botón "Cerrar sesión") el equipo deja de guardar la huella de la clave del
 * supervisor: en un teléfono compartido no queda nada con qué intentar adivinarla.
 */
export function salir(olvidar = false) {
  const e = leerEstado();
  // Al salir un supervisor, este equipo deja de guardar las claves y correos de los supervisores.
  if (e.usuario?.rol === 'supervisor' && e.config) {
    // La sesión se cierra también en el servidor: quien tome este equipo después no puede reutilizarla.
    const sesion = credenciales.sesiones[e.usuario.id];
    if (sesion && e.dispositivo) rpc('oc_salir', { token: e.dispositivo.token, sesion }).catch(() => {});
    delete credenciales.sesiones[e.usuario.id];
    if (olvidar) delete credenciales.hashes[e.usuario.id];
    idb.guardar('kv', credenciales, 'credenciales');
    // Y deja de recibir las alertas de supervisión. (Los recordatorios de un operario sí se mantienen.)
    soltarAvisos();
    const config: Config = {
      ...e.config,
      usuarios: e.config.usuarios.map((u) => {
        if (u.rol !== 'supervisor') return u;
        const { correo, ...resto } = u;
        return { ...resto, pin_hash: '' };
      }),
    };
    idb.guardar('kv', { config, version: e.version }, 'config');
    poner({ config, dispositivos: [], fotosNube: null, servidorLleno: false, clavePlantel: null, intentosFallidos: 0 });
  }
  idb.borrar('kv', 'sesion');
  poner({ usuario: null, fase: leerEstado().config ? 'ingreso' : 'bienvenida', ruta: [], cambiarClave: false });
}

function marcarDesvinculado() {
  poner({ fase: 'desvinculado', desvinculado: true, usuario: null, ruta: [] });
}

async function ponerConfig(config: Config, version: number) {
  const cfg = aplicarPines(config);
  await idb.guardar('kv', { config: cfg, version }, 'config');
  poner({ config: cfg, version });
  const e = leerEstado();
  if (e.usuario) {
    const u = cfg.usuarios.find((x) => x.id === e.usuario!.id);
    if (!u || !u.activo) {
      salir();
      avisar('Tu usuario ya no está activo en este plantel', 'mal');
    } else if (u !== e.usuario) {
      poner({ usuario: u });
    }
  }
}

// ------------------------------------------------------------------ ubicación al abrir un galpón
const HORAS_VISITA = 1;

export function visitaVigente(galponId: string): Visita | null {
  const v = leerEstado().visitas[galponId];
  return v && Date.now() - v.abierta < HORAS_VISITA * 3600000 ? v : null;
}

/** Al abrir un galpón se pide la ubicación del teléfono, para anotarla en cada registro. */
export function abrirVisita(galponId: string) {
  const previa = visitaVigente(galponId);
  const v: Visita = { lat: previa?.lat ?? null, lng: previa?.lng ?? null, precision: previa?.precision ?? null, abierta: Date.now() };
  const visitas = { ...leerEstado().visitas, [galponId]: v };
  poner({ visitas });
  idb.guardar('kv', visitas, 'visitas');
  ubicar(galponId);
}

/** Pide la ubicación en segundo plano; si no llega, el registro se guarda igual sin GPS. */
export function ubicar(galponId: string) {
  if (!('geolocation' in navigator)) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const v = leerEstado().visitas[galponId];
      if (!v) return;
      const visitas = {
        ...leerEstado().visitas,
        [galponId]: { ...v, lat: pos.coords.latitude, lng: pos.coords.longitude, precision: Math.round(pos.coords.accuracy) },
      };
      poner({ visitas });
      idb.guardar('kv', visitas, 'visitas');
    },
    () => {},
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 120000 },
  );
}

// ------------------------------------------------------------------ registros
export interface FotoNueva {
  id: string;
  etiqueta: string;
  blob: Blob;
}

/** Guarda un registro en el teléfono y lo deja en la cola de envío. Nunca falla por falta de señal. */
export async function guardarRegistro(reg: Registro, fotos: FotoNueva[]) {
  const atras = atrasoReloj();
  subirReloj(true);
  const local: RegistroLocal = { ...reg, ...(atras ? { reloj_atras_s: Math.round(atras / 1000), _atras: atras } : {}), _pend: true, _ms: Date.now() };
  const ahoraMs = Date.now();
  await idb.guardarVarios(
    'fotos',
    fotos.map((f) => ({ id: f.id, blob: f.blob, creado: ahoraMs, subida: false }) satisfies FotoLocal),
  );
  await idb.guardar('registros', local);
  await encolar([
    { id: uid(), tipo: 'registro', ref: reg.id, creado: ahoraMs, intentos: 0 },
    ...fotos.map((f, i) => ({ id: uid(), tipo: 'foto' as const, ref: f.id, creado: ahoraMs + 1 + i, intentos: 0 })),
  ]);
  mezclarRegistros([local]);
  vibrar([40, 60, 40]);
  tocar();
  sincronizar();
}

export async function revisar(registroId: string, nota: string) {
  const e = leerEstado();
  const v: Revision = { id: uid(), registro_id: registroId, usuario_id: e.usuario!.id, nota: nota.trim(), creado: ahora().toISOString() };
  await idb.guardar('revisiones', v);
  poner({ revisiones: [...e.revisiones, v] });
  await encolar([{ id: uid(), tipo: 'revision', ref: v.id, creado: Date.now(), intentos: 0 }]);
  sincronizar();
}

// ------------------------------------------------------------------ configuración (supervisor)
/** Aplica un cambio a la configuración y lo guarda en el servidor. Requiere conexión. */
export async function guardarConfig(cambio: (c: Config) => void): Promise<void> {
  for (let intento = 0; intento < 4; intento++) {
    const e = leerEstado();
    const nueva: Config = structuredClone(e.config!);
    cambio(nueva);
    try {
      const r = await rpc('oc_guardar_config', {
        token: e.dispositivo!.token,
        sesion: sesionDe(e.usuario),
        version: e.version,
        config: nueva,
      });
      await ponerConfig(r.config, r.version);
      return;
    } catch (err) {
      if (err instanceof ErrorNube && err.codigo === 'OC_CONFLICTO' && err.datos?.config) {
        await ponerConfig(err.datos.config, err.datos.version);
        continue;
      }
      manejarErrorSesion(err);
      throw err;
    }
  }
  throw new ErrorNube('OC_CONFLICTO');
}

function manejarErrorSesion(err: unknown) {
  if (!(err instanceof ErrorNube)) return;
  if (err.codigo === 'OC_TOKEN') marcarDesvinculado();
  if (err.codigo === 'OC_SESION') {
    const u = leerEstado().usuario;
    if (u) {
      delete credenciales.sesiones[u.id];
      idb.guardar('kv', credenciales, 'credenciales');
    }
    salir();
    avisar('Por seguridad, vuelve a entrar con tu clave de supervisor', 'info');
  }
}

export async function administrar(accion: 'desvincular' | 'clave_operarios' | 'reconocer' | 'eliminar_plantel', valor?: string) {
  const e = leerEstado();
  try {
    const r = await rpc('oc_admin', {
      token: e.dispositivo!.token,
      sesion: sesionDe(e.usuario),
      accion,
      dispositivo_id: accion === 'desvincular' || accion === 'reconocer' ? valor : undefined,
      clave: accion === 'clave_operarios' || accion === 'eliminar_plantel' ? valor : undefined,
    });
    if (r.config) await ponerConfig(r.config, r.version);
    if (accion === 'desvincular') poner({ dispositivos: e.dispositivos.filter((d) => d.id !== valor) });
    if (accion === 'clave_operarios') poner({ clavePlantel: r.clave_operarios ?? valor ?? null });
    if (accion === 'reconocer') poner({ dispositivos: leerEstado().dispositivos.map((d) => (!valor || d.id === valor ? { ...d, reconocido: true } : d)) });
    if (accion === 'eliminar_plantel') await olvidarPlantel();
  } catch (err) {
    manejarErrorSesion(err);
    throw err;
  }
}

/** Borra de este equipo todo lo del plantel y vuelve a la primera pantalla. */
async function olvidarPlantel() {
  soltarAvisos();
  await idb.vaciarTodo();
  cola = [];
  credenciales = { sesiones: {}, hashes: {} };
  pines = {};
  cursor = { cursor: null, desde: '' };
  contarCola();
  poner({ config: null, dispositivo: null, usuario: null, registros: [], revisiones: [], visitas: {}, dispositivos: [], fotosNube: null, servidorLleno: false, clavePlantel: null, intentosFallidos: 0, desvinculado: false, ruta: [], cambiarClave: false, fase: 'bienvenida' });
}

/** Trae del servidor los registros de un período (historial y exportación). */
export async function traerPeriodo(desde: string, hasta: string): Promise<RegistroLocal[]> {
  const e = leerEstado();
  try {
    // El servidor entrega de a 5.000 registros: se piden páginas hasta tenerlos todos.
    const mapa = new Map<string, RegistroLocal>();
    let despues: string | null = null;
    let despuesId: string | null = null;
    for (let pagina = 0; pagina < 200; pagina++) {
      const r: any = await rpc('oc_registros', { token: e.dispositivo!.token, sesion: sesionDe(e.usuario), desde, hasta, despues, despues_id: despuesId }, 60000);
      for (const x of r.registros as RegistroLocal[]) mapa.set(x.id, x);
      if (!r.mas || !r.despues) break;
      despues = r.despues;
      despuesId = r.despues_id;
    }
    const pendientes = e.registros.filter((x) => x._pend && x.fecha >= desde && x.fecha <= hasta);
    for (const p of pendientes) if (!mapa.has(p.id)) mapa.set(p.id, p);
    return ordenar([...mapa.values()]);
  } catch (err) {
    manejarErrorSesion(err);
    throw err;
  }
}

let cargadoDesde = '';
/** Asegura que estén en memoria los registros desde una fecha (para mirar días antiguos). */
export async function asegurarPeriodo(desde: string): Promise<void> {
  const hoy = leerEstado().hoy;
  if (!cargadoDesde) cargadoDesde = sumarDias(hoy, -DIAS_SUPERVISOR);
  if (desde >= cargadoDesde) return;
  const regs = await traerPeriodo(desde, sumarDias(cargadoDesde, -1));
  mezclarRegistros(regs);
  cargadoDesde = desde;
}

// ------------------------------------------------------------------ sincronización
const sinMarcas = (r: RegistroLocal): Registro => {
  const { _pend, _ms, _atras, ...resto } = r;
  return resto;
};

/** Si el servidor no está recibiendo registros (lleno o tope diario), no se le insiste hasta esta hora. */
let frenoHasta = 0;
const ESPERA_FRENO = 10 * 60000;

function reintentarLuego(c: ItemCola, error: string) {
  c.intentos++;
  c.error = error;
  const espera = error === 'cupo' ? 3600000 : Math.min(30000 * 2 ** Math.min(c.intentos, 8), 3600000);
  c.proximo = Date.now() + espera;
  idb.guardar('cola', c);
}

export async function sincronizar(forzar = false): Promise<void> {
  const e0 = leerEstado();
  if (!nubeConfigurada || !e0.dispositivo || e0.fase === 'desvinculado') return;
  if (sincronizando) {
    pedirOtra = true;
    return;
  }
  if (!navigator.onLine) {
    ponerSync({ enLinea: false });
    return;
  }
  sincronizando = true;
  ponerSync({ ocupado: true });
  const token = e0.dispositivo.token;
  try {
    // 1. PIN creados sin señal
    for (const c of cola.filter((x) => x.tipo === 'pin')) {
      const pin_hash = pines[c.ref];
      if (pin_hash) {
        try {
          const r = await rpc('oc_crear_pin', { token, usuario_id: c.ref, pin_hash });
          delete pines[c.ref];
          await ponerConfig(r.config, r.version);
        } catch (err) {
          if (err instanceof ErrorNube && err.red) throw err;
          delete pines[c.ref];
          if (err instanceof ErrorNube && err.datos?.config) await ponerConfig(err.datos.config, err.datos.version);
        }
        await idb.guardar('kv', pines, 'pines');
      }
      await desencolar([c.id]);
    }

    // 2. Registros (pesan poco: van primero y en lote)
    let freno: 'lleno' | 'tope' | null = !forzar && Date.now() < frenoHasta ? leerEstado().sync.freno : null;
    for (; !freno; ) {
      // Lo que firmó un supervisor espera a que ese supervisor tenga su sesión abierta en este equipo.
      const quien = leerEstado().usuario;
      const sesionReg = sesionDe(quien);
      const porId = new Map(leerEstado().registros.map((r) => [r.id, r]));
      const lote = cola
        .filter((x) => x.tipo === 'registro' && (x.error !== 'sesion' || (Boolean(sesionReg) && porId.get(x.ref)?.usuario_id === quien?.id)))
        .slice(0, 40);
      if (!lote.length) break;
      const enEspera = new Set<string>();
      const items = lote
        .map((c) => porId.get(c.ref))
        .filter((r): r is RegistroLocal => Boolean(r))
        // Si al capturar el reloj estaba atrasado, ese atraso se descuenta: la hora no puede quedar antes de la última conocida.
        .map((r) => ({ registro: sinMarcas(r), transcurrido_ms: Math.max(0, Date.now() - (r._ms ?? Date.now()) - (r._atras ?? 0)) }));
      if (items.length) {
        let r: any;
        try {
          r = await rpc('oc_registrar', { token, sesion: sesionReg ?? null, ahora: new Date().toISOString(), items });
        } catch (err) {
          // Sin espacio en el servidor: los registros se quedan en este teléfono y se reintenta más tarde. Lo demás sigue.
          if (err instanceof ErrorNube && (err.codigo === 'OC_LLENO' || err.codigo === 'OC_TOPE_DIA')) {
            freno = err.codigo === 'OC_LLENO' ? 'lleno' : 'tope';
            frenoHasta = Date.now() + ESPERA_FRENO;
            ponerSync({ freno });
            break;
          }
          throw err;
        }
        for (const x of (r.rechazados ?? []) as { id: string; motivo: string }[]) if (x.motivo === 'sesion') enEspera.add(x.id);
        anotarHora(r.ahora);
        const confirmados: RegistroLocal[] = [];
        for (const res of r.resultados as any[]) {
          const local = porId.get(res.id);
          if (!local) continue;
          const { _pend, _ms, _atras, ...limpio } = local;
          confirmados.push({ ...limpio, capturado: res.capturado, recibido: res.recibido, reloj_desfase_s: res.reloj_desfase_s, demora_s: res.demora_s });
        }
        await idb.guardarVarios('registros', confirmados);
        mezclarRegistros(confirmados);
        // Un problema recién llegado se notifica de inmediato a los supervisores.
        if (items.some((x) => x.registro.flags.some((f) => FLAGS_CRITICOS.includes(f)) && !x.registro.anulado)) avisarProblema();
      }
      await desencolar(lote.filter((c) => !enEspera.has(c.ref)).map((c) => c.id));
      if (enEspera.size) {
        for (const c of lote.filter((x) => enEspera.has(x.ref))) {
          c.error = 'sesion';
          await idb.guardar('cola', c);
        }
        // Si quien está usando el equipo es ese supervisor, su sesión venció: tiene que volver a entrar con su clave.
        if (quien && [...enEspera].some((id) => porId.get(id)?.usuario_id === quien.id)) throw new ErrorNube('OC_SESION');
      }
    }

    // 3. Revisiones del supervisor
    const sesion = sesionDe(leerEstado().usuario);
    if (sesion) {
      const porId = new Map(leerEstado().revisiones.map((v) => [v.id, v]));
      for (const c of cola.filter((x) => x.tipo === 'revision')) {
        const v = porId.get(c.ref);
        if (v) await rpc('oc_revisar', { token, sesion, id: v.id, registro_id: v.registro_id, nota: v.nota });
        await desencolar([c.id]);
      }
    }

    // 4. Traer lo nuevo
    await traer(token);

    // 5. Fotos, de a una
    const granjaId = leerEstado().config!.granja.id;
    // El servidor solo acepta fotos de registros que ya recibió: las de un registro que sigue en espera aguardan con él.
    const enCola = new Set(cola.filter((x) => x.tipo === 'registro').map((x) => x.ref));
    const fotosEnEspera = new Set(leerEstado().registros.filter((r) => enCola.has(r.id)).flatMap((r) => r.fotos.map((f) => f.id)));
    for (const c of cola.filter((x) => x.tipo === 'foto')) {
      if (fotosEnEspera.has(c.ref)) continue;
      if (!forzar && c.proximo && c.proximo > Date.now()) continue;
      const f = await idb.leer<FotoLocal>('fotos', c.ref);
      if (!f) {
        await desencolar([c.id]);
        continue;
      }
      try {
        const r = await subirFoto(granjaId, f.id, f.blob);
        if (r === 'cupo') {
          reintentarLuego(c, 'cupo');
          contarCola();
          continue;
        }
        await idb.guardar('fotos', { ...f, subida: true });
        await desencolar([c.id]);
      } catch (err) {
        if (err instanceof ErrorNube && err.red) throw err;
        reintentarLuego(c, mensajeError(err));
        contarCola();
      }
    }

    if (!freno) frenoHasta = 0;
    ponerSync({ enLinea: true, error: null, ultima: Date.now(), freno });
  } catch (err) {
    if (err instanceof ErrorNube && err.codigo === 'OC_TOKEN') {
      marcarDesvinculado();
    } else if (err instanceof ErrorNube && err.codigo === 'OC_SESION') {
      manejarErrorSesion(err);
    } else if (err instanceof ErrorNube && err.red) {
      ponerSync({ enLinea: false, error: null });
    } else {
      console.error(err);
      ponerSync({ error: mensajeError(err) });
    }
  } finally {
    sincronizando = false;
    ponerSync({ ocupado: false });
    if (pedirOtra) {
      pedirOtra = false;
      setTimeout(() => sincronizar(), 50);
    }
  }
}

function anotarHora(servidor: string) {
  const t = new Date(servidor).getTime();
  const d = t - Date.now();
  if (Number.isFinite(d)) {
    desfase = d;
    idb.guardar('kv', desfase, 'desfase');
    // La hora del servidor manda: corrige la marca aunque el reloj del teléfono haya estado adelantado.
    relojAlto = t;
    subirReloj(true);
  }
}

async function traer(token: string) {
  const e = leerEstado();
  const hoy = fechaLocal(ahora());
  const dias = e.usuario?.rol === 'supervisor' ? DIAS_SUPERVISOR : DIAS_OPERARIO;
  const desde = sumarDias(hoy, -dias);
  // Si ahora se necesita más historia que la ya descargada (entró un supervisor), se pide todo de nuevo.
  const completo = !cursor.cursor || !cursor.desde || desde < cursor.desde;
  const r = await rpc('oc_sync', {
    token,
    sesion: sesionDe(e.usuario) ?? null,
    usuario_id: e.usuario?.id ?? '',
    pendientes: cola.length,
    version: e.version || null,
    desde,
    cursor: completo ? null : cursor.cursor,
  });
  anotarHora(r.ahora);
  if (Boolean(r.lleno) !== e.servidorLleno) poner({ servidorLleno: Boolean(r.lleno) });
  if (r.config) await ponerConfig(r.config, r.version);
  const nuevos = r.registros as RegistroLocal[];
  if (nuevos.length) {
    // Lo que aún espera en este teléfono no se pisa hasta que el servidor lo confirme por su vía.
    const pend = new Set(leerEstado().registros.filter((x) => x._pend).map((x) => x.id));
    const aceptar = nuevos.filter((x) => !pend.has(x.id));
    await idb.guardarVarios('registros', aceptar);
    mezclarRegistros(aceptar);
  }
  const revs = r.revisiones as Revision[];
  if (revs.length) {
    await idb.guardarVarios('revisiones', revs);
    const mapa = new Map(leerEstado().revisiones.map((v) => [v.id, v]));
    for (const v of revs) mapa.set(v.id, v);
    poner({ revisiones: [...mapa.values()] });
  }
  if (r.dispositivos) poner({ dispositivos: r.dispositivos, fotosNube: r.fotos ?? null, clavePlantel: r.clave_operarios ?? null, intentosFallidos: r.intentos_fallidos ?? 0 });
  // Un supervisor sin sesión vigente en el servidor (venció, o entró sin conexión) vuelve a identificarse apenas hay señal.
  if (e.usuario?.rol === 'supervisor' && r.sesion_ok === false) {
    throw new ErrorNube('OC_SESION');
  }
  cursor = { cursor: r.cursor, desde: completo ? desde : cursor.desde };
  await idb.guardar('kv', cursor, 'cursor');
  await limpiarLocal(hoy);
}

let ultimaLimpieza = '';
/** Una vez al día libera espacio del teléfono: registros muy antiguos y fotos que ya subieron. */
async function limpiarLocal(hoy: string) {
  if (ultimaLimpieza === hoy) return;
  ultimaLimpieza = hoy;
  const limite = sumarDias(hoy, -DIAS_LOCALES);
  const viejos = leerEstado().registros.filter((r) => r.fecha < limite && !r._pend);
  if (viejos.length) {
    await idb.borrarVarios('registros', viejos.map((r) => r.id));
    const s = new Set(viejos.map((r) => r.id));
    poner({ registros: leerEstado().registros.filter((r) => !s.has(r.id)) });
  }
  const fotos = await idb.todos<FotoLocal>('fotos');
  const corte = Date.now() - 10 * 86400000;
  await idb.borrarVarios('fotos', fotos.filter((f) => f.subida && f.creado < corte).map((f) => f.id));
}

/** Prueba de punta a punta para la pantalla de diagnóstico. */
export async function diagnostico(): Promise<{ paso: string; ok: boolean; detalle: string }[]> {
  const e = leerEstado();
  const pasos: { paso: string; ok: boolean; detalle: string }[] = [];
  pasos.push({ paso: 'Internet en este equipo', ok: navigator.onLine, detalle: navigator.onLine ? 'Conectado' : 'Sin conexión' });
  try {
    const t0 = Date.now();
    const r = await rpc('oc_sync', { token: e.dispositivo!.token, sesion: sesionDe(e.usuario) ?? null, usuario_id: e.usuario?.id ?? '', pendientes: cola.length, version: e.version, desde: e.hoy, cursor: new Date().toISOString() });
    pasos.push({ paso: 'Servidor de datos', ok: true, detalle: `Responde en ${Date.now() - t0} ms` });
    const d = Math.round((new Date(r.ahora).getTime() - Date.now()) / 1000);
    pasos.push({ paso: 'Reloj de este equipo', ok: Math.abs(d) < 300, detalle: Math.abs(d) < 5 ? 'Coincide con el servidor' : `Diferencia de ${Math.abs(d)} s con el servidor` });
  } catch (err) {
    pasos.push({ paso: 'Servidor de datos', ok: false, detalle: mensajeError(err) });
    return pasos;
  }
  try {
    const lienzo = document.createElement('canvas');
    lienzo.width = lienzo.height = 8;
    const blob: Blob = await new Promise((ok) => lienzo.toBlob((b) => ok(b!), 'image/jpeg', 0.5));
    const id = `prueba-${uid()}`;
    await rpc('oc_permitir_prueba', { token: e.dispositivo!.token, foto: id });
    const r = await subirFoto(e.config!.granja.id, id, blob);
    pasos.push({ paso: 'Subida de fotos', ok: r === 'ok', detalle: r === 'ok' ? 'El servidor acepta fotos' : 'El servidor rechazó la foto: cupo lleno o falta la regla de almacenamiento' });
  } catch (err) {
    pasos.push({ paso: 'Subida de fotos', ok: false, detalle: mensajeError(err) });
  }
  if (e.usuario?.rol === 'supervisor') {
    try {
      const r = await api<{ ok: boolean; detalle: string }>('recuperar?probar=1');
      pasos.push({ paso: 'Correos para recuperar claves', ok: r.ok, detalle: r.detalle || (r.ok ? 'Configurado' : 'Sin configurar') });
    } catch {
      pasos.push({ paso: 'Correos para recuperar claves', ok: false, detalle: 'No se encontró el servicio de correos. Revisa el paso 3 del LEEME.' });
    }
  }
  try {
    const r = await api<{ ok: boolean; detalle: string }>('avisar');
    pasos.push({ paso: 'Notificaciones', ok: r.ok, detalle: r.ok ? 'El servidor puede enviarlas' : r.detalle });
  } catch {
    pasos.push({ paso: 'Notificaciones', ok: false, detalle: 'No se encontró el servicio de notificaciones. Revisa el paso 3 del LEEME.' });
  }
  pasos.push({ paso: 'Pendientes en este equipo', ok: cola.length === 0, detalle: cola.length ? `${cola.length} por subir` : 'Nada por subir' });
  return pasos;
}

export const itemsCola = () => cola;
