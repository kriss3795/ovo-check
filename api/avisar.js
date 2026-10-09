// Notificaciones al teléfono.
//   GET  -> entrega la clave pública que el navegador necesita para suscribirse.
//   POST -> { token }               avisa a los supervisores los problemas recién informados en esa granja
//           { token, prueba: true } envía una notificación de prueba al teléfono que la pide
// Variables en Vercel: VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY (además de las de Supabase).
import { VAPID_PUBLICA, avisarPendientes, avisosListos, notificar, rpc, servidorListo } from './_comun.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const listo = servidorListo && avisosListos;
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: listo,
      publica: listo ? VAPID_PUBLICA : '',
      detalle: listo ? 'Configuradas' : !servidorListo ? 'Falta la variable SUPABASE_SERVICE_KEY en Vercel' : 'Faltan las variables VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en Vercel',
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'METODO' });
  if (!listo) return res.status(503).json({ error: 'SIN_AVISOS_SERVIDOR' });

  let cuerpo = req.body;
  if (typeof cuerpo === 'string') {
    try {
      cuerpo = JSON.parse(cuerpo);
    } catch {
      cuerpo = {};
    }
  }
  const token = String(cuerpo?.token ?? '').trim();
  if (!token) return res.status(400).json({ error: 'OC_DATOS' });

  try {
    if (cuerpo.prueba) {
      const s = await rpc('oc_suscripcion_propia', { token });
      if (!s) return res.status(400).json({ error: 'SIN_SUSCRIPCION' });
      const n = await notificar([s], { titulo: 'Ovo Check', texto: 'Las notificaciones funcionan en este equipo.', etiqueta: 'prueba' });
      return res.status(n ? 200 : 502).json(n ? { ok: true } : { error: 'AVISO_FALLO' });
    }
    const enviadas = await avisarPendientes(token);
    return res.status(200).json({ ok: true, enviadas });
  } catch (e) {
    return res.status(e.codigo === 'OC_TOKEN' ? 400 : 502).json({ error: e.codigo ?? 'SERVIDOR' });
  }
}
