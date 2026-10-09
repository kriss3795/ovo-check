// Estado de la app en memoria. Las pantallas se suscriben con useEstado().
import { useSyncExternalStore } from 'react';
import type { Config, DispositivoInfo, RegistroLocal, Revision, Usuario } from './tipos';
import { fechaLocal } from './util';

export interface Ruta {
  p: string;
  [k: string]: any;
}

/** Última ubicación conocida del teléfono al abrir un galpón. */
export interface Visita {
  lat: number | null;
  lng: number | null;
  precision: number | null;
  abierta: number;
}

export interface Sync {
  enLinea: boolean;
  ocupado: boolean;
  /** Registros que aún no llegan al servidor. */
  pendientes: number;
  fotosPendientes: number;
  ultima: number | null;
  error: string | null;
  /** El servidor no acepta más fotos por ahora (cupo lleno). */
  cupo: boolean;
  /** El servidor no está recibiendo registros: 'lleno' = sin espacio; 'tope' = el plantel llegó a su máximo diario. */
  freno: 'lleno' | 'tope' | null;
}

export interface Estado {
  fase: 'cargando' | 'sin_nube' | 'bienvenida' | 'ingreso' | 'app' | 'desvinculado';
  config: Config | null;
  version: number;
  dispositivo: { token: string; id: string; nombre: string } | null;
  usuario: Usuario | null;
  /** El supervisor entró con una clave temporal y debe cambiarla. */
  cambiarClave: boolean;
  registros: RegistroLocal[];
  revisiones: Revision[];
  dispositivos: DispositivoInfo[];
  /** Equipos que un supervisor desvinculó en los últimos meses: se pueden volver a permitir. */
  desvinculados: DispositivoInfo[];
  fotosNube: { usadas: number; max: number; dias: number; lleno?: boolean } | null;
  /** El servidor avisó que se quedó sin espacio para registros nuevos. */
  servidorLleno: boolean;
  /** Clave del plantel para operarios. Solo la recibe un supervisor con sesión. */
  clavePlantel: string | null;
  /** Claves del plantel equivocadas en las últimas 24 horas. */
  intentosFallidos: number;
  /** El supervisor quitó este equipo del plantel. */
  desvinculado: boolean;
  /** Con qué rol abrir la pantalla de ingreso (justo después de entrar al plantel como operario). */
  rolIngreso: 'operario' | 'supervisor' | null;
  /** Plantel que la pantalla de entrada trae ya escrito (el de este teléfono, si fue desvinculado). */
  plantelSugerido: string | null;
  sync: Sync;
  visitas: Record<string, Visita>;
  ruta: Ruta[];
  aviso: { texto: string; tipo: 'ok' | 'mal' | 'info'; id: number } | null;
  hoy: string;
  tic: number;
  /** Notificaciones en este equipo. */
  avisos: 'no_disponible' | 'bloqueado' | 'apagado' | 'activo';
  /** El navegador ofrece instalar la app en la pantalla de inicio. */
  instalable: boolean;
  /** Ya se descargó una versión nueva de la app: se aplica al recargar. */
  actualizacion: boolean;
}

let estado: Estado = {
  fase: 'cargando',
  config: null,
  version: 0,
  dispositivo: null,
  usuario: null,
  cambiarClave: false,
  registros: [],
  revisiones: [],
  dispositivos: [],
  desvinculados: [],
  fotosNube: null,
  servidorLleno: false,
  clavePlantel: null,
  intentosFallidos: 0,
  desvinculado: false,
  rolIngreso: null,
  plantelSugerido: null,
  sync: { enLinea: navigator.onLine, ocupado: false, pendientes: 0, fotosPendientes: 0, ultima: null, error: null, cupo: false, freno: null },
  visitas: {},
  ruta: [],
  aviso: null,
  hoy: fechaLocal(),
  tic: 0,
  avisos: 'no_disponible',
  instalable: false,
  actualizacion: false,
};

const oyentes = new Set<() => void>();

