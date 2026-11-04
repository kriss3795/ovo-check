// Piezas compartidas por las funciones del servidor. (El guion bajo evita que Vercel lo publique como dirección.)
import webpush from 'web-push';

import { dbLista, llamar } from './_db.js';

const limpio = (v) => String(v ?? '').trim();
export const VAPID_PUBLICA = limpio(process.env.VAPID_PUBLIC_KEY);
const VAPID_PRIVADA = limpio(process.env.VAPID_PRIVATE_KEY);
const CONTACTO = limpio(process.env.GMAIL_USER) || 'ovocheck.avisos@gmail.com';

export const servidorListo = dbLista;
export const avisosListos = Boolean(VAPID_PUBLICA && VAPID_PRIVADA);
export const FALTA_DB = 'Falta conectar la base de datos en Vercel > Storage';

/** Llama a una función de la base de datos (con permisos del servidor). */
export async function rpc(funcion, p = {}) {
  return llamar(funcion, p, {});
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
  if ((r.flags ?? []).includes('gps_apagado') && !(r.flags ?? []).includes('omitida') && !r.nota) {
    // Una sola notificación por persona y día: las siguientes la reemplazan en vez de sumarse.
    return {
      titulo: `${r.persona} tiene la ubicación apagada`,
      texto: `Registró ${r.tarea ?? 'un dato'} en ${lugar} sin ubicación. Pídele que active la ubicación del teléfono.`,
      etiqueta: `gps-${r.usuario_id ?? r.persona}`,
    };
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
      enviadas += await notificar(destino, { etiqueta: `reg-${r.id}`, urgente: true, ...t });
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
