// Notificaciones en el teléfono (Web Push) e instalación de la app en la pantalla de inicio.
import { ErrorNube, api, rpc } from './nube';
import { leerEstado, poner } from './estado';

const CLAVE = 'oc_avisos';

export const avisosDisponibles = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** iPhone y iPad solo permiten notificaciones si la app está agregada a la pantalla de inicio. */
export const esIosSinInstalar = () =>
  /iPhone|iPad|iPod/i.test(navigator.userAgent) && !matchMedia('(display-mode: standalone)').matches && !(navigator as any).standalone;

function leerEstadoAvisos(): 'no_disponible' | 'bloqueado' | 'apagado' | 'activo' {
  if (!avisosDisponibles()) return 'no_disponible';
  if (Notification.permission === 'denied') return 'bloqueado';
  let encendido = false;
  try {
    encendido = localStorage.getItem(CLAVE) === '1';
  } catch {
    /* sin almacenamiento */
  }
  return Notification.permission === 'granted' && encendido ? 'activo' : 'apagado';
}

function aBytes(base64url: string): Uint8Array {
  const b = atob(base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function registro(): Promise<ServiceWorkerRegistration> {
  const r = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((ok) => setTimeout(() => ok(null), 8000))]);
  if (!r) throw new Error('La app aún se está instalando en este equipo. Cierra y vuelve a abrir Ovo Check.');
  return r;
}

/** Inscribe este equipo en el servidor con la persona que está dentro. */
async function suscribir() {
  const e = leerEstado();
  if (!e.dispositivo || !e.usuario) return;
  const reg = await registro();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const r = await api<{ publica: string }>('avisar');
    if (!r.publica) throw new ErrorNube('SIN_AVISOS_SERVIDOR');
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(r.publica) as BufferSource });
  }
  const j = sub.toJSON();
  await rpc('oc_suscribir', {
    token: e.dispositivo.token,
    usuario_id: e.usuario.id,
    sesion: sesionActual(),
    endpoint: j.endpoint,
    p256dh: j.keys?.p256dh,
    auth: j.keys?.auth,
  });
}

let sesionActual: () => string | null = () => null;
/** La sesión de supervisor vive en app.ts; se entrega aquí para no cruzar los módulos. */
export function conectarSesion(f: () => string | null) {
  sesionActual = f;
}

export function iniciarAvisos() {
  poner({ avisos: leerEstadoAvisos() });
  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    oferta = ev;
    poner({ instalable: true });
  });
  window.addEventListener('appinstalled', () => {
    oferta = null;
    poner({ instalable: false });
  });
}

/** Pide permiso y activa las notificaciones. Debe llamarse desde un toque del usuario. */
export async function activarAvisos(): Promise<boolean> {
  if (!avisosDisponibles()) return false;
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    poner({ avisos: leerEstadoAvisos() });
    return false;
  }
  await suscribir();
  try {
    localStorage.setItem(CLAVE, '1');
  } catch {
    /* sin almacenamiento */
  }
  poner({ avisos: 'activo' });
  return true;
}

/** Al entrar una persona, el equipo queda inscrito a su nombre (si las notificaciones están activas). */
export function refrescarAvisos() {
  if (leerEstadoAvisos() !== 'activo') return;
  suscribir().catch(() => {});
}

export async function desactivarAvisos() {
  const e = leerEstado();
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento */
  }
  poner({ avisos: leerEstadoAvisos() });
  try {
    const reg = await registro();
    await (await reg.pushManager.getSubscription())?.unsubscribe();
  } catch {
    /* ya no había suscripción */
  }
  if (e.dispositivo) await rpc('oc_desuscribir', { token: e.dispositivo.token }).catch(() => {});
}

/** Deja de enviar a este equipo sin tocar el permiso (al salir un supervisor). */
export function soltarAvisos() {
  const e = leerEstado();
  if (e.dispositivo && leerEstadoAvisos() === 'activo') rpc('oc_desuscribir', { token: e.dispositivo.token }).catch(() => {});
}

export async function probarAviso() {
  const e = leerEstado();
  await suscribir();
  await api('avisar', { token: e.dispositivo!.token, prueba: true });
}

/** Avisa a los supervisores que llegó un problema. No espera respuesta ni falla el envío de datos. */
export function avisarProblema() {
  const e = leerEstado();
  if (e.dispositivo) api('avisar', { token: e.dispositivo.token }).catch(() => {});
}

// ------------------------------------------------------------------ instalar en la pantalla de inicio
let oferta: any = null;

export async function instalarApp(): Promise<boolean> {
  if (!oferta) return false;
  oferta.prompt();
  const r = await oferta.userChoice.catch(() => null);
  oferta = null;
  poner({ instalable: false });
  return r?.outcome === 'accepted';
}

export const estaInstalada = () => matchMedia('(display-mode: standalone)').matches || Boolean((navigator as any).standalone);
