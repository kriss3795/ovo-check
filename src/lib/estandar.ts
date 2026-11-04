// Comparación con el estándar de la línea genética y detección de datos que parecen mal anotados.
// Todo esto lo ve solo el supervisor: el operario nunca recibe rangos ni pistas.
import { LINEAS, LINEAS_BROILER, type Linea, type LineaBroiler } from './curvas';
import type { Config, Galpon, Registro } from './tipos';
import { diasEntre, num } from './util';

export { LINEAS, LINEAS_BROILER };

/** Qué produce el galpón según su línea genética. Sin línea = ponedoras (como siempre). */
export type Rubro = 'postura' | 'reproductora' | 'engorda';
export const lineaBroiler = (id: string | null | undefined): LineaBroiler | undefined => (id ? LINEAS_BROILER.find((l) => l.id === id) : undefined);
export const rubroDe = (lineaId: string | null | undefined): Rubro => lineaBroiler(lineaId)?.tipo ?? 'postura';
/** Tipo de aves de un galpón: el que eligió el supervisor o, si no, el de su línea genética. */
export const rubroGalpon = (g: Pick<Galpon, 'rubro' | 'linea'> | undefined): Rubro => g?.rubro ?? rubroDe(g?.linea);
export const NOMBRE_RUBRO: Record<Rubro, string> = { postura: 'Ponedoras', reproductora: 'Reproductoras broiler', engorda: 'Pollos de engorda' };
export const nombreLinea = (id: string | null | undefined) => (id ? (LINEAS.find((l) => l.id === id)?.nombre ?? lineaBroiler(id)?.nombre ?? id) : '');

/** Lo que dice la guía para una semana de edad (interpolado entre semanas publicadas). */
export interface Estandar {
  semana: number;
  postura: number | null;
  pesoHuevo: number | null;
  alimento: number | null;
  pesoAve: number | null;
  mortAcum: number | null;
  /** Engorda: conversión acumulada de la guía. Reproductoras: % de huevos incubables. */
  ca?: number | null;
  incubables?: number | null;
  /** Edad en días (engorda). */
  dia?: number;
}

export const lineaPorId = (id: string | null | undefined): Linea | undefined => (id ? LINEAS.find((l) => l.id === id) : undefined);

function interpolar(filas: (number | null)[][], semana: number, col: number): number | null {
  if (!filas.length) return null;
  const xs = filas.filter((f) => f[col] != null);
  if (!xs.length || semana < (xs[0][0] as number) || semana > (xs[xs.length - 1][0] as number)) return null;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i];
    if (a[0] === semana) return a[col] as number;
    const b = xs[i + 1];
    if (b && (a[0] as number) < semana && semana < (b[0] as number)) {
      const t = (semana - (a[0] as number)) / ((b[0] as number) - (a[0] as number));
      return (a[col] as number) + t * ((b[col] as number) - (a[col] as number));
    }
  }
  return null;
}