export const leerEstado = () => estado;

export function poner(cambio: Partial<Estado> | ((e: Estado) => Partial<Estado>)) {
  const c = typeof cambio === 'function' ? cambio(estado) : cambio;
  estado = { ...estado, ...c };
  oyentes.forEach((f) => f());
}

export const ponerSync = (c: Partial<Sync>) => poner((e) => ({ sync: { ...e.sync, ...c } }));

function suscribir(f: () => void) {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

export function useEstado<T>(selector: (e: Estado) => T): T {
  return useSyncExternalStore(suscribir, () => selector(estado));
}

let nAviso = 0;
let tAviso: ReturnType<typeof setTimeout> | undefined;
export function avisar(texto: string, tipo: 'ok' | 'mal' | 'info' = 'info') {
  const id = ++nAviso;
  poner({ aviso: { texto, tipo, id } });
  clearTimeout(tAviso);
  tAviso = setTimeout(() => {
    if (leerEstado().aviso?.id === id) poner({ aviso: null });
  }, tipo === 'mal' ? 5000 : 2800);
}

// ---------------------------------------------------------------- navegación
type Interceptor = () => void;
const interceptores: Interceptor[] = [];

export function ir(ruta: Ruta) {
  // Se recuerda cuánto se había bajado en la pantalla actual, para volver al mismo punto.
  poner((e) => ({ ruta: [...e.ruta.slice(0, -1), ...(e.ruta.length ? [{ ...e.ruta[e.ruta.length - 1], _y: window.scrollY }] : []), ruta] }));
  history.pushState({ n: leerEstado().ruta.length }, '');
  window.scrollTo(0, 0);
}

export function volver() {
  history.back();
}

/** Reemplaza toda la pila (al entrar, al salir o al cambiar de pestaña). */
export function irRaiz(ruta: Ruta) {
  poner({ ruta: [ruta] });
  window.scrollTo(0, 0);
}

export function cambiarRuta(c: Record<string, any>) {
  poner((e) => ({ ruta: [...e.ruta.slice(0, -1), { ...e.ruta[e.ruta.length - 1], ...c }] }));
}

/** Mientras esté registrado, el botón "atrás" llama a f en vez de cambiar de pantalla. */
export function interceptarAtras(f: Interceptor) {
  if ((history.state as { fondo?: boolean } | null)?.fondo) history.pushState({ n: leerEstado().ruta.length }, '');
  interceptores.push(f);
  return () => {
    const i = interceptores.lastIndexOf(f);
    if (i >= 0) interceptores.splice(i, 1);
  };
}

let saltarInterceptor = false;
/** Sale de la pantalla actual aunque tenga pasos internos (por ejemplo, después de guardar). */
export function cerrarPantalla() {
  saltarInterceptor = true;
  history.back();
}

export function iniciarNavegacion() {
  // La entrada del fondo queda marcada y encima va siempre una de resguardo: así el botón "atrás" del teléfono
  // tiene dónde caer aunque la app recién se haya abierto (por ejemplo, en las pantallas de ingreso).
  history.replaceState({ fondo: true }, '');
  history.pushState({ n: 0 }, '');
  window.addEventListener('popstate', (ev) => {
    const enFondo = Boolean((ev.state as { fondo?: boolean } | null)?.fondo);
    const tope = interceptores[interceptores.length - 1];
    if (tope && !saltarInterceptor) {
      history.pushState({ n: leerEstado().ruta.length }, '');
      tope();
      return;
    }
    saltarInterceptor = false;
    const e = leerEstado();
    if (e.ruta.length > 1) {
      const y = e.ruta[e.ruta.length - 2]._y ?? 0;
      poner({ ruta: e.ruta.slice(0, -1) });
      if (enFondo) history.pushState({ n: leerEstado().ruta.length }, '');
      requestAnimationFrame(() => window.scrollTo(0, y));
    } else if (enFondo) {
      // En la primera pantalla, "atrás" sale de la app como en cualquier otra.
      history.back();
    }
  });
}
