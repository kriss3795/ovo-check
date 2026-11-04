// Informe en Excel (.xlsx) para entregar a la gerencia: resumen diario, semanal contra la guía genética,
// alertas y el detalle de cada registro. Cada hoja se puede incluir o no.
import { esNum, filasRegistros } from './exportar';
import { diaGalpon } from './indicadores';
import { FLAGS_CRITICOS, Indice, NOMBRE_FLAG, flagsDe, reiniciosDe } from './logica';
import { lineaPorId } from './estandar';
import { semanasGalpon } from './semanas';
import type { Config, RegistroLocal, Revision } from './tipos';
import { fechaHora, sumarDias } from './util';

export const HOJAS = [
  { id: 'diario', nombre: 'Resumen diario', detalle: 'Un renglón por galpón y día: huevos, postura, mortalidad, agua, alimento y temperaturas' },
  { id: 'semanal', nombre: 'Semanal y guía', detalle: 'Por semana de vida, con la guía genética al lado' },
  { id: 'alertas', nombre: 'Alertas', detalle: 'Problemas y datos fuera de lo normal, con su motivo' },
  { id: 'registros', nombre: 'Registros', detalle: 'Cada dato anotado, con hora, operario y respaldo' },
] as const;
export type Hoja = (typeof HOJAS)[number]['id'];

type Celda = { value: unknown; type?: unknown; format?: string; fontWeight?: 'bold'; wrap?: boolean; color?: string; backgroundColor?: string } | null;

const VERDE = '#0A6B3B';
const titulo = (t: string): Celda => ({ value: t, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: VERDE, wrap: true });
const n = (v: number | null | undefined, dec = 0): Celda =>
  v == null || !Number.isFinite(v) ? null : { value: Math.round(v * 10 ** dec) / 10 ** dec, type: Number, format: dec ? `#,##0.${'0'.repeat(dec)}` : '#,##0' };
const t = (v: unknown): Celda => (v == null || v === '' ? null : { value: String(v), type: String });
const fecha = (iso: string): Celda => ({ value: new Date(`${iso}T12:00:00`), type: Date, format: 'dd-mm-yyyy' });

