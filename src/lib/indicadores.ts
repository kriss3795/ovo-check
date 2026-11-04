// Indicadores productivos para el supervisor: lo del día por galpón, la ficha de cada lote y su proyección.
// Todo sale de lo que anotaron los operarios. Cada número se puede rastrear hasta sus registros.
import { Indice, baseDe, magnitud } from './logica';
import { lotesDe, semanaDeEdad } from './modulos';
import type { Config, Galpon, Lote, RegistroLocal } from './tipos';
import { diasEntre, sumarDias } from './util';

export interface Dia {
  fecha: string;
  galpon_id: string;
  /** Aves con que se calculan los porcentajes y consumos por ave. */
  aves: number | null;
  muertas: number | null;
  vivas: number | null;
  huevos: number | null;
  postura: number | null;
  mortalidad: number | null;
  aguaL: number | null;
  mlAve: number | null;
  alimKg: number | null;
  gAve: number | null;
  relacion: number | null;
  tmin: number | null;
  tmax: number | null;
}

/** Lo registrado en un galpón un día, ya convertido en indicadores. */
export function diaGalpon(indice: Indice, g: Galpon, fecha: string): Dia {
  const d: Dia = { fecha, galpon_id: g.id, aves: null, muertas: null, vivas: null, huevos: null, postura: null, mortalidad: null, aguaL: null, mlAve: null, alimKg: null, gAve: null, relacion: null, tmin: null, tmax: null };
  for (const r of indice.delDia(fecha, g.id)) {
    const campos = r.tarea?.campos ?? [];
    if (r.omitida) continue;
    campos.forEach((c, i) => {
      const v = r.valores[i];
      if (v == null) return;
      if (c.saldo) {
        d.vivas = v;
        return;
      }
      const m = magnitud(campos, i);
      if (m === 'mortalidad') d.muertas = (d.muertas ?? 0) + v;
      else if (m === 'postura') d.huevos = (d.huevos ?? 0) + v;
      else if (m === 'agua') d.aguaL = baseDe(indice, r, i);
      else if (m === 'alimento') d.alimKg = baseDe(indice, r, i);
      else if (m === 'temperatura') {
        if (/m[aá]x/i.test(c.etiqueta)) d.tmax = v;
        else if (/m[ií]n/i.test(c.etiqueta)) d.tmin = v;
        else d.tmax = d.tmax == null ? v : Math.max(d.tmax, v);
      }
    });
  }
  // Aves del día: las vivas anotadas antes de hoy (con hoy se cuentan las muertas de hoy) o la ficha del galpón.
  const antes = indice.avesAnotadas(fecha, g.id, true);
  d.aves = antes?.aves ?? (d.vivas != null ? d.vivas + (d.muertas ?? 0) : g.aves ?? null);
  if (d.aves) {
    if (d.huevos != null) d.postura = (d.huevos * 100) / d.aves;
    if (d.muertas != null) d.mortalidad = (d.muertas * 100) / d.aves;
    if (d.aguaL != null) d.mlAve = (d.aguaL * 1000) / d.aves;
    if (d.alimKg != null) d.gAve = (d.alimKg * 1000) / d.aves;
  }
  if (d.aguaL != null && d.alimKg) d.relacion = d.aguaL / d.alimKg;
  return d;
}

/** Días de un período para varios galpones. */
export function dias(indice: Indice, galpones: Galpon[], desde: string, hasta: string): Dia[] {
  const out: Dia[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) for (const g of galpones) out.push(diaGalpon(indice, g, f));
  return out;
}

