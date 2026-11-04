// Producción: cada galpón contra la curva de su línea genética, semana a semana, y todos los galpones lado a lado.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import { asegurarPeriodo } from '../lib/app';
import { ir, useEstado } from '../lib/estado';
import { edadSemanas, edadTexto, nombreLinea, rubroDe, estandarDe } from '../lib/estandar';
import { diaGalpon } from '../lib/indicadores';
import { inicioLote, resumenGalpon, semanasGalpon, type Semana } from '../lib/semanas';
import type { Galpon } from '../lib/tipos';
import { fechaCorta, num, sumarDias } from '../lib/util';
import { useIndice } from './operario';

type Medida = 'postura' | 'gAve' | 'mlAve' | 'mortAcum' | 'pesoHuevo' | 'pesoAve';
const MEDIDAS: { id: Medida; nombre: string; unidad: string; dec: number; std?: keyof NonNullable<Semana['std']> }[] = [
  { id: 'postura', nombre: 'Postura', unidad: '%', dec: 1, std: 'postura' },
  { id: 'gAve', nombre: 'Alimento por ave', unidad: 'g/día', dec: 0, std: 'alimento' },
  { id: 'mlAve', nombre: 'Agua por ave', unidad: 'ml/día', dec: 0 },
  { id: 'mortAcum', nombre: 'Mortalidad acumulada', unidad: '%', dec: 2, std: 'mortAcum' },
  { id: 'pesoHuevo', nombre: 'Peso de huevo', unidad: 'g', dec: 1, std: 'pesoHuevo' },
  { id: 'pesoAve', nombre: 'Peso vivo', unidad: 'g', dec: 0, std: 'pesoAve' },
];
const PERIODOS = [
  { id: 8, nombre: '8 semanas' },
  { id: 16, nombre: '16 semanas' },
  { id: 0, nombre: 'Todo el lote' },
];

