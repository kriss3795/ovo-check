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
    return res.status(200).json({ ok: true, bloque, granjas: granjas?.length ?? 0, enviadas });
  } catch (e) {
    return res.status(502).json({ error: String(e?.message ?? e) });
  }
}