export async function armarExcel(p: {
  config: Config;
  registros: RegistroLocal[];
  revisiones: Revision[];
  desde: string;
  hasta: string;
  hojas: Hoja[];
}): Promise<Blob> {
  const { config, registros, revisiones, desde, hasta } = p;
  const indice = new Indice(registros, reiniciosDe(config.galpones));
  const galpones = config.galpones;
  const libro: { data: Celda[][]; sheet: string; columns: { width: number }[]; stickyRowsCount: number }[] = [];

  if (p.hojas.includes('diario')) {
    const enc = ['Fecha', 'Galpón', 'Lote', 'Aves', 'Huevos', 'Postura %', 'Muertas', 'Mortalidad %', 'Agua L', 'Agua ml/ave', 'Alimento kg', 'Alimento g/ave', 'Agua/alimento L/kg', 'T° mín', 'T° máx'];
    const data: Celda[][] = [enc.map(titulo)];
    for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
      for (const g of galpones) {
        const d = diaGalpon(indice, g, f);
        if (d.huevos == null && d.muertas == null && d.aguaL == null && d.alimKg == null && d.tmax == null) continue;
        data.push([fecha(f), t(g.nombre), t(g.lote), n(d.aves), n(d.huevos), n(d.postura, 1), n(d.muertas), n(d.mortalidad, 3), n(d.aguaL, 0), n(d.mlAve, 0), n(d.alimKg, 1), n(d.gAve, 1), n(d.relacion, 2), n(d.tmin, 1), n(d.tmax, 1)]);
      }
    }
    libro.push({ data, sheet: 'Resumen diario', columns: [12, 14, 10, 10, 10, 10, 9, 12, 10, 12, 12, 13, 15, 8, 8].map((w) => ({ width: w })), stickyRowsCount: 1 });
  }

  if (p.hojas.includes('semanal')) {
    const enc = ['Galpón', 'Línea', 'Semana', 'Desde', 'Hasta', 'Días con datos', 'Postura %', 'Guía %', 'Diferencia', 'Huevos', 'Alimento g/ave', 'Guía g/ave', 'Agua ml/ave', 'Agua/alimento', 'Muertas', 'Mort. semana %', 'Mort. acumulada %', 'Guía mort. acum. %', 'Peso huevo g', 'Guía peso huevo g', 'Masa de huevo g/ave', 'Peso vivo g', 'Guía peso vivo g'];
    const data: Celda[][] = [enc.map(titulo)];
    for (const g of galpones) {
      for (const s of semanasGalpon(indice, g, desde, hasta)) {
        if (!s.diasConDatos) continue;
        data.push([
          t(g.nombre), t(lineaPorId(g.linea)?.nombre ?? ''), n(s.n), fecha(s.desde), fecha(s.hasta), n(s.diasConDatos),
          n(s.postura, 1), n(s.std?.postura, 1), n(s.postura != null && s.std?.postura != null ? s.postura - s.std.postura : null, 1),
          n(s.huevos), n(s.gAve, 1), n(s.std?.alimento, 0), n(s.mlAve, 0), n(s.relacion, 2), n(s.muertas), n(s.mortSemana, 3),
          n(s.mortAcum, 2), n(s.std?.mortAcum, 2), n(s.pesoHuevo, 1), n(s.std?.pesoHuevo, 1), n(s.masa, 1), n(s.pesoAve, 0), n(s.std?.pesoAve, 0),
        ]);
      }
    }
    libro.push({ data, sheet: 'Semanal y guía', columns: enc.map((e) => ({ width: Math.max(9, Math.min(18, e.length + 2)) })), stickyRowsCount: 1 });
  }

  if (p.hojas.includes('alertas')) {
    const enc = ['Fecha', 'Hora', 'Galpón', 'Tarea', 'Marcas', 'Motivo', 'Registró', 'Revisada', 'Código'];
    const data: Celda[][] = [enc.map(titulo)];
    const revisada = new Set(revisiones.map((v) => v.registro_id));
    for (const r of registros) {
      if (r.anulado || !indice.esVigente(r)) continue;
      const flags = flagsDe(r);
      if (r.tipo !== 'problema' && !flags.length) continue;
      if (r.fecha < desde || r.fecha > hasta) continue;
      data.push([
        fecha(r.fecha), t(fechaHora(r.capturado ?? r.capturado_dispositivo).slice(11, 16)), t(r.galpon_nombre ?? galpones.find((g) => g.id === r.galpon_id)?.nombre),
        t(r.tipo === 'problema' ? 'Problema informado' : r.tarea?.nombre), t(flags.map((f) => NOMBRE_FLAG[f]).join('; ')),
        { value: [r.nota, ...(r.avisos ?? [])].filter(Boolean).join('. '), type: String, wrap: true, ...(flags.some((f) => (FLAGS_CRITICOS as string[]).includes(f)) ? { color: '#B42318' } : {}) },
        t(r.usuario_nombre), t(revisada.has(r.id) ? 'Sí' : 'No'), t(r.id.slice(0, 8).toUpperCase()),
      ]);
    }
    libro.push({ data, sheet: 'Alertas', columns: [12, 7, 12, 24, 26, 60, 18, 9, 11].map((w) => ({ width: w })), stickyRowsCount: 1 });
  }

  if (p.hojas.includes('registros')) {
    const filas = filasRegistros(config, registros.filter((r) => r.fecha >= desde && r.fecha <= hasta), revisiones);
    const data: Celda[][] = filas.map((f, i) =>
      i === 0
        ? f.map((x) => titulo(String(x)))
        : f.map((x, k) => (k === 0 && typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? fecha(x) : esNum(x) ? n(x.n, x.d) : typeof x === 'number' ? n(x) : t(x))),
    );
    libro.push({ data, sheet: 'Registros', columns: filas[0].map((h) => ({ width: Math.max(10, Math.min(28, String(h).length + 4)) })), stickyRowsCount: 1 });
  }

  const { default: escribir } = await import('write-excel-file/browser');
  return (escribir as any)(libro, { fontFamily: 'Calibri', fontSize: 11 }).toBlob();
}
