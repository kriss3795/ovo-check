// Reglas del día a día: qué tareas tocan, qué está hecho y qué se marca para el supervisor.
import type { Campo, Config, Flag, Galpon, Logica, Pausa, Registro, RegistroLocal, Revision, Tarea } from './tipos';
import { BIBLIOTECA, RUTINA_CLASICA } from './plantillas';
import { diaSemana, diasEntre, fechaCorta, fechaLocal, fechaRelativa, num } from './util';

/** Hora límite de cada bloque: pasada esa hora, lo pendiente se muestra como atrasado. */
export const LIMITE_BLOQUE = { manana: 13, tarde: 20 } as const;
export const NOMBRE_BLOQUE = { manana: 'Mañana', tarde: 'Tarde' } as const;

export const FLAGS_CRITICOS: Flag[] = ['problema', 'retrocede', 'no_calza', 'ilogico'];
export const FLAGS_CONFIANZA: Flag[] = ['lejos', 'sin_foto', 'omitida', 'temprano'];
/** Antes de esta hora, una tarea de la tarde se considera registrada antes de tiempo. */
export const HORA_INICIO_TARDE = 12;

export const NOMBRE_FLAG: Record<Flag | 'reloj', string> = {
  problema: 'Problema informado',
  retrocede: 'Lectura menor que la anterior',
  no_calza: 'Las aves vivas no calzan',
  ilogico: 'Fuera de los límites',
  lejos: 'Lejos del galpón',
  sin_foto: 'Sin foto',
  omitida: 'No se hizo',
  temprano: 'Registrada antes de hora',
  reloj: 'Reloj del teléfono desajustado',
};

/**
 * ¿Correspondía pedir esta tarea (o tener en producción este galpón) ese día?
 * Hoy manda el interruptor. Para días anteriores se mira su historia: no cuenta antes de que existiera ni durante
 * sus pausas, así esos días no aparecen como "sin registrar".
 */
export function vigenteEn(x: { activo: boolean; desde?: string; pausas?: Pausa[] }, fecha: string): boolean {
  if (fecha >= fechaLocal()) return x.activo;
  if (x.desde && fecha < x.desde) return false;
  if (x.pausas?.length) return !x.pausas.some((p) => fecha >= p.desde && (!p.hasta || fecha < p.hasta));
  return x.activo;
}

/** Anota en la ficha el inicio o el fin de una pausa cuando cambia el interruptor. Se llama al guardar. */
export function anotarPausa<T extends { activo: boolean; desde?: string; pausas?: Pausa[] }>(nuevo: T, antes: T | undefined, hoy: string): T {
  if (!antes) return { ...nuevo, desde: hoy, ...(nuevo.activo ? {} : { pausas: [{ desde: hoy }] }) };
  if (antes.activo && !nuevo.activo) return { ...nuevo, pausas: [...(antes.pausas ?? []), { desde: hoy }] };
  if (!antes.activo && nuevo.activo) {
    const pausas = [...(antes.pausas ?? [])];
    const ultima = pausas[pausas.length - 1];
    // Datos anteriores a esta versión no tienen la fecha en que empezó la pausa: se toma hoy como nuevo inicio.
    if (!ultima || ultima.hasta) return { ...nuevo, desde: hoy };
    pausas[pausas.length - 1] = { ...ultima, hasta: hoy };
    return { ...nuevo, pausas };
  }
  return { ...nuevo, desde: antes.desde, pausas: antes.pausas };
}

export function tareasDe(config: Config, galponId: string, fecha: string): Tarea[] {
  // Antes de que existiera el plantel no había nada que registrar. (Nunca aplica a hoy.)
  if (fecha < fechaLocal() && config.granja.creado && fecha < config.granja.creado) return [];
  const galpon = config.galpones.find((g) => g.id === galponId);
  if (galpon && !vigenteEn(galpon, fecha)) return [];
  const dia = diaSemana(fecha);
  return config.tareas.filter((t) => vigenteEn(t, fecha) && t.dias.includes(dia) && (t.galpones === null || t.galpones.includes(galponId)));
}

/** Día de inicio del lote actual de cada galpón que lo tenga. */
export const reiniciosDe = (galpones: Galpon[] | undefined): Record<string, string> =>
  Object.fromEntries((galpones ?? []).filter((g) => g.reinicio).map((g) => [g.id, g.reinicio!]));

