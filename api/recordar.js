// Recordatorio de tareas sin registrar. Vercel lo ejecuta dos veces al día (ver vercel.json):
// después del mediodía para las tareas de la mañana y en la noche para las de la tarde.
// Al supervisor le llega el resumen por galpón; a los encargados, que les quedan tareas.
import { avisarPendientes, avisosListos, cronAutorizado, notificar, rpc, servidorListo, tocaTurno } from './_comun.js';

const NOMBRE = { manana: 'de la mañana', tarde: 'de la tarde' };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!cronAutorizado(req)) return res.status(401).json({ error: 'No autorizado' });
  if (!servidorListo || !avisosListos) return res.status(503).json({ error: 'Faltan variables en Vercel (SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)' });
  const bloque = req.query?.bloque === 'tarde' ? 'tarde' : 'manana';
  try {
    // De paso se avisan los problemas que hayan quedado sin notificar.
    let enviadas = await avisarPendientes();
    // El recordatorio sale una sola vez por turno, aunque alguien abra esta dirección a propósito muchas veces.
    if (!(await tocaTurno(`recordar-${bloque}`, 8))) return res.status(200).json({ ok: true, bloque, repetido: true, enviadas });
    const granjas = await rpc('oc_pendientes_del_dia', { bloque });
    for (const g of granjas ?? []) {
      const detalle = g.galpones.map((x) => `${x.galpon}: ${x.n}`).join(', ');
      const plural = g.total === 1 ? 'tarea' : 'tareas';
      enviadas += await notificar(g.supervisores, {
        titulo: `${g.total} ${plural} ${NOMBRE[bloque]} sin registrar`,
        texto: `${g.granja}. ${detalle}`,
        etiqueta: `pendientes-${bloque}`,
      });
      // Operarios: se avisa a los encargados de los galpones con pendientes. Si un galpón no tiene encargado, a todos.
      const sinEncargado = g.galpones.some((x) => !x.encargados?.length);
      const encargados = new Set(g.galpones.flatMap((x) => x.encargados ?? []));
      const operarios = sinEncargado ? g.operarios : g.operarios.filter((s) => encargados.has(s.usuario_id));
      for (const s of operarios) {
        const mios = g.galpones.filter((x) => !x.encargados?.length || x.encargados.includes(s.usuario_id));
        const n = mios.reduce((t, x) => t + x.n, 0);
        if (!n) continue;
        enviadas += await notificar([s], {
          titulo: `Te ${n === 1 ? 'queda 1 tarea' : `quedan ${n} tareas`} ${NOMBRE[bloque]}`,
          texto: mios.map((x) => `${x.galpon}: ${x.n}`).join(', '),
          etiqueta: `pendientes-${bloque}`,
        });
      }
    }
    // Una vez al día: teléfonos que llevan más de un día sin conectarse y con registros sin enviar.
    // Lo que tienen guardado solo existe en ese teléfono; si se pierde o se borra la app, se pierde.
    if (bloque === 'manana') {
      for (const g of (await rpc('oc_telefonos_atrasados')) ?? []) {
        for (const t of g.telefonos ?? []) {
          const quien = t.persona ? `El teléfono de ${t.persona}` : `Un teléfono (${t.nombre || 'sin nombre'})`;
          enviadas += await notificar(g.supervisores, {
            titulo: `${t.pendientes} ${t.pendientes === 1 ? 'registro sin enviar' : 'registros sin enviar'} en un teléfono`,
            texto: `${g.granja}: ${quien} no se conecta hace ${t.dias} ${t.dias === 1 ? 'día' : 'días'}. Esos datos solo están en ese teléfono: hay que abrir la app con internet.`,
            etiqueta: 'sin-enviar',
          });
        }
      }
    }
    // Al cierre del día: recordar a los supervisores que descarguen el respaldo de lo registrado hoy.
    if (bloque === 'tarde') {
      // Con el servidor al día solo llegan los planteles con registros de hoy y sin respaldo; con uno anterior, todos los que están en uso.
      const lista = await rpc('oc_respaldo_diario').catch(() => rpc('oc_respaldo_mensual').catch(() => []));
      for (const g of lista ?? []) {
        enviadas += await notificar(g.supervisores, {
          titulo: 'Respalda la información de hoy',
          texto: `${g.granja}${g.registros ? `: ${g.registros} ${g.registros === 1 ? 'registro' : 'registros'} hoy` : ''}. Abre la app, toca "Descargar respaldo" y guarda el archivo fuera del teléfono.`,
          etiqueta: 'respaldo',
        });
      }
    }
    return res.status(200).json({ ok: true, bloque, granjas: granjas?.length ?? 0, enviadas });
  } catch (e) {
    return res.status(502).json({ error: String(e?.message ?? e) });
  }
}
