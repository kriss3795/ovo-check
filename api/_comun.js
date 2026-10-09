// Piezas compartidas por las funciones del servidor. (El guion bajo evita que Vercel lo publique como dirección.)
import webpush from 'web-push';

const limpio = (v) => String(v ?? '').trim();
export const URL_BASE = limpio(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/+$/, '');
export const SERVICIO = limpio(process.env.SUPABASE_SERVICE_KEY);
export const VAPID_PUBLICA = limpio(process.env.VAPID_PUBLIC_KEY);
const VAPID_PRIVADA = limpio(process.env.VAPID_PRIVATE_KEY);
const CONTACTO = limpio(process.env.GMAIL_USER) || 'ovocheck.avisos@gmail.com';

export const servidorListo = Boolean(URL_BASE && SERVICIO);
export const avisosListos = Boolean(VAPID_PUBLICA && VAPID_PRIVADA);

/** Cabeceras para Supabase. Las claves nuevas (sb_secret_…) van solo en "apikey"; las antiguas (eyJ…) van además como Bearer. */
export const cabecerasServicio = () => (SERVICIO.startsWith('eyJ') ? { apikey: SERVICIO, Authorization: `Bearer ${SERVICIO}` } : { apikey: SERVICIO });

/** Llama a una función de la base de datos con la clave de servicio. */
export async function rpc(funcion, p = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${funcion}`, {
    method: 'POST',
    headers: { ...cabecerasServicio(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p }),
  });
  const datos = await r.json().catch(() => null);
  if (!r.ok) {
    const e = new Error(String(datos?.message ?? `Supabase respondió ${r.status}`));
    e.codigo = String(datos?.message ?? '').startsWith('OC_') ? datos.message : 'SERVIDOR';
    throw e;
  }
  return datos;
}

/** Los cron de Vercel llegan con esta cabecera si existe la variable CRON_SECRET. */
export function cronAutorizado(req) {
  const secreto = limpio(process.env.CRON_SECRET);
  return !secreto || req.headers?.authorization === `Bearer ${secreto}`;
}

let configurado = false;
/**
 * Envía una notificación a varios teléfonos. Devuelve cuántas salieron.
 * Las suscripciones que el navegador ya dio de baja se borran de la base de datos.
 */
export async function notificar(suscripciones, aviso) {
  if (!avisosListos || !suscripciones?.length) return 0;
  if (!configurado) {
    webpush.setVapidDetails(`mailto:${CONTACTO}`, VAPID_PUBLICA, VAPID_PRIVADA);
    configurado = true;
  }
  const cuerpo = JSON.stringify({ titulo: aviso.titulo, texto: aviso.texto, etiqueta: aviso.etiqueta ?? 'ovocheck', url: aviso.url ?? '/' });
  const vistos = new Set();
  const muertas = [];
  let enviadas = 0;
  await Promise.all(
    suscripciones.map(async (s) => {
      if (!s?.endpoint || vistos.has(s.endpoint)) return;
      vistos.add(s.endpoint);
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, { TTL: 86400, urgency: aviso.urgente ? 'high' : 'normal' });
        enviadas++;
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410) muertas.push(s.endpoint);
        else console.error('No se pudo notificar', e?.statusCode, e?.message);
      }
    }),
  );
  if (muertas.length) await rpc('oc_suscripciones_borrar', { endpoints: muertas }).catch(() => {});
  return enviadas;
}

const CATEGORIAS = { agua: 'agua', alimento: 'alimento', aves: 'aves', equipo: 'equipos', instalacion: 'galpón', otro: 'otro' };

/** Texto de la notificación para un problema recién informado. */
export function textoDeRegistro(r) {
  const lugar = r.galpon || 'Plantel';
  if (r.tipo === 'problema') {
    return { titulo: `${lugar}: problema de ${CATEGORIAS[r.categoria] ?? 'otro tipo'}`, texto: `${r.nota || 'Sin descripción'}. Informó ${r.persona}.` };
  }
  if ((r.flags ?? []).includes('retrocede')) {
    return { titulo: `${lugar}: revisar ${r.tarea}`, texto: `La lectura es menor que la anterior. Registró ${r.persona}.` };
  }
  if ((r.flags ?? []).includes('ilogico')) {
    const avisos = Array.isArray(r.avisos) ? r.avisos : [];
    const texto = avisos.length ? `${String(avisos[0]).slice(0, 150)}${avisos.length > 1 ? ` (y ${avisos.length - 1} más)` : ''}.` : 'Hay una medición fuera de lo lógico.';
    return { titulo: `${lugar}: revisar ${r.tarea}`, texto: `${texto} Registró ${r.persona}.` };
  }
  if ((r.flags ?? []).includes('no_calza')) {
    return { titulo: `${lugar}: revisar ${r.tarea}`, texto: `Las aves vivas anotadas no calzan con las del registro anterior. Registró ${r.persona}.` };
  }
  return { titulo: `${lugar}: problema en ${r.tarea}`, texto: `${r.nota || 'Sin descripción'}. Informó ${r.persona}.` };
}

/** Avisa a los supervisores los problemas que aún no se han notificado (de una granja o de todas). */
export async function avisarPendientes(token) {
  const grupos = await rpc('oc_avisos_pendientes', token ? { token } : {});
  let enviadas = 0;
  for (const g of grupos ?? []) {
    for (const r of g.registros ?? []) {
      // A quien informó el problema no hace falta avisarle.
      const destino = (g.suscripciones ?? []).filter((s) => s.usuario_id !== r.usuario_id);
      const t = textoDeRegistro(r);
      enviadas += await notificar(destino, { ...t, etiqueta: `reg-${r.id}`, urgente: true });
    }
  }
  // Seguridad: cada equipo nuevo que entra a un plantel se avisa a sus supervisores.
  enviadas += await avisarEquipos().catch(() => 0);
  return enviadas;
}

/** Avisa a los supervisores los equipos que entraron al plantel y aún no se les han notificado. */
export async function avisarEquipos() {
  const grupos = await rpc('oc_equipos_por_avisar', {});
  let enviadas = 0;
  for (const g of grupos ?? []) {
    for (const e of g.equipos ?? []) {
      // Al supervisor que acaba de entrar desde ese equipo no hace falta avisarle.
      const destino = (g.suscripciones ?? []).filter((s) => s.usuario_id !== e.usuario_id);
      enviadas += await notificar(destino, {
        titulo: 'Entró un equipo nuevo al plantel',
        texto: `${g.granja}: ${e.persona ? `${e.persona} entró desde` : 'se sumó'} ${e.nombre || 'un equipo'}. Si no lo conoces, desvincúlalo desde la app.`,
        etiqueta: `equipo-${e.id}`,
        urgente: true,
      });
    }
  }
  return enviadas;
}

/** Las tareas programadas hacen su trabajo una sola vez por turno, aunque su dirección se abra muchas veces. */
export async function tocaTurno(nombre, horas) {
  const r = await rpc('oc_turno', { nombre, horas });
  return Boolean(r?.toca);
}