/** Índice de los registros vigentes: el último de cada tarea que no fue reemplazado por una corrección. */
export class Indice {
  private reemplazados = new Set<string>();
  private porClave = new Map<string, RegistroLocal>();
  porId = new Map<string, RegistroLocal>();
  private reemplazo = new Map<string, RegistroLocal>();
  private anulaciones = new Map<string, RegistroLocal>();
  problemas: RegistroLocal[] = [];
  /** Día en que empezó el lote actual de cada galpón: lo anterior no se usa para comparar con lo de ahora. */
  private reinicios: Record<string, string>;

  constructor(registros: RegistroLocal[], reinicios: Record<string, string> = {}) {
    this.reinicios = reinicios;
    for (const r of registros) {
      this.porId.set(r.id, r);
      if (r.corrige) {
        this.reemplazados.add(r.corrige);
        this.reemplazo.set(r.corrige, r);
      }
    }
    for (const r of registros) {
      if (this.reemplazados.has(r.id)) continue;
      if (r.tipo === 'problema') {
        if (!r.anulado) this.problemas.push(r);
        continue;
      }
      const k = `${r.fecha}|${r.galpon_id}|${r.tarea_id}`;
      // Una anulación deja sin efecto solo al registro que anula. Si había otro registro válido de la misma tarea
      // (por ejemplo, un duplicado), ese sigue vigente. Es la misma regla que usa el servidor para los recordatorios.
      if (r.anulado) {
        const a = this.anulaciones.get(k);
        if (!a || momento(r) >= momento(a)) this.anulaciones.set(k, r);
        continue;
      }
      const previo = this.porClave.get(k);
      if (!previo || momento(r) >= momento(previo)) this.porClave.set(k, r);
    }
  }

  /** Última anulación de una tarea en un día, si la tarea quedó sin registro vigente. */
  anulacion(fecha: string, galponId: string, tareaId: string): RegistroLocal | null {
    const k = `${fecha}|${galponId}|${tareaId}`;
    return this.porClave.has(k) ? null : (this.anulaciones.get(k) ?? null);
  }

  /** Registro vigente de una tarea en un día (null si está pendiente o fue anulado). */
  vigente(fecha: string, galponId: string, tareaId: string): RegistroLocal | null {
    return this.porClave.get(`${fecha}|${galponId}|${tareaId}`) ?? null;
  }

  /** Registros vigentes de un galpón en un día, incluidos los de tareas que ya no existen. */
  delDia(fecha: string, galponId: string): RegistroLocal[] {
    const out: RegistroLocal[] = [];
    const prefijo = `${fecha}|${galponId}|`;
    for (const [k, r] of this.porClave) if (k.startsWith(prefijo)) out.push(r);
    return out.sort((a, b) => momento(a) - momento(b));
  }

  esVigente(r: Registro): boolean {
    return !this.reemplazados.has(r.id) && !r.anulado;
  }

  /** Versiones anteriores de un registro, de la más reciente a la más antigua. */
  historia(r: Registro): RegistroLocal[] {
    const out: RegistroLocal[] = [];
    let actual: Registro | undefined = r;
    while (actual?.corrige) {
      const previo = this.porId.get(actual.corrige);
      if (!previo) break;
      out.push(previo);
      actual = previo;
    }
    return out;
  }

  reemplazadoPor(r: Registro): RegistroLocal | undefined {
    return this.reemplazo.get(r.id);
  }

  /** Desde qué día valen los registros para comparar con uno de `fecha`: el inicio del lote, si esa fecha ya es del lote actual. */
  private corte(fecha: string, galponId: string): string {
    const inicio = this.reinicios[galponId];
    return inicio && fecha >= inicio ? inicio : '';
  }

