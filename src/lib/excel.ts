// Informe en Excel (.xlsx) para entregar a la gerencia: resumen diario, semanal contra la guía genética,
// alertas y el detalle de cada registro. Cada hoja se puede incluir o no.
import { esNum, filasRegistros } from './exportar';
import { diaGalpon } from './indicadores';
import { FLAGS_CRITICOS, Indice, NOMBRE_FLAG, flagsDe, reiniciosDe } from './logica';
import { edadSemanas, estadisticaMuestra, estandarDe, lineaPorId } from './estandar';
import { graficoPng } from './graficoPng';
import { NOMBRE_TIPO, resumenGestion, tituloGestion } from './modulos';
import { semanasGalpon } from './semanas';
import type { Config, RegistroLocal, Revision } from './tipos';
import { fechaHora, sumarDias } from './util';

const fechaCortaLarga = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

export const HOJAS = [
  { id: 'resumen', nombre: 'Resumen y gráficos', detalle: 'Indicadores del período por galpón y gráficos semanales contra la guía genética' },
  { id: 'diario', nombre: 'Resumen diario', detalle: 'Un renglón por galpón y día: huevos, postura, mortalidad, agua, alimento y temperaturas' },
  { id: 'semanal', nombre: 'Semanal y guía', detalle: 'Por semana de vida, con la guía genética al lado' },
  { id: 'alertas', nombre: 'Alertas', detalle: 'Problemas y datos fuera de lo normal, con su motivo' },
  { id: 'pesajes', nombre: 'Pesajes', detalle: 'Cada pesaje con promedio, CV y uniformidad' },
  { id: 'gestion', nombre: 'Gestión', detalle: 'Sala de proceso, bodega, despachos, insumos y sanidad' },
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
  const libro: { data: Celda[][]; sheet: string; columns: { width: number }[]; stickyRowsCount: number; images?: unknown[]; showGridLines?: boolean }[] = [];

  if (p.hojas.includes('resumen')) {
    const data: Celda[][] = [
      [{ value: config.granja.nombre, fontWeight: 'bold', fontSize: 18 } as Celda],
      [t(`Informe del ${fechaCortaLarga(desde)} al ${fechaCortaLarga(hasta)}. Generado con Ovo Check el ${fechaHora(new Date().toISOString())}.`)],
      [],
      ['Galpón', 'Línea', 'Semana de vida', 'Aves', 'Huevos', 'Postura %', 'Guía %', 'Dif. guía', 'Muertas', 'Mort. %', 'Agua ml/ave', 'Alim. g/ave', 'Agua/alim.', 'Alertas'].map(titulo),
    ];
    const imagenes: unknown[] = [];
    let fila = 0;
    for (const g of galpones) {
      const ss = semanasGalpon(indice, g, desde, hasta).filter((x) => x.diasConDatos);
      if (!ss.length) continue;
      const huevos = ss.reduce((a, x) => a + x.huevos, 0);
      const muertas = ss.reduce((a, x) => a + x.muertas, 0);
      const prom = (k: 'postura' | 'mlAve' | 'gAve' | 'relacion') => {
        const v = ss.map((x) => x[k]).filter((z): z is number => z != null);
        return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
      };
      const guias = ss.map((x) => x.std?.postura).filter((z): z is number => z != null);
      const guia = guias.length ? guias.reduce((a, b) => a + b, 0) / guias.length : null;
      const postura = prom('postura');
      const ultima = ss[ss.length - 1];
      const d0 = diaGalpon(indice, g, hasta);
      const alertas = registros.filter((r) => r.galpon_id === g.id && r.fecha >= desde && r.fecha <= hasta && !r.anulado && indice.esVigente(r) && (r.tipo === 'problema' || flagsDe(r).some((f) => (FLAGS_CRITICOS as string[]).includes(f)))).length;
      data.push([
        t(g.nombre), t(lineaPorId(g.linea)?.nombre ?? ''), n(g.nacimiento ? ultima.n : null), n(d0.aves ?? g.aves), n(huevos), n(postura, 1), n(guia, 1),
        n(postura != null && guia != null ? postura - guia : null, 1), n(muertas), n(d0.aves ? (muertas * 100) / d0.aves : null, 2), n(prom('mlAve'), 0), n(prom('gAve'), 1),
        n(prom('relacion'), 2), n(alertas),
      ]);
      // Gráficos de este galpón, uno al lado del otro, debajo de la tabla.
      const etiquetas = ss.map((x) => (g.nacimiento ? `S${x.n}` : fechaCortaLarga(x.desde).slice(0, 5)));
      const graficos = [
        { titulo: `${g.nombre}: postura`, unidad: '% gallina-día', series: [{ nombre: 'Real', valores: ss.map((x) => x.postura), color: VERDE }, { nombre: 'Guía genética', valores: ss.map((x) => x.std?.postura ?? null), color: '#93a0a3', punteada: true }] },
        { titulo: `${g.nombre}: alimento y agua`, unidad: 'g de alimento por ave al día', series: [{ nombre: 'Real', valores: ss.map((x) => x.gAve), color: '#c26a00' }, { nombre: 'Guía genética', valores: ss.map((x) => x.std?.alimento ?? null), color: '#93a0a3', punteada: true }] },
        { titulo: `${g.nombre}: mortalidad acumulada`, unidad: '% del lote', series: [{ nombre: 'Real', valores: ss.map((x) => x.mortAcum), color: '#b42318' }, { nombre: 'Guía genética', valores: ss.map((x) => x.std?.mortAcum ?? null), color: '#93a0a3', punteada: true }] },
      ];
      for (let k = 0; k < graficos.length; k++) {
        const png = await graficoPng({ ...graficos[k], etiquetas, ancho: 640, alto: 300 });
        if (!png) continue;
        imagenes.push({ content: png, contentType: 'image/png', width: 1280, height: 600, dpi: 192, anchor: { row: 0, column: 1 + k * 6 }, title: graficos[k].titulo, _fila: fila });
      }
      fila++;
    }
    // Los gráficos van debajo de la tabla: se reservan 17 filas por galpón.
    const inicio = data.length + 2;
    for (const im of imagenes as any[]) {
      im.anchor.row = inicio + im._fila * 17;
      delete im._fila;
    }
    for (let k = 0; k < fila * 17 + 2; k++) data.push([]);
    libro.push({ data, sheet: 'Resumen', columns: [16, 22, 10, 10, 11, 10, 9, 9, 9, 9, 11, 11, 10, 9].map((w) => ({ width: w })), stickyRowsCount: 0, images: imagenes, showGridLines: false });
  }

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

  if (p.hojas.includes('pesajes')) {
    const enc = ['Fecha', 'Galpón', 'Tarea', 'Aves pesadas', 'Promedio g', 'Guía g', 'CV %', 'Uniformidad %', 'Mínimo g', 'Máximo g', 'Registró'];
    const data: Celda[][] = [enc.map(titulo)];
    for (const r of registros) {
      const m = (r.detalle as any)?.muestra as number[] | undefined;
      if (!m?.length || r.anulado || !indice.esVigente(r) || r.fecha < desde || r.fecha > hasta) continue;
      const e = estadisticaMuestra(m);
      if (!e) continue;
      const g = galpones.find((x) => x.id === r.galpon_id);
      const edad = edadSemanas(g, r.fecha);
      const std = g?.linea && edad != null ? estandarDe(g.linea, edad) : null;
      data.push([fecha(r.fecha), t(r.galpon_nombre ?? g?.nombre), t(r.tarea?.nombre), n(e.n), n(e.promedio, 0), n(std?.pesoAve, 0), n(e.cv, 1), { ...(n(e.uniformidad, 0) as object), ...(e.uniformidad < 80 ? { color: '#B42318' } : {}) } as Celda, n(e.min), n(e.max), t(r.usuario_nombre)]);
    }
    libro.push({ data, sheet: 'Pesajes', columns: [12, 12, 18, 12, 12, 10, 8, 13, 10, 10, 18].map((w) => ({ width: w })), stickyRowsCount: 1 });
  }

  if (p.hojas.includes('gestion')) {
    const enc = ['Fecha', 'Hora', 'Área', 'Movimiento', 'Detalle', 'Observaciones', 'Registró', 'Código'];
    const data: Celda[][] = [enc.map(titulo)];
    for (const r of indice.gestion) {
      if (r.anulado || !indice.esVigente(r) || r.fecha < desde || r.fecha > hasta) continue;
      data.push([fecha(r.fecha), t(fechaHora(r.capturado ?? r.capturado_dispositivo).slice(11, 16)), t(NOMBRE_TIPO[r.tipo] ?? r.tipo), t(tituloGestion(config, r)),
        { value: resumenGestion(config, r), type: String, wrap: true }, t(r.nota), t(r.usuario_nombre), t(r.id.slice(0, 8).toUpperCase())]);
    }
    libro.push({ data, sheet: 'Gestión', columns: [12, 7, 16, 26, 50, 30, 18, 11].map((w) => ({ width: w })), stickyRowsCount: 1 });
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
