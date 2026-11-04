// Producción por semana de vida del lote (o por semana del calendario si no se sabe la edad),
// comparada con la curva de la línea genética. Sale de los mismos registros diarios que ve el supervisor.
import { edadSemanas, estandarDe, lineaPorId, tipoDato, enGramos } from './estandar';
import { diaGalpon, type Dia } from './indicadores';
import type { Indice } from './logica';
import type { Galpon } from './tipos';
import { diasEntre, sumarDias } from './util';

export interface Semana {
  /** Semana de vida (1 = primera semana) o, sin fecha de nacimiento, número de semana desde el inicio del período. */
  n: number;
  desde: string;
  hasta: string;
  diasConDatos: number;
  postura: number | null;
  gAve: number | null;
  mlAve: number | null;
  relacion: number | null;
  muertas: number;
  /** Mortalidad de la semana, % de las aves al comienzo de la semana. */
  mortSemana: number | null;
  /** Mortalidad acumulada desde que empezó el lote, %. */
  mortAcum: number | null;
  pesoHuevo: number | null;
  /** Gramos de huevo por ave al día (postura × peso de huevo). */
  masa: number | null;
  pesoAve: number | null;
  huevos: number;
  std: ReturnType<typeof estandarDe>;
}

const prom = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Pesos promedio anotados en la semana (huevo y ave), de las tareas de pesaje. */
function pesos(indice: Indice, g: Galpon, desde: string, hasta: string) {
  const huevo: number[] = [];
  const ave: number[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    for (const r of indice.delDia(f, g.id)) {
      if (r.omitida) continue;
      (r.tarea?.campos ?? []).forEach((c, i) => {
        const v = r.valores[i];
        if (v == null || c.saldo) return;
        const t = tipoDato(r.tarea?.nombre ?? '', c.etiqueta, c.unidad, c.indicador);
        if (t === 'peso_huevo') huevo.push(enGramos(v, c.unidad));
        if (t === 'peso_ave') ave.push(enGramos(v, c.unidad));
      });
    }
  }
  return { huevo: prom(huevo), ave: prom(ave) };
}

/** Inicio del lote actual del galpón: desde ahí se acumula la mortalidad. */
export const inicioLote = (g: Galpon) => g.reinicio ?? g.desde ?? null;

/**
 * Semanas de un galpón entre dos fechas. Con fecha de nacimiento, cada semana es una semana de vida (como en la guía
 * genética); sin ella, semanas corridas desde `desde`.
 */
export function semanasGalpon(indice: Indice, g: Galpon, desde: string, hasta: string): Semana[] {
  const inicio = inicioLote(g);
  if (inicio && desde < inicio) desde = inicio;
  if (desde > hasta) return [];
  // Alinear al comienzo de la semana de vida.
  let primero = desde;
  if (g.nacimiento) {
    const off = ((diasEntre(g.nacimiento, desde) % 7) + 7) % 7;
    primero = sumarDias(desde, -off);
  }
  // Mortalidad acumulada: desde el inicio del lote hasta antes del período.
  let avesIniciales: number | null = null;
  let muertasPrevias = 0;
  if (inicio) {
    const d0 = diaGalpon(indice, g, inicio);
    avesIniciales = d0.aves;
    for (let f = inicio; f < primero; f = sumarDias(f, 1)) muertasPrevias += diaGalpon(indice, g, f).muertas ?? 0;
  }
  const out: Semana[] = [];
  let acum = muertasPrevias;
  for (let a = primero, k = 0; a <= hasta; a = sumarDias(a, 7), k++) {
    const b = sumarDias(a, 6) > hasta ? hasta : sumarDias(a, 6);
    const ds: Dia[] = [];
    for (let f = a < desde ? desde : a; f <= b; f = sumarDias(f, 1)) ds.push(diaGalpon(indice, g, f));
    const conDatos = ds.filter((d) => d.huevos != null || d.muertas != null || d.aguaL != null || d.alimKg != null);
    const muertas = ds.reduce((t, d) => t + (d.muertas ?? 0), 0);
    const avesInicioSemana = ds.find((d) => d.aves)?.aves ?? null;
    if (avesIniciales == null) avesIniciales = avesInicioSemana;
    acum += muertas;
    const edad = edadSemanas(g, a);
    const n = edad != null ? Math.floor(edad) + 1 : k + 1;
    const p = pesos(indice, g, a, b);
    const postura = prom(ds.map((d) => d.postura));
    out.push({
      n,
      desde: a,
      hasta: b,
      diasConDatos: conDatos.length,
      postura,
      gAve: prom(ds.map((d) => d.gAve)),
      mlAve: prom(ds.map((d) => d.mlAve)),
      relacion: prom(ds.map((d) => d.relacion)),
      muertas,
      mortSemana: avesInicioSemana ? (muertas * 100) / avesInicioSemana : null,
      mortAcum: avesIniciales ? (acum * 100) / avesIniciales : null,
      pesoHuevo: p.huevo,
      masa: postura != null && p.huevo != null ? (postura / 100) * p.huevo : null,
      pesoAve: p.ave,
      huevos: ds.reduce((t, d) => t + (d.huevos ?? 0), 0),
      // La guía se lee a mitad de la semana de vida.
      std: g.linea && edad != null ? estandarDe(g.linea, n - 1 + 0.5) : null,
    });
  }
  return out;
}

/** Resumen de un galpón para compararlo con los demás: los últimos 7 días contra su estándar. */
export function resumenGalpon(indice: Indice, g: Galpon, hoy: string) {
  const ultimos = semanasGalpon(indice, g, sumarDias(hoy, -6), hoy);
  const ds: Dia[] = [];
  for (let f = sumarDias(hoy, -6); f <= hoy; f = sumarDias(f, 1)) ds.push(diaGalpon(indice, g, f));
  const edad = edadSemanas(g, hoy);
  const std = g.linea && edad != null ? estandarDe(g.linea, edad) : null;
  const acumulada = inicioLote(g) ? semanasGalpon(indice, g, inicioLote(g)!, hoy).at(-1)?.mortAcum ?? null : (ultimos.at(-1)?.mortAcum ?? null);
  return {
    g,
    semana: edad != null ? Math.floor(edad) + 1 : null,
    linea: lineaPorId(g.linea)?.nombre ?? null,
    postura: prom(ds.map((d) => d.postura)),
    gAve: prom(ds.map((d) => d.gAve)),
    mlAve: prom(ds.map((d) => d.mlAve)),
    relacion: prom(ds.map((d) => d.relacion)),
    mortAcum: acumulada,
    aves: ds.at(-1)?.aves ?? g.aves,
    std,
  };
}
