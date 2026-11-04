// Planilla: todos los datos del plantel como una hoja de cálculo ordenada. Un renglón por galpón y día (o por semana),
// con la guía genética al lado, totales del período, colores donde algo se sale y descarga a Excel.
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download } from 'lucide-react';
import { asegurarPeriodo, traerPeriodo } from '../lib/app';
import { avisar, ir, useEstado } from '../lib/estado';
import { edadSemanas, estandarDe, nombreLinea, rubroGalpon } from '../lib/estandar';
import { HOJAS, armarExcel } from '../lib/excel';
import { entregarArchivo } from '../lib/exportar';
import { diaGalpon } from '../lib/indicadores';
import { FLAGS_CRITICOS } from '../lib/logica';
import { mensajeError } from '../lib/nube';
import { semanasGalpon } from '../lib/semanas';
import { diaSemana, fechaCorta, num, sumarDias } from '../lib/util';
import { useIndice } from './operario';

type Fila = {
  clave: string;
  fecha: string;
  hasta: string;
  galponId: string;
  galpon: string;
  lote: string;
  semana: number | null;
  enDias: boolean;
  aves: number | null;
  muertas: number | null;
  mort: number | null;
  mortAcum: number | null;
  huevos: number | null;
  postura: number | null;
  guia: number | null;
  dif: number | null;
  aguaL: number | null;
  ml: number | null;
  alimKg: number | null;
  g: number | null;
  guiaG: number | null;
  rel: number | null;
  tmin: number | null;
  tmax: number | null;
  alertas: number;
};
type Col = { id: keyof Fila; nombre: string; dec?: number; ancho?: number; texto?: boolean; suma?: 'suma' | 'prom' | 'ultimo'; tono?: (f: Fila) => 'mal' | 'bien' | 'atencion' | undefined };

const COLUMNAS: Col[] = [
  { id: 'fecha', nombre: 'Fecha', texto: true, ancho: 104 },
  { id: 'galpon', nombre: 'Galpón', texto: true, ancho: 110 },
  { id: 'semana', nombre: 'Edad', dec: 0, ancho: 64 },
  { id: 'aves', nombre: 'Aves', dec: 0, suma: 'ultimo' },
  { id: 'muertas', nombre: 'Muertas', dec: 0, suma: 'suma', tono: (f) => (f.mort != null && f.mort > 0.1 ? 'mal' : undefined) },
  { id: 'mort', nombre: 'Mort. %', dec: 3, suma: 'prom', tono: (f) => (f.mort != null && f.mort > 0.1 ? 'mal' : undefined) },
  { id: 'mortAcum', nombre: 'Mort. acum. %', dec: 2, suma: 'ultimo' },
  { id: 'huevos', nombre: 'Huevos', dec: 0, suma: 'suma' },
  { id: 'postura', nombre: 'Postura %', dec: 1, suma: 'prom', tono: (f) => (f.dif != null && f.dif < -5 ? 'mal' : f.dif != null && f.dif < -2 ? 'atencion' : undefined) },
  { id: 'guia', nombre: 'Guía %', dec: 1, suma: 'prom' },
  { id: 'dif', nombre: 'Dif. guía', dec: 1, suma: 'prom', tono: (f) => (f.dif == null ? undefined : f.dif < -5 ? 'mal' : f.dif < -2 ? 'atencion' : f.dif >= 0 ? 'bien' : undefined) },
  { id: 'aguaL', nombre: 'Agua L', dec: 0, suma: 'suma' },
  { id: 'ml', nombre: 'Agua ml/ave', dec: 0, suma: 'prom' },
  { id: 'alimKg', nombre: 'Alim. kg', dec: 0, suma: 'suma' },
  { id: 'g', nombre: 'Alim. g/ave', dec: 1, suma: 'prom', tono: (f) => (f.g != null && f.guiaG != null && Math.abs(f.g - f.guiaG) / f.guiaG > 0.15 ? 'atencion' : undefined) },
  { id: 'guiaG', nombre: 'Guía g', dec: 0, suma: 'prom' },
  { id: 'rel', nombre: 'Agua/alim.', dec: 2, suma: 'prom', tono: (f) => (f.rel != null && (f.rel < 1.5 || f.rel > 3) ? 'atencion' : undefined) },
  { id: 'tmin', nombre: 'T° mín', dec: 1, suma: 'prom' },
  { id: 'tmax', nombre: 'T° máx', dec: 1, suma: 'prom', tono: (f) => (f.tmax != null && f.tmax > 32 ? 'mal' : undefined) },
  { id: 'alertas', nombre: 'Alertas', dec: 0, suma: 'suma', tono: (f) => (f.alertas ? 'mal' : undefined) },
];