export function Produccion() {
  const config = useEstado((e) => e.config)!;
  const hoy = useEstado((e) => e.hoy);
  const indice = useIndice();
  const galpones = config.galpones.filter((g) => g.activo || g.aves);
  const [gid, setGid] = useState<string>(() => galpones[0]?.id ?? '');
  const [periodo, setPeriodo] = useState(8);
  const g = galpones.find((x) => x.id === gid) ?? galpones[0];
  const desde = useMemo(() => {
    if (!g) return hoy;
    const ini = inicioLote(g);
    if (periodo === 0) return ini ?? sumarDias(hoy, -7 * 26);
    const d = sumarDias(hoy, -7 * periodo + 1);
    return ini && ini > d ? ini : d;
  }, [g, periodo, hoy]);
  useEffect(() => {
    asegurarPeriodo(desde).catch(() => {});
  }, [desde]);
  const semanas = useMemo(() => {
    const todas = g ? semanasGalpon(indice, g, desde, hoy) : [];
    // Las semanas del comienzo sin ningún dato no aportan al gráfico.
    const i = todas.findIndex((x) => x.diasConDatos > 0);
    return i < 0 ? [] : todas.slice(i);
  }, [indice, g, desde, hoy]);
  const resumenes = useMemo(() => galpones.map((x) => resumenGalpon(indice, x, hoy)), [indice, galpones, hoy]);

  if (!g) return <p className="suave">Agrega un galpón en Ajustes para ver su producción.</p>;
  const linea = g.linea ? { nombre: nombreLinea(g.linea) } : null;
  const edad = edadSemanas(g, hoy);
  const engorda = rubroDe(g.linea) === 'engorda';
  return (
    <div className="produccion">
      <header className="prod-cabeza">
        <div className="linea-h entre">
          <h2 className="titulo">Producción</h2>
          <button className="boton chico no-imprimir" onClick={() => window.print()}>
            <Printer size={18} aria-hidden /> Imprimir o guardar PDF
          </button>
        </div>
        <p className="solo-imprimir">
          {config.granja.nombre}, {g.nombre}. Informe del {fechaCorta(desde)} al {fechaCorta(hoy)}.
        </p>
        <div className="prod-filtros no-imprimir" role="group" aria-label="Galpón y período">
          <label className="campo-linea">
            <span>Galpón</span>
            <select className="entrada" value={g.id} onChange={(e) => setGid(e.target.value)}>
              {galpones.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
          </label>
          <div className="segmentos" role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <button key={p.id} aria-pressed={periodo === p.id} onClick={() => setPeriodo(p.id)}>
                {p.nombre}
              </button>
            ))}
          </div>
        </div>
        <p className="chico suave">
          {linea && edad != null
            ? `${linea.nombre}, ${edadTexto(g, hoy)} de vida. La línea punteada es la guía genética.`
            : 'Para comparar con la curva de la guía genética, indica la línea y la fecha de nacimiento del lote en Ajustes, Galpones.'}
          {!(linea && edad != null) && (
            <>
              {' '}
              <button className="enlace" onClick={() => ir({ p: 'ajuste', cual: 'galpon', id: g.id })}>
                Indicarlas ahora
              </button>
            </>
          )}
        </p>
      </header>

      {engorda && <FichaEngorda galpon={g} hoy={hoy} />}
      <div className="prod-graficos">
        {MEDIDAS.filter((m) => semanas.some((s) => s[m.id] != null)).map((m) => (
          <Grafico key={m.id} medida={m} semanas={semanas} conEdad={edad != null} />
        ))}
        {!semanas.some((s) => s.diasConDatos) && <p className="suave">Todavía no hay registros en este período.</p>}
      </div>

      {semanas.length > 0 && (
        <section>
          <h3 className="seccion">Semana a semana, {g.nombre}</h3>
          <div className="tabla-wrap">
            <table className="datos">
              <thead>
                <tr>
                  <th scope="col">{edad != null ? 'Semana de vida' : 'Semana'}</th>
                  <th scope="col">Días</th>
                  <th scope="col">Postura %</th>
                  {linea && <th scope="col">Guía %</th>}
                  <th scope="col">Huevos</th>
                  <th scope="col">Alimento g/ave</th>
                  {linea && <th scope="col">Guía g</th>}
                  <th scope="col">Agua ml/ave</th>
                  <th scope="col">Agua/alimento</th>
                  <th scope="col">Muertas</th>
                  <th scope="col">Mort. acum. %</th>
                  <th scope="col">Peso huevo g</th>
                  <th scope="col">Masa g/ave</th>
                </tr>
              </thead>
              <tbody>
                {[...semanas].filter((s) => s.diasConDatos > 0).reverse().map((s) => {
                  const bajo = s.postura != null && s.std?.postura != null && s.postura < s.std.postura - 5;
                  return (
                    <tr key={s.desde}>
                      <th scope="row">
                        {s.n}
                        <span className="tabla-sub">
                          {fechaCorta(s.desde)} al {fechaCorta(s.hasta)}
                        </span>
                      </th>
                      <td>{s.diasConDatos}</td>
                      <td className={bajo ? 'mal' : undefined}>{s.postura != null ? num(s.postura, 1) : '–'}</td>
                      {linea && <td className="suave">{s.std?.postura != null ? num(s.std.postura, 1) : '–'}</td>}
                      <td>{s.huevos ? num(s.huevos) : '–'}</td>
                      <td>{s.gAve != null ? num(s.gAve) : '–'}</td>
                      {linea && <td className="suave">{s.std?.alimento != null ? num(s.std.alimento) : '–'}</td>}
                      <td>{s.mlAve != null ? num(s.mlAve) : '–'}</td>
                      <td>{s.relacion != null ? num(s.relacion, 2) : '–'}</td>
                      <td>{num(s.muertas)}</td>
                      <td>{s.mortAcum != null ? num(s.mortAcum, 2) : '–'}</td>
                      <td>{s.pesoHuevo != null ? num(s.pesoHuevo, 1) : '–'}</td>
                      <td>{s.masa != null ? num(s.masa, 1) : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {resumenes.length > 1 && (
        <section>
          <h3 className="seccion">Comparar galpones, últimos 7 días</h3>
          <div className="tabla-wrap">
            <table className="datos">
              <thead>
                <tr>
                  <th scope="col">Galpón</th>
                  <th scope="col">Línea</th>
                  <th scope="col">Semana</th>
                  <th scope="col">Aves</th>
                  <th scope="col">Postura %</th>
                  <th scope="col">Dif. con guía</th>
                  <th scope="col">Alimento g/ave</th>
                  <th scope="col">Agua ml/ave</th>
                  <th scope="col">Agua/alimento</th>
                  <th scope="col">Mort. acum. %</th>
                </tr>
              </thead>
              <tbody>
                {resumenes.map((r) => {
                  const dif = r.postura != null && r.std?.postura != null ? r.postura - r.std.postura : null;
                  return (
                    <tr key={r.g.id} className="fila-clic" onClick={() => setGid(r.g.id)}>
                      <th scope="row">{r.g.nombre}</th>
                      <td>{r.linea ?? '–'}</td>
                      <td>{r.semana ?? '–'}</td>
                      <td>{r.aves ? num(r.aves) : '–'}</td>
                      <td>{r.postura != null ? num(r.postura, 1) : '–'}</td>
                      <td className={dif != null && dif < -5 ? 'mal' : undefined}>{dif != null ? `${dif > 0 ? '+' : ''}${num(dif, 1)}` : '–'}</td>
                      <td>{r.gAve != null ? num(r.gAve) : '–'}</td>
                      <td>{r.mlAve != null ? num(r.mlAve) : '–'}</td>
                      <td>{r.relacion != null ? num(r.relacion, 2) : '–'}</td>
                      <td>{r.mortAcum != null ? num(r.mortAcum, 2) : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

/** Gráfico de líneas de una medida: lo real (línea continua) contra la guía genética (punteada). Un solo eje. */
function Grafico({ medida, semanas, conEdad }: { medida: (typeof MEDIDAS)[number]; semanas: Semana[]; conEdad: boolean }) {
  const [foco, setFoco] = useState<number | null>(null);
  const caja = useRef<SVGSVGElement>(null);
  const W = 560;
  const H = 220;
  const M = { i: 44, d: 14, a: 14, b: 30 };
  const real = semanas.map((s) => s[medida.id] as number | null);
  const guia = semanas.map((s) => (medida.std && s.std ? (s.std[medida.std] as number | null) : null));
  const todos = [...real, ...guia].filter((v): v is number => v != null);
  if (!todos.length) return null;
  let lo = Math.min(...todos);
  let hi = Math.max(...todos);
  if (medida.id === 'postura') {
    hi = Math.min(100, Math.max(hi, 100));
    lo = Math.max(0, Math.floor((lo - 5) / 10) * 10);
  } else {
    const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 1;
    lo = Math.max(0, lo - pad);
    hi = hi + pad;
  }
  const n = semanas.length;
  const x = (i: number) => M.i + (n <= 1 ? (W - M.i - M.d) / 2 : (i * (W - M.i - M.d)) / (n - 1));
  const y = (v: number) => M.a + (1 - (v - lo) / (hi - lo || 1)) * (H - M.a - M.b);
  const camino = (vals: (number | null)[]) => {
    let d = '';
    let nuevo = true;
    vals.forEach((v, i) => {
      if (v == null) return (nuevo = true);
      d += `${nuevo ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      nuevo = false;
    });
    return d;
  };
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + t * (hi - lo));
  const paso = Math.max(1, Math.ceil(n / 8));
  const hayGuia = guia.some((v) => v != null);
  const mover = (ev: React.PointerEvent) => {
    const r = caja.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = n <= 1 ? 0 : Math.round(((px - M.i) / (W - M.i - M.d)) * (n - 1));
    setFoco(Math.max(0, Math.min(n - 1, i)));
  };
  const f = foco != null ? semanas[foco] : null;
  return (
    <figure className="grafico">
      <figcaption>
        <b>{medida.nombre}</b> <span className="suave">{medida.unidad}</span>
        <span className="grafico-leyenda">
          <span className="ley-real">Real</span>
          {hayGuia && <span className="ley-guia">Guía genética</span>}
        </span>
      </figcaption>
      <div className="grafico-lienzo">
        <svg
          ref={caja}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${medida.nombre} por semana${hayGuia ? ', comparado con la guía genética' : ''}`}
          onPointerMove={mover}
          onPointerLeave={() => setFoco(null)}
        >
          {marcas.map((m) => (
            <g key={m}>
              <line x1={M.i} x2={W - M.d} y1={y(m)} y2={y(m)} className="g-rejilla" />
              <text x={M.i - 6} y={y(m) + 4} textAnchor="end" className="g-eje">
                {num(m, hi - lo < 6 ? 1 : medida.dec > 1 ? 1 : 0)}
              </text>
            </g>
          ))}
          {semanas.map((s, i) =>
            i % paso === 0 || i === n - 1 ? (
              <text key={s.desde} x={x(i)} y={H - 10} textAnchor="middle" className="g-eje">
                {conEdad ? s.n : fechaCorta(s.desde)}
              </text>
            ) : null,
          )}
          {hayGuia && <path d={camino(guia)} className="g-guia" />}
          <path d={camino(real)} className="g-real" />
          {real.map((v, i) => (v != null ? <circle key={i} cx={x(i)} cy={y(v)} r={foco === i ? 5 : 3.5} className="g-punto" /> : null))}
          {foco != null && <line x1={x(foco)} x2={x(foco)} y1={M.a} y2={H - M.b} className="g-guia-vertical" />}
        </svg>
        {f && (
          <div className="grafico-tip" style={{ left: `${(x(foco!) / W) * 100}%` }} role="status">
            <b>{conEdad ? `Semana ${f.n}` : `${fechaCorta(f.desde)} al ${fechaCorta(f.hasta)}`}</b>
            <span>
              Real: {real[foco!] != null ? `${num(real[foco!]!, medida.dec)} ${medida.unidad}` : 'sin datos'}
            </span>
            {hayGuia && guia[foco!] != null && (
              <span>
                Guía: {num(guia[foco!]!, medida.dec)} {medida.unidad}
              </span>
            )}
          </div>
        )}
      </div>
    </figure>
  );
}

export const galponesConCurva = (gs: Galpon[]) => gs.filter((g) => g.linea && g.nacimiento).length;

/**
 * Pollo de engorda: los indicadores del lote a la fecha. Conversión = alimento acumulado ÷ kilos vivos (último pesaje × aves
 * vivas); IEP = viabilidad % × peso kg ÷ (edad en días × conversión) × 100.
 */
function FichaEngorda({ galpon: g, hoy }: { galpon: Galpon; hoy: string }) {
  const indice = useIndice();
  const desde = inicioLote(g) ?? g.nacimiento ?? hoy;
  const datos = useMemo(() => {
    let alimento = 0;
    let muertas = 0;
    let iniciales: number | null = null;
    let vivas: number | null = null;
    for (let f = desde; f <= hoy; f = sumarDias(f, 1)) {
      const d = diaGalpon(indice, g, f);
      iniciales = iniciales ?? d.aves;
      alimento += d.alimKg ?? 0;
      muertas += d.muertas ?? 0;
      vivas = d.vivas ?? (d.aves != null ? d.aves - (d.muertas ?? 0) : vivas);
    }
    const ss = semanasGalpon(indice, g, desde, hoy).filter((x) => x.pesoAve != null);
    const peso = ss.at(-1)?.pesoAve ?? null;
    return { alimento, muertas, iniciales, vivas, peso };
  }, [indice, g, desde, hoy]);
  const dias = g.nacimiento ? Math.round((new Date(`${hoy}T12:00:00`).getTime() - new Date(`${g.nacimiento}T12:00:00`).getTime()) / 86400000) : null;
  const std = dias != null && g.linea ? estandarDe(g.linea, dias / 7) : null;
  const viab = datos.iniciales && datos.vivas != null ? (datos.vivas * 100) / datos.iniciales : null;
  const kilos = datos.peso != null && datos.vivas != null ? (datos.peso / 1000) * datos.vivas : null;
  const ca = kilos && datos.alimento ? datos.alimento / kilos : null;
  const iep = viab != null && datos.peso != null && ca && dias ? (viab * (datos.peso / 1000)) / (dias * ca) * 100 : null;
  const k = (t: string, v: string, d?: string, tono?: string) => (
    <div className={`kpi ${tono ?? ''}`}>
      <span className="kpi-titulo">{t}</span>
      <span className="kpi-valor">{v}</span>
      {d && <span className="kpi-detalle">{d}</span>}
    </div>
  );
  return (
    <div className="kpis">
      {k('Edad', dias != null ? `${dias} días` : '–')}
      {k('Aves vivas', datos.vivas != null ? num(datos.vivas) : '–', viab != null ? `viabilidad ${num(viab, 1)} %` : undefined)}
      {k('Peso (último pesaje)', datos.peso != null ? `${num(datos.peso)} g` : '–', std?.pesoAve != null ? `guía ${num(std.pesoAve)} g` : undefined, datos.peso != null && std?.pesoAve != null && datos.peso < std.pesoAve * 0.93 ? 'mal' : undefined)}
      {k('Alimento acumulado', `${num(datos.alimento)} kg`)}
      {k('Conversión', ca != null ? num(ca, 3) : '–', std?.ca != null ? `guía ${num(std.ca, 3)}` : undefined, ca != null && std?.ca != null && ca > std.ca + 0.05 ? 'atencion' : undefined)}
      {k('IEP', iep != null ? num(iep) : '–', 'viabilidad × peso ÷ (edad × conversión)')}
    </div>
  );
}
