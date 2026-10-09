// Reglas del día a día: qué tareas tocan, qué está hecho y qué se marca para el supervisor.
import type { Campo, Config, Flag, Galpon, Pausa, Registro, RegistroLocal, Revision, Tarea } from './tipos';
import { diaSemana, diasEntre, fechaLocal, num } from './util';

/** Hora límite de cada bloque: pasada esa hora, lo pendiente se muestra como atrasado. */
export const LIMITE_BLOQUE = { manana: 13, tarde: 20 } as const;
export const NOMBRE_BLOQUE = { manana: 'Mañana', tarde: 'Tarde' } as const;

export const FLAGS_CRITICOS: Flag[] = ['problema', 'retrocede'];
export const FLAGS_CONFIANZA: Flag[] = ['lejos', 'sin_foto', 'omitida', 'temprano'];
/** Antes de esta hora, una tarea de la tarde se considera registrada antes de tiempo. */
export const HORA_INICIO_TARDE = 12;

export const NOMBRE_FLAG: Record<Flag | 'reloj', string> = {
  problema: 'Problema informado',
  retrocede: 'Lectura menor que la anterior',
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

/** Índice de los registros vigentes: el último de cada tarea que no fue reemplazado por una corrección. */
export class Indice {
  private reemplazados = new Set<string>();
  private porClave = new Map<string, RegistroLocal>();
  porId = new Map<string, RegistroLocal>();
  private reemplazo = new Map<string, RegistroLocal>();
  private anulaciones = new Map<string, RegistroLocal>();
  problemas: RegistroLocal[] = [];

  constructor(registros: RegistroLocal[]) {
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

  /** Lectura anterior de una tarea (para medidores acumulativos). */
  anterior(fecha: string, galponId: string, tareaId: string): RegistroLocal | null {
    let mejor: RegistroLocal | null = null;
    for (const r of this.porClave.values()) {
      if (r.omitida || r.galpon_id !== galponId || r.tarea_id !== tareaId) continue;
      if (r.fecha >= fecha) continue;
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
      if (esCritico(r)) alertas++;
      else if (esDudoso(r)) dudas++;
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