const PERIODOS = [
  { id: 7, nombre: '7 días' },
  { id: 14, nombre: '14 días' },
  { id: 30, nombre: '30 días' },
  { id: 90, nombre: '90 días' },
];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function Planilla() {
  const config = useEstado((e) => e.config)!;
  const hoy = useEstado((e) => e.hoy);
  const revisiones = useEstado((e) => e.revisiones);
  const indice = useIndice();
  const [dias, setDias] = useState(14);
  const [vista, setVista] = useState<'dia' | 'semana'>('dia');
  const [galpon, setGalpon] = useState<string>('todos');
  const [orden, setOrden] = useState<{ col: keyof Fila; asc: boolean }>({ col: 'fecha', asc: false });
  const [bajando, setBajando] = useState(false);
  const desde = sumarDias(hoy, -(dias - 1));
  useEffect(() => {
    asegurarPeriodo(desde).catch(() => {});
  }, [desde]);
  const galpones = config.galpones.filter((g) => (galpon === 'todos' ? g.activo || g.aves : g.id === galpon));

  const filas = useMemo<Fila[]>(() => {
    const out: Fila[] = [];
    for (const g of galpones) {
      if (vista === 'semana') {
        for (const s of semanasGalpon(indice, g, desde, hoy)) {
          if (!s.diasConDatos) continue;
          const alertas = contarAlertas(indice, g.id, s.desde, s.hasta);
          out.push({
            clave: `${g.id}-${s.desde}`, fecha: s.desde, hasta: s.hasta, galponId: g.id, galpon: g.nombre, lote: g.lote, semana: g.nacimiento ? s.n : null, enDias: false,
            aves: null, muertas: s.muertas, mort: s.mortSemana, mortAcum: s.mortAcum, huevos: s.huevos || null, postura: s.postura, guia: s.std?.postura ?? null,
            dif: s.postura != null && s.std?.postura != null ? s.postura - s.std.postura : null, aguaL: null, ml: s.mlAve, alimKg: null, g: s.gAve,
            guiaG: s.std?.alimento ?? null, rel: s.relacion, tmin: null, tmax: null, alertas,
          });
        }
        continue;
      }
      // Mortalidad acumulada: se suma desde el inicio del período (o del lote, si empezó después).
      let acum = 0;
      let avesIni: number | null = null;
      for (let f = desde; f <= hoy; f = sumarDias(f, 1)) {
        const d = diaGalpon(indice, g, f);
        avesIni = avesIni ?? d.aves;
        acum += d.muertas ?? 0;
        const sinDatos = d.huevos == null && d.muertas == null && d.aguaL == null && d.alimKg == null && d.tmax == null;
        if (sinDatos) continue;
        const edad = edadSemanas(g, f);
        const std = g.linea && edad != null ? estandarDe(g.linea, edad) : null;
        out.push({
          clave: `${g.id}-${f}`, fecha: f, hasta: f, galponId: g.id, galpon: g.nombre, lote: g.lote, enDias: rubroGalpon(g) === 'engorda', semana: edad != null ? (rubroGalpon(g) === 'engorda' ? Math.round(edad * 7) : Math.floor(edad) + 1) : null,
          aves: d.aves, muertas: d.muertas, mort: d.mortalidad, mortAcum: avesIni ? (acum * 100) / avesIni : null, huevos: d.huevos, postura: d.postura,
          guia: std?.postura ?? null, dif: d.postura != null && std?.postura != null ? d.postura - std.postura : null, aguaL: d.aguaL, ml: d.mlAve,
          alimKg: d.alimKg, g: d.gAve, guiaG: std?.alimento ?? null, rel: d.relacion, tmin: d.tmin, tmax: d.tmax, alertas: contarAlertas(indice, g.id, f, f),
        });
      }
    }
    const k = orden.col;
    return out.sort((a, b) => {
      const x = a[k] ?? -Infinity;
      const y = b[k] ?? -Infinity;
      const c = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y, 'es') : (x as number) - (y as number);
      return (orden.asc ? c : -c) || a.galpon.localeCompare(b.galpon, 'es');
    });
  }, [indice, galpones, desde, hoy, vista, orden]);

  const resumen = useMemo(() => {
    const total: Partial<Record<keyof Fila, number | null>> = {};
    for (const c of COLUMNAS) {
      if (!c.suma) continue;
      const xs = filas.map((f) => f[c.id]).filter((v): v is number => typeof v === 'number');
      if (!xs.length) continue;
      if (c.suma === 'suma') total[c.id] = xs.reduce((a, b) => a + b, 0);
      else if (c.suma === 'prom') total[c.id] = xs.reduce((a, b) => a + b, 0) / xs.length;
      else {
        // Último valor de cada galpón (el más reciente), sumado o promediado según la columna.
        const ult = new Map<string, number>();
        [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((f) => typeof f[c.id] === 'number' && ult.set(f.galponId, f[c.id] as number));
        const v = [...ult.values()];
        total[c.id] = c.id === 'aves' ? v.reduce((a, b) => a + b, 0) : v.reduce((a, b) => a + b, 0) / v.length;
      }
    }
    return total;
  }, [filas]);

  const descargar = async () => {
    setBajando(true);
    try {
      const regs = await traerPeriodo(desde, hoy);
      const blob = await armarExcel({ config, registros: regs, revisiones, desde, hasta: hoy, hojas: HOJAS.map((h) => h.id) });
      await entregarArchivo(`planilla-${config.granja.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${desde}-a-${hoy}.xlsx`, blob);
    } catch (e) {
      avisar(mensajeError(e), 'mal');
    } finally {
      setBajando(false);
    }
  };

  // Las columnas sin ningún dato en lo que se está mirando no se muestran (por ejemplo, las temperaturas por semana).
  const columnas = COLUMNAS.filter((c) => c.texto || c.id === 'alertas' || filas.some((f) => f[c.id] != null));
  const fmt = (c: Col, v: unknown) => (v == null ? '' : typeof v === 'number' ? num(v, c.dec ?? 0) : String(v));
  const fechaTexto = (f: Fila) => (vista === 'semana' ? `${fechaCorta(f.fecha)} al ${fechaCorta(f.hasta)}` : `${DIAS[diaSemana(f.fecha)]} ${fechaCorta(f.fecha)}`);
  const kpi = (titulo: string, valor: string, detalle?: string, tono?: string) => (
    <div className={`kpi ${tono ?? ''}`}>
      <span className="kpi-titulo">{titulo}</span>
      <span className="kpi-valor">{valor}</span>
      {detalle && <span className="kpi-detalle">{detalle}</span>}
    </div>
  );
  const difProm = resumen.dif ?? null;

  return (
    <div className="planilla">
      <header className="linea-h entre envolver">
        <h2 className="titulo">Planilla</h2>
        <button className="boton chico" onClick={descargar} disabled={bajando}>
          <Download size={18} aria-hidden /> {bajando ? 'Preparando…' : 'Descargar Excel completo'}
        </button>
      </header>

      <div className="planilla-filtros" role="group" aria-label="Filtros">
        <label className="campo-linea">
          <span>Galpón</span>
          <select className="entrada" value={galpon} onChange={(e) => setGalpon(e.target.value)}>
            <option value="todos">Todos los galpones</option>
            {config.galpones.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
                {g.linea ? ` (${nombreLinea(g.linea)})` : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="segmentos" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p.id} aria-pressed={dias === p.id} onClick={() => setDias(p.id)}>
              {p.nombre}
            </button>
          ))}
        </div>
        <div className="segmentos" role="group" aria-label="Agrupar">
          <button aria-pressed={vista === 'dia'} onClick={() => setVista('dia')}>
            Por día
          </button>
          <button aria-pressed={vista === 'semana'} onClick={() => setVista('semana')}>
            Por semana
          </button>
        </div>
      </div>

      <div className="kpis">
        {kpi('Huevos', resumen.huevos != null ? num(resumen.huevos) : '–', `${fechaCorta(desde)} al ${fechaCorta(hoy)}`)}
        {kpi('Postura promedio', resumen.postura != null ? `${num(resumen.postura, 1)} %` : '–', difProm != null ? `${difProm >= 0 ? '+' : ''}${num(difProm, 1)} puntos contra la guía` : undefined, difProm != null && difProm < -5 ? 'mal' : difProm != null && difProm < -2 ? 'atencion' : undefined)}
        {kpi('Mortalidad del período', resumen.muertas != null ? num(resumen.muertas) : '–', resumen.mortAcum != null ? `${num(resumen.mortAcum, 2)} % acumulado` : undefined)}
        {kpi('Agua por ave', resumen.ml != null ? `${num(resumen.ml)} ml` : '–', resumen.rel != null ? `${num(resumen.rel, 2)} L de agua por kg de alimento` : undefined)}
        {kpi('Alimento por ave', resumen.g != null ? `${num(resumen.g, 1)} g` : '–', resumen.guiaG != null ? `guía ${num(resumen.guiaG)} g` : undefined)}
        {kpi('Alertas', resumen.alertas != null ? num(resumen.alertas) : '0', 'en el período', resumen.alertas ? 'mal' : undefined)}
      </div>

      <div className="hoja-calculo" role="region" aria-label="Planilla de datos" tabIndex={0}>
        <table>
          <thead>
            <tr>
              {columnas.map((c) => (
                <th key={c.id} scope="col" className={c.texto ? 'texto' : undefined} style={c.ancho ? { minWidth: c.ancho } : undefined} aria-sort={orden.col === c.id ? (orden.asc ? 'ascending' : 'descending') : 'none'}>
                  <button onClick={() => setOrden((o) => ({ col: c.id, asc: o.col === c.id ? !o.asc : c.texto ?? false }))}>
                    {c.nombre}
                    {orden.col === c.id && (orden.asc ? <ArrowUp size={13} aria-hidden /> : <ArrowDown size={13} aria-hidden />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} onClick={() => vista === 'dia' && ir({ p: 'galpondia', id: f.galponId, fecha: f.fecha })}>
                {columnas.map((c) => (
                  <td key={c.id} className={[c.texto ? 'texto' : '', c.tono?.(f) ?? ''].join(' ').trim() || undefined}>
                    {c.id === 'fecha' ? fechaTexto(f) : c.id === 'semana' && f.semana != null ? (f.enDias ? `día ${f.semana}` : `sem. ${f.semana}`) : fmt(c, f[c.id])}
                  </td>
                ))}
              </tr>
            ))}
            {!filas.length && (
              <tr>
                <td colSpan={columnas.length} className="texto vacio">
                  No hay registros en este período.
                </td>
              </tr>
            )}
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr>
                <th scope="row" className="texto">
                  Total / promedio
                </th>
                {columnas.slice(1).map((c) => (
                  <td key={c.id} className={c.texto ? 'texto' : undefined}>
                    {c.id === 'galpon' ? `${new Set(filas.map((f) => f.galponId)).size} galp.` : fmt(c, resumen[c.id])}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="chico suave">
        Toca el título de una columna para ordenar. En rojo lo que se aleja de la guía o de los límites; en ámbar lo que conviene mirar. Cada fila abre el
        detalle de ese galpón ese día.
      </p>
    </div>
  );
}

function contarAlertas(indice: ReturnType<typeof useIndice>, galponId: string, desde: string, hasta: string): number {
  let n = 0;
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    for (const r of indice.delDia(f, galponId)) if (!r.anulado && r.flags.some((x) => FLAGS_CRITICOS.includes(x))) n++;
    n += indice.problemas.filter((p) => p.fecha === f && p.galpon_id === galponId && !p.anulado).length;
  }
  return n;
}
