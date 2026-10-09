// Envío de correos desde la cuenta de Gmail de la app. (El guion bajo evita que Vercel lo publique como dirección.)
import nodemailer from 'nodemailer';

const limpio = (v) => String(v ?? '').trim();
export const USUARIO = limpio(process.env.GMAIL_USER);
const CLAVE = limpio(process.env.GMAIL_APP_PASSWORD).replace(/\s+/g, '');
export const correoListo = Boolean(USUARIO && CLAVE);

export function transporte() {
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

export const escapar = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