/** Estándar de una línea a una edad dada en semanas (con decimales: la semana 30,5 queda entre la 30 y la 31). */
export function estandarDe(lineaId: string | null | undefined, semana: number | null): Estandar | null {
  if (semana == null) return null;
  const b = lineaBroiler(lineaId);
  if (b?.tipo === 'engorda') {
    // Pollo de engorda: la guía es por día de edad.
    const d = b.engorda as (number | null)[][];
    const dia = semana * 7;
    return { semana, dia, postura: null, pesoHuevo: null, alimento: interpolar(d, dia, 2), pesoAve: interpolar(d, dia, 1), mortAcum: null, ca: interpolar(d, dia, 4) };
  }
  if (b?.tipo === 'reproductora') {
    const p = b.postura!;
    const r = b.recria!;
    const enPostura = semana >= (p[0]?.[0] as number);
    return {
      semana,
      postura: enPostura ? interpolar(p, semana, 1) : null,
      pesoHuevo: enPostura ? interpolar(p, semana, 2) : null,
      alimento: enPostura ? interpolar(p, semana, 3) : interpolar(r, semana, 2),
      pesoAve: enPostura ? interpolar(p, semana, 4) : interpolar(r, semana, 1),
      mortAcum: enPostura ? interpolar(p, semana, 5) : null,
      incubables: enPostura ? interpolar(p, semana, 6) : null,
    };
  }
  const l = lineaPorId(lineaId);
  if (!l) return null;
  const p = l.postura as (number | null)[][];
  const r = l.recria as (number | null)[][];
  const enPostura = semana >= (p[0]?.[0] as number);
  return {
    semana,
    postura: enPostura ? interpolar(p, semana, 1) : null,
    pesoHuevo: enPostura ? interpolar(p, semana, 2) : null,
    alimento: enPostura ? interpolar(p, semana, 3) : interpolar(r, semana, 2),
    pesoAve: enPostura ? interpolar(p, semana, 4) : interpolar(r, semana, 1),
    mortAcum: enPostura ? interpolar(p, semana, 5) : null,
  };
}

/** Edad del lote en semanas cumplidas a una fecha (la semana 1 es la primera semana de vida). */
export function edadSemanas(galpon: Galpon | undefined, fecha: string): number | null {
  if (!galpon?.nacimiento) return null;
  const d = diasEntre(galpon.nacimiento, fecha);
  return d < 0 ? null : d / 7;
}

/** Semana en números redondos para mostrar ("semana 34"). */
export const semanaTexto = (s: number) => `semana ${Math.floor(s) + 1}`;

/** Márgenes con que se compara contra la curva. Son puntos de partida: cada plantel los ajusta. */
export const DESVIO = {
  /** Puntos de postura bajo el estándar. */
  postura: 5,
  /** % de diferencia en el alimento por ave. */
  alimento: 15,
  /** Gramos de peso de huevo bajo el estándar. */
  pesoHuevo: 3,
  /** % del peso vivo bajo el estándar. */
  pesoAve: 5,
};

/** Qué representa un dato para compararlo con la curva (además de la magnitud que ya conoce la lógica general). */
export function tipoDato(nombreTarea: string, etiqueta: string, unidad: string, indicador: string): 'peso_huevo' | 'peso_ave' | null {
  const t = `${nombreTarea} ${etiqueta} ${indicador}`.toLowerCase();
  const u = unidad.trim().toLowerCase();
  if (!/^(g|gr|grs|gramos?|kg|kilos?)$/.test(u)) return null;
  if (/huevo/.test(t) && /peso/.test(t)) return 'peso_huevo';
  if (/(ave|gallina|pollita|corporal)/.test(t) && /peso|pesaje/.test(t)) return 'peso_ave';
  return null;
}

/** Peso en gramos, venga en g o en kg. */
export const enGramos = (v: number, unidad: string) => (/^(kg|kilos?)$/i.test(unidad.trim()) ? v * 1000 : v);

/** Texto corto del estándar para el supervisor: "estándar Hy-Line Brown, semana 34". */
export function rotuloEstandar(lineaId: string, semana: number) {
  if (rubroDe(lineaId) === 'engorda') return `estándar ${nombreLinea(lineaId)}, día ${Math.round(semana * 7)}`;
  return `estándar ${nombreLinea(lineaId)}, ${semanaTexto(semana)}`;
}

/** Edad para mostrar: en días para pollos de engorda, en semanas para el resto. */
export function edadTexto(g: Galpon | undefined, fecha: string): string | null {
  const s = edadSemanas(g, fecha);
  if (s == null) return null;
  return rubroGalpon(g) === 'engorda' ? `día ${Math.round(s * 7)}` : semanaTexto(s);
}

/**
 * Avisos al comparar un registro con la curva de su línea genética. Devuelve frases listas para el supervisor.
 * `valores` trae el indicador ya calculado por la lógica general (postura %, g de alimento por ave).
 */