  /**
   * Últimas aves vivas anotadas en un galpón, hasta ese día (o antes de ese día si `estricto`).
   * Es el número que anotó el operario; la app no lo calcula.
   */
  avesAnotadas(fecha: string, galponId: string, estricto = false): { aves: number; fecha: string } | null {
    let mejor: RegistroLocal | null = null;
    let valor = 0;
    const corte = this.corte(fecha, galponId);
    for (const r of this.porClave.values()) {
      if (r.omitida || r.galpon_id !== galponId || r.fecha < corte) continue;
      if (estricto ? r.fecha >= fecha : r.fecha > fecha) continue;
      const i = r.tarea?.campos.findIndex((c) => c.saldo) ?? -1;
      const v = i >= 0 ? r.valores[i] : null;
      if (v == null || v <= 0) continue;
      if (!mejor || r.fecha > mejor.fecha || (r.fecha === mejor.fecha && momento(r) > momento(mejor))) {
        mejor = r;
        valor = v;
      }
    }
    return mejor ? { aves: valor, fecha: mejor.fecha } : null;
  }

  /** Lectura anterior de una tarea (para medidores acumulativos). */
  anterior(fecha: string, galponId: string, tareaId: string): RegistroLocal | null {
    let mejor: RegistroLocal | null = null;
    const corte = this.corte(fecha, galponId);
    for (const r of this.porClave.values()) {
      if (r.omitida || r.galpon_id !== galponId || r.tarea_id !== tareaId) continue;
      if (r.fecha >= fecha || r.fecha < corte) continue;
      if (r.valores[0] === null || r.valores[0] === undefined) continue;
      if (!mejor || r.fecha > mejor.fecha) mejor = r;
    }
    return mejor;
  }
}

export const momento = (r: Registro) => new Date(r.capturado ?? r.capturado_dispositivo).getTime();

export interface Evaluacion {
  /** El número anotado, o el consumo diario si es un medidor. */
  base: number | null;
  /** Indicador calculado (ml por ave, % de postura…), si aplica. */
  indicador: number | null;
  /** Medidor con una lectura menor que la anterior. */
  retrocede: boolean;
}

/** Calcula el consumo y el indicador de un dato. No lo compara con valores esperados: eso lo juzga el supervisor. */
export function evaluarCampo(
  campo: Campo,
  valor: number | null,
  galpon: Galpon | undefined,
  anterior: { valor: number; fecha: string } | null,
  fecha: string,
): Evaluacion {
  const ev: Evaluacion = { base: null, indicador: null, retrocede: false };
  if (valor === null) return ev;
  if (campo.acumulativo) {
    if (!anterior) return ev;
    const delta = valor - anterior.valor;
    if (delta < 0) {
      ev.retrocede = true;
      return ev;
    }
    ev.base = delta / Math.max(1, diasEntre(anterior.fecha, fecha));
  } else {
    ev.base = valor;
  }
  const aves = galpon?.aves ?? null;
  if (campo.calculo === 'por_ave') ev.indicador = aves ? (ev.base * 1000) / aves : null;
  if (campo.calculo === 'pct') ev.indicador = aves ? (ev.base * 100) / aves : null;
  return ev;
}

export interface Cuadre {
  /** Posición del dato "aves vivas" dentro de la tarea. */
  i: number;
  /** Aves vivas anotadas la vez anterior, y qué día fue. */
  antes: number;
  fechaAntes: string;
  /** Aves muertas anotadas ahora. */
  bajas: number;
  anotado: number;
  esperado: number;
  /** Lo anotado menos lo esperado: negativo = faltan aves; positivo = sobran. */
  diferencia: number;
}

/**
 * Compara las aves vivas anotadas con las de la vez anterior menos las muertas de hoy.
 * No corrige ni calcula nada por el operario: solo sirve para avisarle al supervisor cuando no calza.
 */
export function cuadreAves(campos: Campo[], valores: (number | null)[], previo: Registro | null): Cuadre | null {
  const i = campos.findIndex((c) => c.saldo);
  if (i < 1 || !previo || !previo.tarea?.campos?.[i]?.saldo) return null;
  const antes = previo.valores[i];
  const anotado = valores[i];
  const bajas = valores[0];
  if (antes == null || anotado == null || bajas == null) return null;
  const esperado = antes - bajas;
  return { i, antes, fechaAntes: previo.fecha, bajas, anotado, esperado, diferencia: anotado - esperado };
}

// ------------------------------------------------------------------ aves usadas en los cálculos
export interface AvesUsadas {
  aves: number | null;
  origen: 'anotadas' | 'ficha';
  fecha?: string;
}

