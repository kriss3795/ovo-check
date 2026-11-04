// Envía por correo el código para recuperar la clave de un supervisor.
// Funciona como "Serverless Function" de Vercel. Variables de entorno necesarias (en Vercel):
//   DATABASE_URL           base de datos (la crea Vercel > Storage > Neon)
//   GMAIL_USER             cuenta de Gmail que envía los correos
//   GMAIL_APP_PASSWORD     "contraseña de aplicación" de esa cuenta (16 letras)
import { USUARIO, correoListo, escapar, transporte } from './_correo.js';

import { dbLista, llamar } from './_db.js';

const limpio = (v) => String(v ?? '').trim();

const ocultar = (correo) => {
  const [a, b] = correo.split('@');
  return `${a.slice(0, 2)}${'*'.repeat(Math.max(2, a.length - 2))}@${b}`;
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const servidorListo = dbLista;

  // Diagnóstico: ¿está configurado el envío? Con ?probar=1 además se conecta a Gmail para comprobar la clave.
  if (req.method === 'GET') {
    const estado = { servidor: servidorListo, correo: correoListo, ok: servidorListo && correoListo, detalle: '' };
    if (!servidorListo) estado.detalle = 'Falta conectar la base de datos en Vercel > Storage';
    else if (!correoListo) estado.detalle = 'Faltan las variables GMAIL_USER y GMAIL_APP_PASSWORD en Vercel';
    else if (String(req.query?.probar ?? '') === '1') {
      try {
        await transporte().verify();
        estado.detalle = `Los correos salen desde ${USUARIO}`;
      } catch (e) {
        estado.ok = false;
        estado.detalle = `Gmail rechazó la conexión: revisa GMAIL_USER y GMAIL_APP_PASSWORD (${e.code || e.message})`;
      }
    }
    return res.status(200).json(estado);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'METODO' });
  if (!servidorListo || !correoListo) return res.status(503).json({ error: 'SIN_CORREO_SERVIDOR' });

  let cuerpo = req.body;
  if (typeof cuerpo === 'string') {
    try {
      cuerpo = JSON.parse(cuerpo);
    } catch {
      cuerpo = {};
    }
  }
  // Dos caminos: desde un equipo que ya está en el plantel (token + usuario) o solo con el correo del supervisor.
  const token = limpio(cuerpo?.token);
  const usuario_id = limpio(cuerpo?.usuario_id);
  const correo = limpio(cuerpo?.correo).toLowerCase();
  if (!(token && usuario_id) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return res.status(400).json({ error: 'OC_DATOS' });
  const pedido = token && usuario_id ? { token, usuario_id } : { correo };

  let datos;
  try {
    datos = await llamar('oc_recuperacion_pedir', pedido, {});
  } catch (e) {
    const c = String(e?.codigo ?? '');
    return res.status(c.startsWith('OC_') ? 400 : 502).json({ error: c.startsWith('OC_') ? c : 'SERVIDOR' });
  }
  if (datos?.error) return res.status(400).json({ error: datos.error });

  const codigo = `${datos.codigo.slice(0, 3)} ${datos.codigo.slice(3)}`;
  try {
    await transporte().sendMail({
      from: `"Ovo Check" <${USUARIO}>`,
      to: datos.correo,
      subject: `Ovo Check: tu código es ${codigo}`,
      text:
        `Hola ${datos.nombre}:\n\n` +
        `Tu código para elegir una clave nueva en Ovo Check (${datos.granja}) es:\n\n    ${codigo}\n\n` +
        `Vence en ${datos.minutos} minutos y sirve una sola vez.\n` +
        `Si no lo pediste, no hagas nada: tu clave sigue siendo la misma.\n`,
      html:
        `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1c282d">` +
        `<p style="font-size:16px">Hola ${escapar(datos.nombre)}:</p>` +
        `<p style="font-size:16px">Tu código para elegir una clave nueva en Ovo Check (${escapar(datos.granja)}) es:</p>` +
        `<p style="font-size:34px;font-weight:bold;letter-spacing:4px;background:#e2f2e8;color:#075029;padding:16px;border-radius:10px;text-align:center">${codigo}</p>` +
        `<p style="font-size:15px;color:#56646a">Vence en ${datos.minutos} minutos y sirve una sola vez. Si no lo pediste, no hagas nada: tu clave sigue siendo la misma.</p>` +
        `</div>`,
    });
  } catch (e) {
    console.error('No se pudo enviar el correo', e?.code, e?.message);
    return res.status(502).json({ error: 'CORREO_FALLO' });
  }
  return res.status(200).json({ ok: true, correo: ocultar(datos.correo), minutos: datos.minutos });
}
