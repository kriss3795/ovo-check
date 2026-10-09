export function uid(): string {
  const c = globalThis.crypto as Crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Mismo cálculo que hace el servidor: sha256("<id>:<pin>") en hexadecimal. */
export async function hashPin(usuarioId: string, pin: string): Promise<string> {
  const datos = new TextEncoder().encode(`${usuarioId}:${pin}`);
  const h = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const COMUNES = new Set([
  '123456', '1234567', '12345678', '123456789', '1234567890', '654321', '112233', '121212', '123123', 'abc123', 'abcdef', 'qwerty',
  'qwertyuiop', 'asdfgh', 'password', 'contrasena', 'clave123', 'clave1234', 'claveplantel', 'plantel', 'plantel123', 'granja',
  'granja123', 'gallina', 'gallinas', 'huevos', 'huevo123', 'huevos123', 'ovocheck', 'operario', 'operarios', 'supervisor', 'avicola',
  'postura', 'galpon', 'galpon1', 'galpones',
]);
/** Texto sin mayúsculas, tildes ni espacios (igual que lo compara el servidor). */
export const normalizar = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
/** Claves que cualquiera adivinaría: muy comunes, repetidas, en secuencia o iguales a un nombre conocido. */
export function claveDebil(clave: string, ...nombres: string[]): boolean {
  const c = normalizar(clave);
  if (COMUNES.has(c) || /^(.)\1+$/.test(c)) return true;
  if ('01234567890123456789'.includes(c) || '98765432109876543210'.includes(c) || 'abcdefghijklmnopqrstuvwxyz'.includes(c)) return true;
  return nombres.some((n) => normalizar(n).length >= 3 && normalizar(n) === c);
}

const p2 = (n: number) => String(n).padStart(2, '0');

export function fechaLocal(d = new Date()): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return fechaLocal(new Date(a, m - 1, d + dias));
}

export function diasEntre(desde: string, hasta: string): number {
  const f = (s: string) => {
    const [a, m, d] = s.split('-').map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((f(hasta) - f(desde)) / 86400000);
}

export function diaSemana(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(a, m - 1, d).getDay();
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const DIAS_CORTOS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
export const nombreDia = (n: number) => DIAS[n];

/** "viernes 9 de octubre" */
export function fechaLarga(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const dt = new Date(a, m - 1, d);
  return `${DIAS[dt.getDay()]} ${d} de ${MESES[m - 1]}`;
}

/** "09-10" */
export function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.split('-');
  return `${d}-${m}`;
}

export function fechaRelativa(fecha: string): string {
  const dif = diasEntre(fecha, fechaLocal());
  if (dif === 0) return 'Hoy';
  if (dif === 1) return 'Ayer';
  return fechaLarga(fecha);
}

export function hora(iso: string | number | Date): string {
  const d = new Date(iso);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function fechaHora(iso: string | number | Date): string {
  const d = new Date(iso);
  return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

export function haceCuanto(iso: string | number | null | undefined): string {
  if (!iso) return 'nunca';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'recién';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} días`;
}

export function duracion(seg: number): string {
  if (seg < 60) return `${Math.round(seg)} s`;
  if (seg < 3600) return `${Math.round(seg / 60)} min`;
  return `${(seg / 3600).toFixed(1).replace('.', ',')} h`;
}

export function num(v: number | null | undefined, decimales = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return 'sin dato';
  return v.toLocaleString('es-CL', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/** Distancia en metros entre dos puntos. */
export function distancia(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const r = (g: number) => (g * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function vibrar(patron: number | number[]) {
  try {
    navigator.vibrate?.(patron);
  } catch {
    /* sin vibración */
  }
}

export function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}

export const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