/**
 * Con cuántas aves se calculan los indicadores de un registro: las últimas aves vivas que anotó el operario y, si
 * todavía no hay ninguna, las de la ficha del galpón. Para la mortalidad se usan las aves que había antes de contar.
 */
export function avesPara(indice: Indice, galpon: Galpon, fecha: string, campos: Campo[], valores: (number | null)[]): AvesUsadas {
  const propio = campos.findIndex((c) => c.saldo);
  if (propio >= 0) {
    const antes = indice.avesAnotadas(fecha, galpon.id, true);
    if (antes) return { aves: antes.aves, origen: 'anotadas', fecha: antes.fecha };
    const vivas = valores[propio];
    if (vivas != null && vivas > 0) return { aves: vivas + (valores[0] ?? 0), origen: 'anotadas', fecha };
  } else {
    const a = indice.avesAnotadas(fecha, galpon.id);
    if (a) return { aves: a.aves, origen: 'anotadas', fecha: a.fecha };
  }
  return { aves: galpon.aves ?? null, origen: 'ficha' };
}

// ------------------------------------------------------------------ límites de alerta
export const LOGICA_DEFECTO: Logica = { ratioMin: 1.5, ratioMax: 3, cambioPct: 20 };
/** Los valores con que salió la primera versión: quien los tenga guardados sin haberlos cambiado pasa a los actuales. */
const LOGICA_ANTERIOR: Logica = { ratioMin: 1.2, ratioMax: 3.5, cambioPct: 30 };
export function logicaDe(c: Config): Logica {
  const l = c.logica;
  if (!l || (l.ratioMin === LOGICA_ANTERIOR.ratioMin && l.ratioMax === LOGICA_ANTERIOR.ratioMax && l.cambioPct === LOGICA_ANTERIOR.cambioPct)) return LOGICA_DEFECTO;
  return { ...LOGICA_DEFECTO, ...l };
}

export type Magnitud = 'agua' | 'alimento' | 'temperatura' | 'postura' | 'mortalidad' | null;

/** Qué mide un dato, deducido de su unidad y su indicador. Sirve para sugerir límites y cruzar agua con alimento. */
export function magnitud(campos: Campo[], i: number): Magnitud {
  const c = campos[i];
  if (!c || c.saldo) return null;
  const u = c.unidad.trim().toLowerCase();
  if (u.includes('°')) return 'temperatura';
  if (c.calculo === 'por_ave' && /^(l|lt|lts|litros?)$/.test(u)) return 'agua';
  if (c.calculo === 'por_ave' && /^(kg|kgs|kilos?)$/.test(u)) return 'alimento';
  if (c.calculo === 'pct' && /postura/i.test(c.indicador)) return 'postura';
  if (c.calculo === 'pct' && /^aves?$/.test(u) && i === 0) return 'mortalidad';
  return null;
}

type Par = { min: number | null; max: number | null };
/**
 * Límites que sugiere la app para una ponedora en producción. Están puestos donde conviene que el supervisor se entere,
 * bastante antes de lo que ya sería grave. Cada plantel los ajusta a su genética, su clima y su manejo.
 */
const LIMITES_SUGERIDOS: Record<Exclude<Magnitud, null | 'temperatura'>, Par> = {
  agua: { min: 150, max: 400 }, // ml por ave al día
  alimento: { min: 85, max: 140 }, // g por ave al día
  postura: { min: null, max: 100 }, // %
  mortalidad: { min: null, max: 0.1 }, // % del lote en un día
};
const TEMPERATURA: { minima: Par; maxima: Par; otra: Par } = {
  minima: { min: 5, max: 26 }, // la mínima del día: frío bajo 5 °C; una noche que no baja de 26 °C es calor sostenido
  maxima: { min: 12, max: 32 }, // la máxima del día: sobre 32 °C ya hay estrés por calor
  otra: { min: 8, max: 32 },
};
/** Límites de la primera versión, demasiado anchos. Si están guardados tal cual, se reemplazan por los sugeridos de hoy. */
const LIMITES_ANTERIORES: Record<Exclude<Magnitud, null>, Par> = {
  temperatura: { min: -5, max: 45 },
  agua: { min: 100, max: 500 },
  alimento: { min: 60, max: 160 },
  postura: { min: null, max: 100 },
  mortalidad: { min: null, max: 0.3 },
};
const PREDEFINIDAS = new Map([...RUTINA_CLASICA, ...BIBLIOTECA].map((b) => [b.nombre, b.campos]));