export function avisosCurva(p: {
  config: Config;
  registro: Registro;
  postura: number | null;
  alimentoAve: number | null;
}): string[] {
  const out: string[] = [];
  const g = p.config.galpones.find((x) => x.id === p.registro.galpon_id);
  const semana = edadSemanas(g, p.registro.fecha);
  if (!g?.linea || semana == null) return out;
  const e = estandarDe(g.linea, semana);
  if (!e) return out;
  const rot = rotuloEstandar(g.linea, semana);
  // La postura recién partida (antes del 50 %) varía mucho de un plantel a otro: se compara desde la semana 24.
  if (p.postura != null && e.postura != null && semana >= 23 && p.postura < e.postura - DESVIO.postura) {
    out.push(`Postura ${num(p.postura, 1)} %: ${num(e.postura - p.postura, 1)} puntos bajo el ${rot} (${num(e.postura, 1)} %)`);
  }
  if (p.alimentoAve != null && e.alimento != null) {
    const dif = ((p.alimentoAve - e.alimento) / e.alimento) * 100;
    if (Math.abs(dif) >= DESVIO.alimento) {
      out.push(`Alimento ${num(p.alimentoAve)} g por ave: ${num(Math.abs(dif))} % ${dif < 0 ? 'bajo' : 'sobre'} el ${rot} (${num(e.alimento)} g)`);
    }
  }
  const campos = p.registro.tarea?.campos ?? [];
  campos.forEach((c, i) => {
    const v = p.registro.valores[i];
    if (v == null || c.saldo) return;
    const tipo = tipoDato(p.registro.tarea?.nombre ?? '', c.etiqueta, c.unidad, c.indicador);
    const gr = enGramos(v, c.unidad);
    if (tipo === 'peso_huevo' && e.pesoHuevo != null && gr < e.pesoHuevo - DESVIO.pesoHuevo) {
      out.push(`Peso de huevo ${num(gr, 1)} g: ${num(e.pesoHuevo - gr, 1)} g bajo el ${rot} (${num(e.pesoHuevo, 1)} g)`);
    }
    if (tipo === 'peso_ave' && e.pesoAve != null) {
      const rubro = rubroGalpon(g);
      if (gr < e.pesoAve * 0.2 && !/kg/i.test(c.unidad)) {
        out.push(`Peso ${num(v, 2)} ${c.unidad}: parece anotado en kilos y no en gramos (la guía dice ${num(e.pesoAve)} g)`);
        return;
      }
      const dif = ((gr - e.pesoAve) / e.pesoAve) * 100;
      // Engorda: bajo la guía es lo que importa. Reproductoras: también pasarse de peso es un problema.
      const limite = rubro === 'engorda' ? 7 : DESVIO.pesoAve;
      if (dif < -limite || (rubro === 'reproductora' && dif > limite)) {
        out.push(`Peso vivo ${num(gr)} g: ${num(Math.abs(dif))} % ${dif < 0 ? 'bajo' : 'sobre'} el ${rot} (${num(e.pesoAve)} g)`);
      }
    }
  });
  return out;
}

/** Estadística de una muestra de pesos: promedio, CV y uniformidad (% de aves dentro de ±10 % del promedio). */
export function estadisticaMuestra(xs: number[]): { n: number; promedio: number; cv: number; uniformidad: number; min: number; max: number } | null {
  const v = xs.filter((x) => Number.isFinite(x) && x > 0);
  if (!v.length) return null;
  const promedio = v.reduce((a, b) => a + b, 0) / v.length;
  const de = Math.sqrt(v.reduce((a, b) => a + (b - promedio) ** 2, 0) / Math.max(1, v.length - 1));
  const dentro = v.filter((x) => Math.abs(x - promedio) <= promedio * 0.1).length;
  return { n: v.length, promedio, cv: (de / promedio) * 100, uniformidad: (dentro * 100) / v.length, min: Math.min(...v), max: Math.max(...v) };
}
