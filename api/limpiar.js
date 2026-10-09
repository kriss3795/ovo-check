// Tarea diaria (Vercel la ejecuta sola, ver vercel.json):
//  1. Borra de la nube las fotos que ya cumplieron su plazo (30 días por defecto). Los números no se tocan.
//  2. Los lunes recuerda a los supervisores que descarguen las fotos que se borrarán esa semana.
//  3. Borra los planteles que alguien creó para probar y dejó abandonados (sin ningún registro ni uso en 60 días).
//  4. Mide el espacio ocupado y, si se está llenando, avisa por correo a quien administra la app.
//  5. De paso mantiene despierto el proyecto gratuito de Supabase.
import { USUARIO, correoListo, escapar, transporte } from './_correo.js';
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
  // Lo que sigue no debe impedir la limpieza de fotos: si falla, se informa y se reintenta mañana.
  let abandonados = 0;
  let espacio = null;
  try {
    abandonados = (await rpc('oc_limpieza'))?.planteles_abandonados ?? 0;
    const u = await rpc('oc_uso');
    // Esta dirección es pública: solo muestra el porcentaje. El detalle va por correo.
    espacio = { pct: u.pct, correo: false };
    if (u.avisar && correoListo) {
      await transporte().sendMail(correoEspacio(u));
      await rpc('oc_uso', { avisado: u.nivel });
      espacio.correo = true;
    }
  } catch (e) {
    console.error('No se pudo revisar el espacio', e?.message ?? e);
    espacio = { error: 'No se pudo revisar el espacio' };
  }
  return res.status(200).json({ ok: true, borradas, dias, avisos, abandonados, espacio });
}

const DESTINO = String(process.env.CORREO_DUENO ?? '').trim();
const pct = (a, b) => Math.round((100 * Number(a)) / Math.max(1, Number(b)));
const mb = (n) => `${Math.round(Number(n)).toLocaleString('es-CL')} MB`;

/** Correo para quien administra la app, con cuánto espacio queda y qué hacer. */
function correoEspacio(u) {
  const lleno = u.pct >= 95;
  const filas = [
    ['Base de datos (los números)', `${mb(u.mb_datos)} de ${mb(u.max_mb_datos)}`, pct(u.mb_datos, u.max_mb_datos)],
    ['Fotos', `${mb(u.mb_fotos)} de ${mb(u.max_mb_total)}`, pct(u.mb_fotos, u.max_mb_total)],
    ['Galpones en producción', `${u.galpones} de ${u.max_galpones}`, pct(u.galpones, u.max_galpones)],
  ];
  const mayores = (u.mayores ?? []).map((m) => `${m.nombre}: ${Number(m.registros).toLocaleString('es-CL')} registros, ${mb(m.mb_fotos)} en fotos`);
  const queHacer = [
    'La app se protege sola: al 70 % deja de aceptar planteles nuevos y, si llegara al tope, los registros esperan en cada teléfono sin perderse.',
    'Para tener más espacio: en supabase.com pasa el proyecto al plan Pro y luego ejecuta en SQL Editor:  select oc_soporte_plan(\'pro\');',
    'Para ver cuánto ocupa cada plantel:  select * from oc_soporte_uso;',
  ];
  const asunto = lleno
    ? `Ovo Check: el servidor está casi lleno (${u.pct} %)`
    : `Ovo Check: el servidor va en ${u.pct} % de su capacidad`;
  return {
    from: `"Ovo Check" <${USUARIO}>`,
    to: DESTINO ? [USUARIO, DESTINO] : USUARIO,
    subject: asunto,
    text:
      `${asunto}\n\n` +
      filas.map((f) => `${f[0]}: ${f[1]} (${f[2]} %)`).join('\n') +
      `\nPlanteles: ${u.planteles} (${u.nuevos_hoy} nuevos en las últimas 24 horas)\n\n` +
      (mayores.length ? `Los que más ocupan:\n${mayores.join('\n')}\n\n` : '') +
      queHacer.join('\n\n') +
      '\n',
    html:
      `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1c282d;font-size:15px">` +
      `<p style="font-size:18px;font-weight:bold">${escapar(asunto)}</p>` +
      `<table style="border-collapse:collapse;width:100%">` +
      filas.map((f) => `<tr><td style="padding:6px 0">${escapar(f[0])}</td><td style="padding:6px 0;text-align:right">${escapar(f[1])}</td><td style="padding:6px 0 6px 12px;text-align:right;font-weight:bold;color:${f[2] >= 80 ? '#b3261e' : '#075029'}">${f[2]} %</td></tr>`).join('') +
      `</table>` +
      `<p>Planteles: ${u.planteles} (${u.nuevos_hoy} nuevos en las últimas 24 horas)</p>` +
      (mayores.length ? `<p>Los que más ocupan:<br>${mayores.map(escapar).join('<br>')}</p>` : '') +
      queHacer.map((t) => `<p style="color:#56646a">${escapar(t)}</p>`).join('') +
      `</div>`,
  };
}