/** Límites sugeridos para un dato: los de la tarea predefinida con ese nombre o, si no, según lo que mide. */
export function limitesSugeridos(nombreTarea: string, campos: Campo[], i: number): Par {
  const c = campos[i];
  const pre = PREDEFINIDAS.get(nombreTarea)?.[i];
  if (pre && pre.unidad === c.unidad && (pre.min !== undefined || pre.max !== undefined)) return { min: pre.min ?? null, max: pre.max ?? null };
  const m = magnitud(campos, i);
  if (m === 'temperatura') return /m[ií]n/i.test(c.etiqueta) ? TEMPERATURA.minima : /m[aá]x/i.test(c.etiqueta) ? TEMPERATURA.maxima : TEMPERATURA.otra;
  return m ? LIMITES_SUGERIDOS[m] : { min: null, max: null };
}

/** Límites vigentes de un dato: los que guardó el supervisor o, si no tocó nada, los sugeridos. */
export function limitesDe(nombreTarea: string, campos: Campo[], i: number): Par & { sugeridos: boolean } {
  const c = campos[i];
  const m = magnitud(campos, i);
  const viejos = m ? LIMITES_ANTERIORES[m] : null;
  const sinTocar = (c.min === undefined && c.max === undefined) || (viejos !== null && (c.min ?? null) === viejos.min && (c.max ?? null) === viejos.max);
  if (!sinTocar) return { min: c.min ?? null, max: c.max ?? null, sugeridos: false };
  return { ...limitesSugeridos(nombreTarea, campos, i), sugeridos: true };
}

/** En qué se expresa el resultado que ve el supervisor para un dato. */
export const unidadResultado = (c: Campo) => (c.calculo !== 'valor' ? c.indicador : c.acumulativo ? `${c.unidad} al día` : c.unidad);
const decRes = (c: Campo, x: number) => (c.calculo !== 'valor' ? decimalesIndicador(c, x) : c.acumulativo ? Math.max(c.decimales, 0) : c.decimales);
/** Un límite tal como lo escribió el supervisor: sin ceros de relleno. */
const limite = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const nombreDato = (nombreTarea: string, campos: Campo[], i: number) => (campos.filter((c) => !c.saldo).length > 1 ? campos[i].etiqueta : nombreTarea);

/** Número del día (no el del medidor): el consumo si es acumulativo, o lo anotado. */
export function baseDe(indice: Indice, r: Registro, i: number): number | null {
  const c = r.tarea?.campos[i];
  const v = r.valores[i];
  if (!c || v == null || r.omitida) return null;
  if (!c.acumulativo) return v;
  const prev = indice.anterior(r.fecha, r.galpon_id, r.tarea_id ?? '');
  const pv = prev?.valores[i];
  if (!prev || pv == null || v < pv) return null;
  return (v - pv) / Math.max(1, diasEntre(prev.fecha, r.fecha));
}

/** Agua (L) y alimento (kg) del día en un galpón, si ya están los dos. */
export function aguaYAlimento(indice: Indice, fecha: string, galponId: string, actual?: Registro): { agua: number; alimento: number; relacion: number } | null {
  let agua: number | null = null;
  let alimento: number | null = null;
  const regs = indice.delDia(fecha, galponId).filter((r) => !actual || r.tarea_id !== actual.tarea_id);
  if (actual) regs.push(actual as RegistroLocal);
  for (const r of regs) {
    r.tarea?.campos.forEach((_, i) => {
      const m = magnitud(r.tarea!.campos, i);
      if (m !== 'agua' && m !== 'alimento') return;
      const b = baseDe(indice, r, i);
      if (b == null) return;
      if (m === 'agua') agua = b;
      else alimento = b;
    });
  }
  if (agua == null || alimento == null || alimento <= 0) return null;
  return { agua, alimento, relacion: agua / alimento };
}

/**
 * Revisa un registro recién anotado contra lo lógico y devuelve, en palabras, lo que no cuadra.
 * Es solo para el supervisor: al operario no se le muestra nada ni se le impide guardar.
 */
