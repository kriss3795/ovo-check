// Comunicación con el servidor de la app (funciones de Vercel conectadas a la base de datos).
const env = import.meta.env;

/** Dirección de la app en Vercel. En el navegador no hace falta (es la misma); en la app de Android sí. */
const APP = String(env.VITE_APP_URL ?? '').trim().replace(/\/+$/, '');

/** La app y su servidor viven en la misma dirección: siempre hay a quién preguntar. */
export const nubeConfigurada = true;

export class ErrorNube extends Error {
  codigo: string;
  /** true = no se pudo llegar al servidor (sin señal). */
  red: boolean;
  datos: any;
  constructor(codigo: string, mensaje?: string, red = false, datos?: any) {
    super(mensaje ?? codigo);
    this.codigo = codigo;
    this.red = red;
    this.datos = datos;
  }
}

async function pedir(url: string, init: RequestInit, esperaMs: number): Promise<Response> {
  const corte = new AbortController();
  const t = setTimeout(() => corte.abort(), esperaMs);
  try {
    return await fetch(url, { ...init, signal: corte.signal });
  } catch {
    throw new ErrorNube('RED', 'Sin conexión con el servidor', true);
  } finally {
    clearTimeout(t);
  }
}

export async function rpc<T = any>(funcion: string, p: Record<string, unknown>, esperaMs = 25000): Promise<T> {
  const r = await pedir(`${APP}/api/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ f: funcion, p }) }, esperaMs);
  let cuerpo: any = null;
  try {
    cuerpo = await r.json();
  } catch {
    /* respuesta sin JSON */
  }
  if (!r.ok) {
    const msg = String(cuerpo?.message ?? '');
    if (msg.startsWith('OC_')) throw new ErrorNube(msg);
    // 5xx o respuestas de la red intermedia: se trata como "sin conexión" para reintentar después.
    if (r.status >= 500 || r.status === 429 || !cuerpo) throw new ErrorNube('RED', `El servidor no respondió (${r.status})`, true);
    throw new ErrorNube('SERVIDOR', msg || `Error ${r.status}`);
  }
  if (cuerpo && typeof cuerpo === 'object' && typeof cuerpo.error === 'string') {
    throw new ErrorNube(cuerpo.error, undefined, false, cuerpo);
  }
  return cuerpo as T;
}

/** Llama a una función del servidor de la app (correos de recuperación). */
export async function api<T = any>(ruta: string, cuerpo?: unknown): Promise<T> {
  const r = await pedir(
    `${APP}/api/${ruta}`,
    cuerpo === undefined ? { method: 'GET' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) },
    30000,
  );
  let datos: any = null;
  try {
    datos = await r.json();
  } catch {
    /* sin JSON: la función no existe en esta dirección */
  }
  if (!datos) throw new ErrorNube('SIN_CORREO_SERVIDOR');
  if (!r.ok) throw new ErrorNube(String(datos.error ?? 'SERVIDOR'));
  return datos as T;
}

/** Sube una foto. 'cupo' = el servidor no la aceptó por espacio; se reintenta más tarde. */
export async function subirFoto(token: string, granjaId: string, fotoId: string, blob: Blob): Promise<'ok' | 'cupo' | 'sin_registro'> {
  const r = await pedir(
    `${APP}/api/foto?n=${encodeURIComponent(`${granjaId}/${fotoId}.jpg`)}`,
    { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'x-token': token }, body: blob },
    90000,
  );
  if (r.ok) return 'ok';
  let cuerpo: any = null;
  try {
    cuerpo = await r.json();
  } catch {
    /* sin JSON */
  }
  const msg = String(cuerpo?.message ?? '');
  if (msg === 'OC_FOTO_SIN_REGISTRO') return 'sin_registro';
  if (r.status === 507 || msg === 'OC_CUPO') return 'cupo';
  if (msg === 'OC_TOKEN') throw new ErrorNube('OC_TOKEN');
  if (r.status >= 500 || r.status === 429 || !cuerpo) throw new ErrorNube('RED', 'El servidor no respondió', true);
  throw new ErrorNube('FOTO', msg || `Error ${r.status}`);
}

export const urlFoto = (granjaId: string, fotoId: string) => `${APP}/api/foto?n=${encodeURIComponent(`${granjaId}/${fotoId}.jpg`)}`;

const MENSAJES: Record<string, string> = {
  RED: 'Sin conexión. Inténtalo cuando tengas señal.',
  SIN_NUBE: 'Falta conectar el servidor.',
  SIN_DB: 'Falta conectar la base de datos en Vercel (Storage).',
  OC_TOKEN: 'Este teléfono fue desvinculado del plantel.',
  OC_SESION: 'Tu sesión de supervisor venció. Vuelve a entrar con tu clave.',
  OC_CLAVE: 'Clave incorrecta.',
  OC_RECUPERACION: 'El código no es correcto. Revísalo en el correo.',
  OC_RECUPERACION_VENCIDA: 'El código venció o ya se usó. Pide uno nuevo.',
  OC_SIN_CORREO: 'Tu usuario no tiene un correo registrado. Pide a otro supervisor que te ponga una clave temporal.',
  SIN_CORREO_SERVIDOR: 'El envío de correos aún no está configurado. Pide a otro supervisor que te ponga una clave temporal.',
  CORREO_FALLO: 'No se pudo enviar el correo. Inténtalo de nuevo en un momento.',
  SIN_AVISOS_SERVIDOR: 'Las notificaciones aún no están configuradas en el servidor (paso 3 del LEEME).',
  SIN_SUSCRIPCION: 'Este equipo no tiene las notificaciones activadas.',
  AVISO_FALLO: 'No se pudo enviar la notificación. Inténtalo de nuevo.',
  SERVIDOR: 'El servidor no pudo completar la operación. Inténtalo de nuevo.',
  OC_BLOQUEO: 'Demasiados intentos. Espera un rato antes de volver a intentarlo.',
  OC_QR_VENCIDO: 'Ese código QR ya no sirve. Pide uno nuevo.',
  OC_SIN_GRANJA: 'No hay ningún plantel con ese nombre. Escríbelo tal como lo creó tu supervisor.',
  OC_CLAVE_GRANJA: 'Esa no es la clave del plantel. Pídesela a tu supervisor.',
  OC_NOMBRE_USADO: 'Ya existe un plantel con ese nombre. Agrégale algo que lo distinga, por ejemplo la comuna.',
  OC_CLAVE_FACIL: 'Esa clave es muy fácil de adivinar. Elige otra.',
  OC_CORREO_REPETIDO: 'Otro supervisor de este plantel ya usa ese correo.',
  OC_CORREO_CLAVE: 'El correo o la clave no coinciden.',
  OC_SIN_CUENTA: 'No hay ningún supervisor registrado con ese correo.',
  OC_CUPO_GRANJAS: 'Por ahora no quedan cupos para planteles nuevos. Inténtalo más adelante.',
  OC_PERSONA_EXISTE: 'Ya hay una persona activa con ese nombre. Búscala en la lista.',
  OC_CUPO_HOY: 'Hoy ya se crearon muchos planteles nuevos. Inténtalo mañana.',
  OC_LLENO: 'El servidor está lleno. Lo que anotes queda guardado en este teléfono y se enviará solo cuando haya espacio.',
  OC_TOPE_DIA: 'El plantel llegó al máximo de registros por día. Lo pendiente se enviará solo en unas horas.',
  OC_SIN_SUPERVISOR: 'Debe quedar al menos un supervisor activo con clave.',
  OC_CONFLICTO: 'Otra persona cambió la configuración al mismo tiempo. Inténtalo de nuevo.',
  OC_DATOS: 'El servidor no aceptó los datos.',
};

export function mensajeError(e: unknown): string {
  if (e instanceof ErrorNube) return MENSAJES[e.codigo] ?? e.message;
  return e instanceof Error ? e.message : 'Ocurrió un error';
}
