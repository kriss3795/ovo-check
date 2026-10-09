// Tarea diaria (Vercel la ejecuta sola, ver vercel.json):
//  1. Borra de la nube las fotos que ya cumplieron su plazo (30 días por defecto). Los números no se tocan.
//  2. Los lunes recuerda a los supervisores que descarguen las fotos que se borrarán esa semana.
//  3. De paso mantiene despierto el proyecto gratuito de Supabase.
import { URL_BASE, cabecerasServicio, avisarPendientes, avisosListos, cronAutorizado, notificar, rpc, servidorListo, tocaTurno } from './_comun.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!cronAutorizado(req)) return res.status(401).json({ error: 'No autorizado' });
  if (!servidorListo) return res.status(503).json({ error: 'Falta la variable SUPABASE_SERVICE_KEY en Vercel' });
  let borradas = 0;
  let dias = null;
  let avisos = 0;
  try {
    // El recordatorio va antes de borrar, para que alcancen a descargar.
    if (avisosListos) {
      avisos += await avisarPendientes();
      const esLunes = new Date().getUTCDay() === 1 || req.query?.recordar === '1';
      if (esLunes && (await tocaTurno('fotos-semana', 20))) {
        for (const g of (await rpc('oc_fotos_por_vencer')) ?? []) {
          avisos += await notificar(g.supervisores, {
            titulo: `${g.fotos} ${g.fotos === 1 ? 'foto se borra' : 'fotos se borran'} esta semana`,
            texto: `${g.granja}: la nube guarda las fotos ${g.dias} días. Descárgalas en Historial si quieres conservarlas.`,
            etiqueta: 'fotos',
          });
        }
      }
    }
    for (let vuelta = 0; vuelta < 8; vuelta++) {
      const d = await rpc('oc_fotos_vencidas', { limite: 500 });
      dias = d.dias;
      if (!d.nombres?.length) break;
      const b = await fetch(`${URL_BASE}/storage/v1/object/ovocheck`, {
        method: 'DELETE',
        headers: { ...cabecerasServicio(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: d.nombres }),
      });
      if (!b.ok) return res.status(502).json({ error: 'No se pudieron borrar las fotos', detalle: await b.text(), borradas });
      borradas += d.nombres.length;
    }
  } catch (e) {
    return res.status(502).json({ error: String(e?.message ?? e), borradas });
  }
  return res.status(200).json({ ok: true, borradas, dias, avisos });
}