export function avisosLogicos(p: { config: Config; indice: Indice; registro: Registro; evs: Evaluacion[] }): string[] {
  const r = p.registro;
  const campos = r.tarea?.campos ?? [];
  const nombre = r.tarea?.nombre ?? '';
  const out: string[] = [];
  if (!campos.length || r.omitida || r.anulado) return out;
  const logica = logicaDe(p.config);

  campos.forEach((c, i) => {
    if (c.saldo) return;
    const ev = p.evs[i];
    const x = c.calculo !== 'valor' ? ev?.indicador : ev?.base;
    if (x == null) return;
    const { min, max } = limitesDe(nombre, campos, i);
    const texto = `${nombreDato(nombre, campos, i)}: ${num(x, decRes(c, x))} ${unidadResultado(c)}`;
    if (min != null && x < min) out.push(`${texto}, bajo el límite de ${limite(min)}`);
    else if (max != null && x > max) out.push(`${texto}, sobre el límite de ${limite(max)}`);
  });

  // Termómetro de mínima y máxima: la mínima no puede ser mayor que la máxima.
  const iMin = campos.findIndex((c, i) => magnitud(campos, i) === 'temperatura' && /m[ií]n/i.test(c.etiqueta));
  const iMax = campos.findIndex((c, i) => magnitud(campos, i) === 'temperatura' && /m[aá]x/i.test(c.etiqueta));
  const tMin = r.valores[iMin];
  const tMax = r.valores[iMax];
  if (iMin >= 0 && iMax >= 0 && tMin != null && tMax != null && tMin > tMax) {
    out.push(`La mínima (${num(tMin, campos[iMin].decimales)} ${campos[iMin].unidad}) es mayor que la máxima (${num(tMax, campos[iMax].decimales)} ${campos[iMax].unidad})`);
  }

  campos.forEach((c, i) => {
    const m = magnitud(campos, i);
    if (m !== 'agua' && m !== 'alimento') return;
    const hoy = p.evs[i]?.base;
    // Cambio brusco respecto del registro anterior (hasta tres días atrás).
    const prev = p.indice.anterior(r.fecha, r.galpon_id, r.tarea_id ?? '');
    const antes = prev && diasEntre(prev.fecha, r.fecha) <= 3 ? baseDe(p.indice, prev, i) : null;
    if (logica.cambioPct != null && hoy != null && antes != null && antes > 0) {
      const cambio = ((hoy - antes) / antes) * 100;
      if (Math.abs(cambio) >= logica.cambioPct) {
        const u = c.acumulativo ? `${c.unidad} al día` : c.unidad;
        out.push(`${nombreDato(nombre, campos, i)}: ${cambio < 0 ? 'bajó' : 'subió'} ${num(Math.abs(cambio))} % respecto del registro anterior (de ${num(antes, c.decimales)} a ${num(hoy, c.decimales)} ${u})`);
      }
    }
  });

  // Relación entre el agua y el alimento del mismo día.
  if (campos.some((_, i) => ['agua', 'alimento'].includes(magnitud(campos, i) ?? ''))) {
    const aa = aguaYAlimento(p.indice, r.fecha, r.galpon_id, r);
    if (aa && ((logica.ratioMin != null && aa.relacion < logica.ratioMin) || (logica.ratioMax != null && aa.relacion > logica.ratioMax))) {
      out.push(`Relación agua/alimento: ${limite(aa.relacion)} L por kg, fuera de los límites (${logica.ratioMin != null ? limite(logica.ratioMin) : '0'} a ${logica.ratioMax != null ? limite(logica.ratioMax) : 'sin tope'})`);
    }
  }
  return out;
}

