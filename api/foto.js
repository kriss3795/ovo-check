// Fotos de respaldo, guardadas en la base de datos.
//   POST /api/foto?n=<plantel>/<foto>.jpg  (cabecera x-token)  sube una foto tomada con la app
//   GET  /api/foto?n=<plantel>/<foto>.jpg                       entrega la foto
// Los nombres llevan dos códigos al azar imposibles de adivinar; sin ellos no se puede pedir ninguna foto.
import { ErrorDb, cabecerasDe, consultar, cuerpoCrudo, dbLista, llamar } from './_db.js';

const NOMBRE = /^[0-9a-f-]{36}\/[0-9a-z-]{36,60}\.jpg$/;

export default async function handler(req, res) {
  const nombre = String(req.query?.n ?? '');
  if (!dbLista) return res.status(503).json({ message: 'SIN_DB' });
  if (!NOMBRE.test(nombre)) return res.status(400).json({ message: 'OC_DATOS' });
  if (req.method === 'GET') {
    try {
      const r = await consultar('select datos from oc_fotos where nombre = $1', [nombre]);
      if (!r.rows.length) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(404).json({ message: 'OC_SIN_FOTO' });
      }
      res.setHeader('Content-Type', 'image/jpeg');
      // La foto nunca cambia: el navegador y la red de Vercel la guardan un año (así la base no la entrega dos veces).
      res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
      return res.status(200).send(r.rows[0].datos);
    } catch {
      return res.status(503).json({ message: 'SERVIDOR' });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ message: 'METODO' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const datos = await cuerpoCrudo(req, 260000);
    const r = await llamar('oc_foto_guardar', { token: String(req.headers['x-token'] ?? ''), nombre }, cabecerasDe(req), datos);
    if (r?.error) return res.status(r.error === 'OC_CUPO' ? 507 : 409).json({ message: r.error });
    return res.status(200).json(r);
  } catch (e) {
    if (e instanceof ErrorDb && e.codigo.startsWith('OC_')) return res.status(e.codigo === 'OC_TOKEN' ? 401 : 400).json({ message: e.codigo });
    return res.status(503).json({ message: 'SERVIDOR' });
  }
}
