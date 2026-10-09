// Envía por correo el código para recuperar la clave de un supervisor.
// Funciona como "Serverless Function" de Vercel. Variables de entorno necesarias (en Vercel):
//   VITE_SUPABASE_URL      dirección del proyecto de Supabase
//   SUPABASE_SERVICE_KEY   clave secreta de Supabase (service_role). Nunca va en el teléfono.
//   GMAIL_USER             cuenta de Gmail que envía los correos
//   GMAIL_APP_PASSWORD     "contraseña de aplicación" de esa cuenta (16 letras)
import nodemailer from 'nodemailer';

const limpio = (v) => String(v ?? '').trim();
const URL_BASE = limpio(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/+$/, '');
const SERVICIO = limpio(process.env.SUPABASE_SERVICE_KEY);
const USUARIO = limpio(process.env.GMAIL_USER);
const CLAVE = limpio(process.env.GMAIL_APP_PASSWORD).replace(/\s+/g, '');

function transporte() {
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user: USUARIO, pass: CLAVE },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: process.env.SMTP_SIN_TLS ? { rejectUnauthorized: false } : undefined,
    ignoreTLS: Boolean(process.env.SMTP_SIN_TLS),
  });
}

const ocultar = (correo) => {
  const [a, b] = correo.split('@');
  return `${a.slice(0, 2)}${'*'.repeat(Math.max(2, a.length - 2))}@${b}`;
};

const escapar = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const servidorListo = Boolean(URL_BASE && SERVICIO);
  const correoListo = Boolean(USUARIO && CLAVE);

  // Diagnóstico: ¿está configurado el envío? Con ?probar=1 además se conecta a Gmail para comprobar la clave.
  if (req.method === 'GET') {
    const estado = { servidor: servidorListo, correo: correoListo, ok: servidorListo && correoListo, detalle: '' };
    if (!servidorListo) estado.detalle = 'Falta la variable SUPABASE_SERVICE_KEY en Vercel';
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
    const r = await fetch(`${URL_BASE}/rest/v1/rpc/oc_recuperacion_pedir`, {
      method: 'POST',
      headers: { ...(SERVICIO.startsWith('eyJ') ? { apikey: SERVICIO, Authorization: `Bearer ${SERVICIO}` } : { apikey: SERVICIO }), 'Content-Type': 'application/json' },
      body: JSON.stringify({ p: pedido }),
    });
    datos = await r.json();
    if (!r.ok) {
      const msg = String(datos?.message ?? '');
      return res.status(400).json({ error: msg.startsWith('OC_') ? msg : 'SERVIDOR' });
    }
  } catch {
    return res.status(502).json({ error: 'SERVIDOR' });
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