/** Cómo se llegó a cada número calculado de un registro, paso a paso, para que el supervisor lo pueda comprobar. */
export function comoSeCalculo(indice: Indice, r: Registro, galpon: Galpon | undefined): string[] {
  const campos = r.tarea?.campos ?? [];
  const out: string[] = [];
  if (!campos.length || r.omitida || r.anulado) return out;
  const aves = r.aves !== undefined ? r.aves : (galpon?.aves ?? null);
  let usaAves = false;
  campos.forEach((c, i) => {
    const v = r.valores[i];
    if (v == null || c.saldo) return;
    const etiqueta = campos.filter((x) => !x.saldo).length > 1 ? `${c.etiqueta}: ` : '';
    let base: number | null = v;
    if (c.acumulativo) {
      const prev = indice.anterior(r.fecha, r.galpon_id, r.tarea_id ?? '');
      const pv = prev?.valores[i];
      if (!prev || pv == null) {
        out.push(`${etiqueta}es la primera lectura: el consumo se calcula desde la siguiente.`);
        return;
      }
      if (v < pv) {
        out.push(`${etiqueta}no se calcula el consumo, porque la lectura (${num(v, c.decimales)}) es menor que la anterior (${num(pv, c.decimales)}, ${fechaRelativa(prev.fecha).toLowerCase()}).`);
        return;
      }
      const dias = Math.max(1, diasEntre(prev.fecha, r.fecha));
      base = (v - pv) / dias;
      out.push(
        `${etiqueta}consumo = ${num(v, c.decimales)} − ${num(pv, c.decimales)} (lectura del ${fechaCorta(prev.fecha)})` +
          (dias > 1 ? ` = ${num(v - pv, c.decimales)} ${c.unidad} ÷ ${dias} días` : '') +
          ` = ${num(base, c.decimales)} ${c.unidad} al día`,
      );
    }
    if (c.calculo === 'valor') return;
    usaAves = true;
    if (!aves) {
      out.push(`${etiqueta}no se calculó ${c.indicador}: falta el número de aves del galpón.`);
      return;
    }
    const x = c.calculo === 'por_ave' ? (base * 1000) / aves : (base * 100) / aves;
    const u = c.acumulativo ? `${c.unidad} al día` : c.unidad;
    out.push(
      c.calculo === 'por_ave'
        ? `${etiqueta}${num(x, decimalesIndicador(c, x))} ${c.indicador} = ${num(base, c.decimales)} ${u} × 1.000 ÷ ${num(aves)} aves`
        : `${etiqueta}${num(x, decimalesIndicador(c, x))} ${c.indicador} = ${num(base, c.decimales)} ${c.unidad} ÷ ${num(aves)} aves × 100`,
    );
  });
  if (usaAves && aves) {
    out.push(
      r.aves_origen === 'anotadas'
        ? `Aves usadas: ${num(aves)}, las aves vivas anotadas ${r.aves_fecha ? fechaRelativa(r.aves_fecha).toLowerCase() : ''}`.trim() + '.'
        : `Aves usadas: ${num(aves)}, de la ficha del galpón (aún no hay aves vivas anotadas).`,
    );
  }
  if (campos.some((_, i) => ['agua', 'alimento'].includes(magnitud(campos, i) ?? ''))) {
    const aa = aguaYAlimento(indice, r.fecha, r.galpon_id, r);
    if (aa) out.push(`Relación agua/alimento del día: ${limite(aa.relacion)} L por kg = ${num(aa.agua)} L ÷ ${num(aa.alimento)} kg`);
  }
  return out;
}

export const decimalesIndicador = (c: Campo, x: number) => (c.calculo === 'pct' ? (Math.abs(x) < 1 ? 2 : 1) : 0);

/** Resumen corto de lo registrado, para listas. */
export function resumen(r: Registro): string {
  if (r.anulado) return 'Anulado';
  if (r.omitida) return `No se hizo: ${r.motivo || 'sin motivo'}`;
  if (r.tipo === 'problema') return r.nota || 'Problema informado';
  const t = r.tarea;
  if (!t) return '';
  if (t.tipo === 'check') return r.ok ? 'Todo bien' : `Problema${r.nota ? `: ${r.nota}` : ''}`;
  if (t.tipo === 'fotos') return `${r.fotos.length} ${r.fotos.length === 1 ? 'foto' : 'fotos'}`;
  return t.campos
    .map((c, i) => {
      const v = r.valores[i];
      const base = `${t.campos.length > 1 ? `${c.etiqueta} ` : ''}${num(v, c.decimales)} ${c.unidad}`.trim();
      return base;
    })
    .join(' / ');
}