/** Suma de varios galpones el mismo día (para ver el plantel entero). */
export function sumarDia(lista: Dia[]): Omit<Dia, 'galpon_id'> {
  const s = (k: keyof Dia) => (lista.some((d) => d[k] != null) ? lista.reduce((t, d) => t + ((d[k] as number) ?? 0), 0) : null);
  const aves = s('aves');
  const huevos = s('huevos');
  const muertas = s('muertas');
  const aguaL = s('aguaL');
  const alimKg = s('alimKg');
  const conAves = (k: keyof Dia) => lista.filter((d) => d[k] != null && d.aves).reduce((t, d) => t + (d.aves ?? 0), 0);
  const tmins = lista.map((d) => d.tmin).filter((x): x is number => x != null);
  const tmaxs = lista.map((d) => d.tmax).filter((x): x is number => x != null);
  return {
    fecha: lista[0]?.fecha ?? '',
    aves,
    muertas,
    vivas: s('vivas'),
    huevos,
    postura: huevos != null && conAves('huevos') ? (huevos * 100) / conAves('huevos') : null,
    mortalidad: muertas != null && conAves('muertas') ? (muertas * 100) / conAves('muertas') : null,
    aguaL,
    mlAve: aguaL != null && conAves('aguaL') ? (aguaL * 1000) / conAves('aguaL') : null,
    alimKg,
    gAve: alimKg != null && conAves('alimKg') ? (alimKg * 1000) / conAves('alimKg') : null,
    relacion: aguaL != null && alimKg ? aguaL / alimKg : null,
    tmin: tmins.length ? Math.min(...tmins) : null,
    tmax: tmaxs.length ? Math.max(...tmaxs) : null,
  };
}

// ------------------------------------------------------------------ lotes
/** En qué galpón estuvo el lote cada día, según sus traslados. */
export function galponDelLote(lote: Lote, gestion: RegistroLocal[]): (fecha: string) => string | null {
  const traslados = gestion
    .filter((r) => r.tipo === 'lote' && r.detalle?.sub === 'traslado' && r.detalle?.lote_id === lote.id)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const inicial = traslados[0]?.detalle?.de ?? lote.galpon_id;
  return (fecha: string) => {
    let g: string | null = inicial;
    for (const t of traslados) if (t.fecha <= fecha) g = t.detalle?.a ?? g;
    return g;
  };
}

export interface FichaLote {
  lote: Lote;
  semana: number | null;
  desde: string;
  hasta: string;
  dias: number;
  avesIniciales: number | null;
  avesActuales: number | null;
  muertasAcum: number;
  mortalidadAcum: number | null;
  huevosAcum: number;
  haa: number | null;
  postura7: number | null;
  gAve7: number | null;
  mlAve7: number | null;
  /** Kilos de alimento por docena de huevos, últimos 7 días. */
  kgDocena7: number | null;
  /** Postura promedio de cada semana de edad (o de cada semana desde el ingreso si no hay fecha de nacimiento). */
  semanas: { semana: number; postura: number | null; mortalidad: number | null; gAve: number | null }[];
  proyeccion: Proyeccion | null;
  diasDatos: Dia[];
}

export interface Proyeccion {
  semanaCierre: number;
  semanasRestantes: number;
  /** Mortalidad semanal promedio de las últimas 4 semanas, en %. */
  mortalidadSemanal: number;
  posturaActual: number;
  avesCierre: number;
  mortalidadAcumCierre: number | null;
  huevosCierre: number;
  haaCierre: number | null;
}

