// Puerta de entrada de la app a la base de datos. POST { f: 'oc_...', p: {...} }.
// Solo se pueden llamar las funciones de esta lista; cada una valida por su cuenta quién pide y qué puede hacer.
import { cabecerasDe, cuerpoJson, dbLista, llamar } from './_db.js';

const PUBLICAS = new Set([
  'oc_crear_granja', 'oc_buscar_granja', 'oc_unirse', 'oc_entrar_supervisor', 'oc_recuperar_correo', 'oc_login', 'oc_crear_pin',
  'oc_cambiar_clave', 'oc_recuperar', 'oc_guardar_config', 'oc_registrar', 'oc_sync', 'oc_registros', 'oc_revisar', 'oc_salir',
  'oc_permitir_prueba', 'oc_autorizar_operario', 'oc_saldos', 'oc_bitacora_ver', 'oc_admin', 'oc_suscribir', 'oc_invitacion', 'oc_unirse_qr', 'oc_qr_pedir', 'oc_qr_aprobar', 'oc_qr_esperar', 'oc_anonimizar', 'oc_desuscribir',
]);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ message: 'METODO' });
  if (!dbLista) return res.status(503).json({ message: 'SIN_DB' });
  const cuerpo = await cuerpoJson(req);
  const f = String(cuerpo?.f ?? '');
  if (!PUBLICAS.has(f)) return res.status(404).json({ code: '42501', message: 'OC_NO_PERMITIDO' });
  try {
    const r = await llamar(f, cuerpo.p ?? {}, cabecerasDe(req));
    return res.status(200).json(r);
  } catch (e) {
    if (String(e.codigo).startsWith('OC_')) return res.status(400).json({ message: e.codigo });
    console.error(f, e.message);
    return res.status(503).json({ message: 'SERVIDOR' });
  }
}