/** Indicadores calculados de un registro, como texto ("228 ml por ave"). */
export function indicadoresTexto(r: Registro): string {
  const t = r.tarea;
  if (!t) return '';
  return t.campos
    .map((c, i) => {
      const x = r.indicadores?.[i];
      if (c.calculo === 'valor' || x === null || x === undefined) return '';
      return `${num(x, decimalesIndicador(c, x))} ${c.indicador}`;
    })
    .filter(Boolean)
    .join(', ');
}

export const relojMalo = (r: Registro) => Math.abs(r.reloj_desfase_s ?? 0) > 300 || (r.reloj_atras_s ?? 0) > 120;

export function flagsDe(r: Registro): (Flag | 'reloj')[] {
  const f: (Flag | 'reloj')[] = [...r.flags];
  if (relojMalo(r)) f.push('reloj');
  return f;
}

export const esCritico = (r: Registro) => r.flags.some((f) => FLAGS_CRITICOS.includes(f));
export const esDudoso = (r: Registro) => relojMalo(r) || r.flags.some((f) => FLAGS_CONFIANZA.includes(f));

export interface Avance {
  tareas: Tarea[];
  total: number;
  hechas: number;
  pendientes: Tarea[];
  atrasadas: Tarea[];
  alertas: number;
  dudas: number;
  ultimo: RegistroLocal | null;
  estado: 'completo' | 'alerta' | 'atrasado' | 'en_curso' | 'sin_empezar' | 'sin_tareas';
}

export function avanceGalpon(
  config: Config,
  indice: Indice,
  revisadas: Set<string>,
  galponId: string,
  fecha: string,
  ahora: Date,
  hoy: string,
  /** En la pantalla del operario solo cuentan como alerta los problemas que él mismo informó: nada que dé pistas. */
  paraOperario = false,
): Avance {
  const tareas = tareasDe(config, galponId, fecha);
  const pendientes: Tarea[] = [];
  const atrasadas: Tarea[] = [];
  let hechas = 0;
  let alertas = 0;
  let dudas = 0;
  let ultimo: RegistroLocal | null = null;
  const contar = (r: RegistroLocal) => {
    if (!revisadas.has(r.id)) {
      if (paraOperario ? r.flags.includes('problema') : esCritico(r)) alertas++;
      else if (!paraOperario && esDudoso(r)) dudas++;
    }
    if (!ultimo || momento(r) > momento(ultimo)) ultimo = r;
  };
  for (const t of tareas) {
    const r = indice.vigente(fecha, galponId, t.id);
    if (r) {
      hechas++;
      contar(r);
    } else {
      pendientes.push(t);
      const vencida = fecha < hoy || (fecha === hoy && ahora.getHours() >= LIMITE_BLOQUE[t.bloque]);
      if (vencida) atrasadas.push(t);
    }
  }
  for (const p of indice.problemas) {
    if (p.fecha === fecha && p.galpon_id === galponId) contar(p);
  }
  let estado: Avance['estado'];
  if (alertas > 0) estado = 'alerta';
  else if (!tareas.length) estado = 'sin_tareas';
  else if (atrasadas.length) estado = 'atrasado';
  else if (hechas === tareas.length) estado = 'completo';
  else if (hechas > 0) estado = 'en_curso';
  else estado = 'sin_empezar';
  return { tareas, total: tareas.length, hechas, pendientes, atrasadas, alertas, dudas, ultimo, estado };
}

export const conjuntoRevisadas = (revisiones: Revision[]) => new Set(revisiones.map((v) => v.registro_id));

/** Minutos de registro y fotos que suma la rutina diaria (para que el supervisor no se exceda). */
export function cargaDiaria(tareas: Tarea[]): { fotos: number; minutos: number; diarias: number } {
  let seg = 0;
  let fotos = 0;
  let diarias = 0;
  for (const t of tareas) {
    if (!t.activo || t.dias.length < 7) continue;
    diarias++;
    const nFotos = t.tipo === 'fotos' ? t.fotoEtiquetas.length : t.foto === 'obligatoria' ? t.fotoEtiquetas.length : 0;
    fotos += nFotos;
    seg += nFotos * 15;
    seg += t.tipo === 'check' ? 6 : t.tipo === 'fotos' ? 5 : t.campos.length * 12;
  }
  return { fotos, minutos: Math.max(1, Math.round(seg / 60)), diarias };
}