export function fichaLote(config: Config, indice: Indice, lote: Lote, hoy: string): FichaLote {
  const hasta = lote.estado === 'cerrado' && lote.cierre ? lote.cierre : hoy;
  const desde = lote.ingreso || hoy;
  const donde = galponDelLote(lote, indice.gestion);
  const galpones = new Map(config.galpones.map((g) => [g.id, g]));
  const diasDatos: Dia[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const gid = donde(f);
    const g = gid ? galpones.get(gid) : undefined;
    if (g) diasDatos.push(diaGalpon(indice, { ...g, aves: g.lote_id === lote.id ? g.aves : null }, f));
  }
  const muertasAcum = diasDatos.reduce((t, d) => t + (d.muertas ?? 0), 0);
  const huevosAcum = diasDatos.reduce((t, d) => t + (d.huevos ?? 0), 0);
  const ultimaVivas = [...diasDatos].reverse().find((d) => d.vivas != null)?.vivas ?? null;
  const ini = lote.aves_iniciales;
  const avesActuales = ultimaVivas ?? (ini != null ? ini - muertasAcum : null);
  const ult7 = diasDatos.filter((d) => d.fecha > sumarDias(hasta, -7));
  const prom = (l: Dia[], k: keyof Dia) => {
    const v = l.map((d) => d[k]).filter((x): x is number => typeof x === 'number');
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const huevos7 = ult7.reduce((t, d) => t + (d.huevos ?? 0), 0);
  const alim7 = ult7.reduce((t, d) => t + (d.alimKg ?? 0), 0);
  const semana = semanaDeEdad(lote, hasta);
  // Semanas: por edad si hay fecha de nacimiento; si no, desde el ingreso.
  const numSemana = (f: string) => semanaDeEdad(lote, f) ?? Math.floor(diasEntre(desde, f) / 7) + 1;
  const porSemana = new Map<number, Dia[]>();
  for (const d of diasDatos) {
    const s = numSemana(d.fecha);
    porSemana.set(s, [...(porSemana.get(s) ?? []), d]);
  }
  const semanas = [...porSemana.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([s, l]) => {
      const muertas = l.reduce((t, d) => t + (d.muertas ?? 0), 0);
      const aves = l.find((d) => d.aves)?.aves ?? null;
      return { semana: s, postura: prom(l, 'postura'), mortalidad: aves && l.some((d) => d.muertas != null) ? (muertas * 100) / aves : null, gAve: prom(l, 'gAve') };
    });

  // Proyección al cierre: si se mantienen la mortalidad semanal y la postura de las últimas semanas.
  let proyeccion: Proyeccion | null = null;
  if (lote.estado === 'activo' && lote.semana_cierre && semana && avesActuales && lote.semana_cierre > semana) {
    const ult4 = semanas.filter((s) => s.semana > semana - 4 && s.semana <= semana && s.mortalidad != null);
    const mortSem = ult4.length ? ult4.reduce((t, s) => t + (s.mortalidad ?? 0), 0) / ult4.length : 0;
    const post = prom(ult7, 'postura') ?? 0;
    const restantes = lote.semana_cierre - semana;
    let aves = avesActuales;
    let huevos = 0;
    for (let i = 0; i < restantes; i++) {
      huevos += aves * (post / 100) * 7;
      aves *= 1 - mortSem / 100;
    }
    proyeccion = {
      semanaCierre: lote.semana_cierre,
      semanasRestantes: restantes,
      mortalidadSemanal: mortSem,
      posturaActual: post,
      avesCierre: Math.round(aves),
      mortalidadAcumCierre: ini ? ((ini - aves) * 100) / ini : null,
      huevosCierre: Math.round(huevosAcum + huevos),
      haaCierre: ini ? (huevosAcum + huevos) / ini : null,
    };
  }
  return {
    lote,
    semana,
    desde,
    hasta,
    dias: diasDatos.length,
    avesIniciales: ini,
    avesActuales,
    muertasAcum,
    mortalidadAcum: ini ? (muertasAcum * 100) / ini : null,
    huevosAcum,
    haa: ini ? huevosAcum / ini : null,
    postura7: prom(ult7, 'postura'),
    gAve7: prom(ult7, 'gAve'),
    mlAve7: prom(ult7, 'mlAve'),
    kgDocena7: huevos7 > 0 && alim7 > 0 ? alim7 / (huevos7 / 12) : null,
    semanas,
    proyeccion,
    diasDatos,
  };
}

export const lotesActivos = (c: Config) => lotesDe(c).filter((l) => l.estado === 'activo');

// ------------------------------------------------------------------ sanidad
/** Tratamientos con huevos en resguardo hoy (desde el inicio del tratamiento hasta el fin más los días de resguardo). */
export function resguardos(gestion: RegistroLocal[], hoy: string) {
  return gestion
    .filter((r) => r.tipo === 'sanidad' && r.detalle?.sub === 'tratamiento' && r.detalle?.hasta)
    .map((r) => ({ r, fin: sumarDias(r.detalle!.hasta, Number(r.detalle!.resguardo_dias ?? 0)) }))
    .filter((x) => x.r.detalle!.desde <= hoy && x.fin >= hoy)
    .map((x) => ({ producto: x.r.detalle!.producto as string, galpones: (x.r.detalle!.galpones_nombres as string) ?? '', galpon_ids: (x.r.detalle!.galpones as string[]) ?? [], hasta: x.fin, id: x.r.id }));
}
