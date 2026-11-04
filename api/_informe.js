// Informe diario por correo: lo registrado hoy en cada galpón, en una tabla simple que se lee en el teléfono.
import { correoListo, escapar, transporte, USUARIO } from './_correo.js';
import { rpc } from './_comun.js';

const n = (v, d = 0) => (v == null ? '–' : Number(v).toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d }));
const APP = (process.env.APP_URL || 'https://ovo-check.vercel.app').replace(/\/$/, '');

export function armarInforme(g) {
  const fecha = new Date(`${g.fecha}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const filas = (g.galpones ?? []).map((x) => {
    const postura = x.huevos != null && x.aves ? (x.huevos * 100) / x.aves : null;
    const mort = x.muertas != null && x.aves ? (x.muertas * 100) / x.aves : null;
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid #e6ebe9;text-align:left"><b>${escapar(x.nombre ?? 'Galpón')}</b></td>
      <td style="padding:8px;border-bottom:1px solid #e6ebe9">${n(x.aves)}</td>
      <td style="padding:8px;border-bottom:1px solid #e6ebe9">${n(x.huevos)}</td>
      <td style="padding:8px;border-bottom:1px solid #e6ebe9">${postura == null ? '–' : `${n(postura, 1)} %`}</td>
      <td style="padding:8px;border-bottom:1px solid #e6ebe9">${n(x.muertas)}${mort == null ? '' : ` (${n(mort, 2)} %)`}</td>
      <td style="padding:8px;border-bottom:1px solid #e6ebe9">${n(x.ml)}</td>
      <td style="padding:8px;border-bottom:1px solid #e6ebe9">${n(x.g)}</td>
      <td style="padding:8px;border-bottom:1px solid #e6ebe9;${x.alertas ? 'color:#b42318;font-weight:700' : ''}">${n(x.alertas)}</td>
    </tr>`;
  });
  const alertas = (g.galpones ?? []).reduce((t, x) => t + (x.alertas ?? 0), 0);
  const th = (t) => `<th style="padding:8px;background:#0a6b3b;color:#fff;font-size:13px;text-align:right">${t}</th>`;
  const html = `<div style="font-family:Arial,sans-serif;color:#1c282d;max-width:720px">
    <h2 style="margin:0 0 4px">${escapar(g.granja)}</h2>
    <p style="margin:0 0 16px;color:#56646a">Informe del ${escapar(fecha)}${alertas ? `. <b style="color:#b42318">${alertas} ${alertas === 1 ? 'alerta' : 'alertas'} por revisar</b>` : '. Sin alertas'}</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;text-align:right">
      <tr>${th('<span style="float:left">Galpón</span>')}${th('Aves')}${th('Huevos')}${th('Postura')}${th('Muertas')}${th('Agua ml/ave')}${th('Alimento g/ave')}${th('Alertas')}</tr>
      ${filas.join('')}
    </table>
    <p style="margin:16px 0 0;font-size:13px;color:#56646a">Con lo registrado hasta la hora de este correo. El detalle, los gráficos contra la guía genética y el Excel están en <a href="${APP}">Ovo Check</a>.</p>
  </div>`;
  const texto = `${g.granja}, informe del ${fecha}.\n` + (g.galpones ?? []).map((x) => `${x.nombre}: ${n(x.huevos)} huevos, ${n(x.muertas)} muertas, ${n(x.alertas)} alertas`).join('\n');
  return { asunto: `${g.granja}: informe del ${fecha}${alertas ? ` (${alertas} ${alertas === 1 ? 'alerta' : 'alertas'})` : ''}`, html, texto };
}

export async function correoInforme() {
  if (!correoListo) return 0;
  const lista = (await rpc('oc_informe_diario')) ?? [];
  let enviados = 0;
  for (const g of lista) {
    if (!g.correos?.length) continue;
    const m = armarInforme(g);
    await transporte().sendMail({ from: `Ovo Check <${USUARIO}>`, to: USUARIO, bcc: g.correos.join(','), subject: m.asunto, html: m.html, text: m.texto });
    enviados++;
  }
  return enviados;
}
