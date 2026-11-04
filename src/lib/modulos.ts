// Gestión: módulos que se prenden y apagan, catálogos con sus valores por defecto, unidades de huevo y edades de lote.
import type { Area, Catalogo, Config, Envases, Galpon, Lote, Modulos, Registro, TipoRegistro, Usuario } from './tipos';
import { diasEntre } from './util';

// ------------------------------------------------------------------ módulos
export const MODULOS_INFO: { id: keyof Modulos; nombre: string; detalle: string }[] = [
  { id: 'lotes', nombre: 'Lotes', detalle: 'Ficha de cada lote: edad, aves iniciales, mortalidad acumulada, postura y proyección al cierre' },
  { id: 'recria', nombre: 'Recría de pollitas', detalle: 'Galpones de recría con sus propias tareas y el traslado del lote a producción' },
  { id: 'sanidad', nombre: 'Sanidad', detalle: 'Plan de vacunas por edad, vacunaciones, tratamientos con resguardo y visitas veterinarias' },
  { id: 'insumos', nombre: 'Insumos', detalle: 'Alimento, vacunas, medicamentos y envases: recepciones, consumos, stock mínimo y vencimientos' },
  { id: 'proceso', nombre: 'Sala de proceso', detalle: 'Huevos recibidos, clasificación por calibre y merma' },
  { id: 'bodega', nombre: 'Bodega de huevos', detalle: 'Inventario por bodega y calibre, conteos físicos y traspasos' },
  { id: 'despachos', nombre: 'Despachos', detalle: 'Salidas a clientes con guía, calibres y origen' },
  { id: 'recuperacion', nombre: 'Sala de recuperación', detalle: 'Huevos de merma recuperados, enviados a industria o descartados' },
  { id: 'comercial', nombre: 'Clientes y proveedores', detalle: 'Fichas de contacto para despachos y recepciones' },
];

/** Combinaciones listas para empezar. El supervisor después prende o apaga lo que quiera. */
export const PERFILES: { id: string; nombre: string; detalle: string; modulos: Modulos }[] = [
  {
    id: 'postura',
    nombre: 'Postura comercial completa',
    detalle: 'Desde el galpón hasta el despacho al cliente',
    modulos: { lotes: true, recria: true, sanidad: true, insumos: true, proceso: true, bodega: true, despachos: true, recuperacion: true, comercial: true },
  },
  {
    id: 'reproductoras',
    nombre: 'Reproductoras',
    detalle: 'Galpones, lotes, sanidad e insumos; el huevo fértil sale a la incubadora',
    modulos: { lotes: true, recria: true, sanidad: true, insumos: true, proceso: false, bodega: false, despachos: true, recuperacion: false, comercial: false },
  },
  {
    id: 'basico',
    nombre: 'Solo galpones',
    detalle: 'El registro diario de los galpones, como al principio',
    modulos: { lotes: false, recria: false, sanidad: false, insumos: false, proceso: false, bodega: false, despachos: false, recuperacion: false, comercial: false },
  },
];

/** Un plantel que nunca eligió módulos queda con lotes y sanidad prendidos, y lo demás apagado: igual que antes. */
const MODULOS_DEFECTO: Modulos = { lotes: true, recria: false, sanidad: true, insumos: false, proceso: false, bodega: false, despachos: false, recuperacion: false, comercial: false };

export const modulosDe = (c: Config): Modulos => ({ ...MODULOS_DEFECTO, ...(c.modulos ?? {}) });

// ------------------------------------------------------------------ áreas de cada persona
export const AREAS_INFO: { id: Area; nombre: string; cargo: string; modulo: keyof Modulos | null }[] = [
  { id: 'galpones', nombre: 'Galpones', cargo: 'Galponero', modulo: null },
  { id: 'proceso', nombre: 'Sala de proceso', cargo: 'Encargado de sala', modulo: 'proceso' },
  { id: 'bodega', nombre: 'Bodega', cargo: 'Bodeguero', modulo: 'bodega' },
  { id: 'despachos', nombre: 'Despachos', cargo: 'Despachador', modulo: 'despachos' },
  { id: 'recuperacion', nombre: 'Recuperación', cargo: 'Recuperación', modulo: 'recuperacion' },
  { id: 'insumos', nombre: 'Insumos', cargo: 'Bodega de insumos', modulo: 'insumos' },
  { id: 'sanidad', nombre: 'Sanidad', cargo: 'Vacunador', modulo: 'sanidad' },
];

/** Áreas disponibles en el plantel según los módulos prendidos. */
export const areasDisponibles = (c: Config): Area[] => {
  const m = modulosDe(c);
  return AREAS_INFO.filter((a) => !a.modulo || m[a.modulo]).map((a) => a.id);
};

/** Áreas que registra una persona. El supervisor puede todas. */
export function areasDe(c: Config, u: Usuario): Area[] {
  const disp = areasDisponibles(c);
  if (u.rol === 'supervisor') return disp;
  return (u.areas?.length ? u.areas : (['galpones'] as Area[])).filter((a) => disp.includes(a));
}

/** Área a la que pertenece cada tipo de registro de gestión. */
export const AREA_DE_TIPO: Partial<Record<TipoRegistro, Area>> = {
  proceso: 'proceso',
  bodega: 'bodega',
  despacho: 'despachos',
  recuperacion: 'recuperacion',
  insumo: 'insumos',
  sanidad: 'sanidad',
};

// ------------------------------------------------------------------ catálogos
const cat = (nombres: string[]): Catalogo[] => nombres.map((n) => ({ id: n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-'), nombre: n, activo: true }));

export const CALIBRES_DEFECTO = cat(['Súper extra', 'Extra', 'Primera', 'Segunda', 'Tercera', 'Cuarta']);
export const MERMAS_DEFECTO = cat(['Rotos', 'Trizados', 'Sucios', 'Deformes', 'Otros']);
export const BODEGAS_DEFECTO: Catalogo[] = [{ id: 'principal', nombre: 'Bodega principal', activo: true }];
export const ENVASES_DEFECTO: Envases = { huevos_bandeja: 30, bandejas_caja: 12 };

export const calibresDe = (c: Config) => (c.calibres?.length ? c.calibres : CALIBRES_DEFECTO);
export const mermasDe = (c: Config) => (c.mermas?.length ? c.mermas : MERMAS_DEFECTO);
export const bodegasDe = (c: Config) => (c.bodegas?.length ? c.bodegas : BODEGAS_DEFECTO);
export const envasesDe = (c: Config): Envases => ({ ...ENVASES_DEFECTO, ...(c.envases ?? {}) });
export const activos = <T extends { activo: boolean }>(l: T[]) => l.filter((x) => x.activo);

/** Lugares especiales del inventario. */
export const POZO_MERMA = 'merma'; // huevos de merma que esperan pasar por la sala de recuperación
export const BODEGA_INSUMOS = 'insumos';
/** Clase de huevo para lo recuperado que va a industria o lo que no tiene calibre. */
export const SIN_CALIBRE = 'sin-calibre';

export function nombreCalibre(c: Config, k: string): string {
  if (k === SIN_CALIBRE) return 'Sin calibre';
  return calibresDe(c).find((x) => x.id === k)?.nombre ?? mermasDe(c).find((x) => x.id === k)?.nombre ?? k;
}
export const nombreBodega = (c: Config, b: string) =>
  b === POZO_MERMA ? 'Merma por recuperar' : b === BODEGA_INSUMOS ? 'Insumos' : (bodegasDe(c).find((x) => x.id === b)?.nombre ?? b);

// ------------------------------------------------------------------ unidades de huevo
export type UnidadHuevo = 'huevos' | 'bandejas' | 'cajas';
export const factor = (e: Envases, u: UnidadHuevo) => (u === 'huevos' ? 1 : u === 'bandejas' ? e.huevos_bandeja : e.huevos_bandeja * e.bandejas_caja);

/** "12 cajas, 3 bandejas y 4 huevos" a partir de un total de huevos. */
export function enEnvases(huevos: number, e: Envases): string {
  const signo = huevos < 0 ? '−' : '';
  let n = Math.abs(Math.round(huevos));
  const porCaja = e.huevos_bandeja * e.bandejas_caja;
  const cajas = Math.floor(n / porCaja);
  n -= cajas * porCaja;
  const bandejas = Math.floor(n / e.huevos_bandeja);
  n -= bandejas * e.huevos_bandeja;
  const partes = [cajas && `${cajas.toLocaleString('es-CL')} ${cajas === 1 ? 'caja' : 'cajas'}`, bandejas && `${bandejas} ${bandejas === 1 ? 'bandeja' : 'bandejas'}`, n && `${n} ${n === 1 ? 'huevo' : 'huevos'}`].filter(
    Boolean,
  ) as string[];
  if (!partes.length) return '0 huevos';
  return signo + (partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`);
}

// ------------------------------------------------------------------ lotes
export const lotesDe = (c: Config) => c.lotes ?? [];
export const loteDeGalpon = (c: Config, g: Galpon | undefined) => (g?.lote_id ? lotesDe(c).find((l) => l.id === g.lote_id) : undefined);

/** Semana de edad (la semana 1 son los días 0 a 6 de vida). */
export function semanaDeEdad(l: Pick<Lote, 'nacimiento'>, fecha: string): number | null {
  if (!l.nacimiento) return null;
  const d = diasEntre(l.nacimiento, fecha);
  return d < 0 ? null : Math.floor(d / 7) + 1;
}

export const tipoGalpon = (g: Galpon | undefined) => g?.tipo ?? 'produccion';

/** ¿Se pide esta tarea en ese galpón según su tipo? */
export const tareaParaGalpon = (etapa: 'produccion' | 'recria' | 'todas' | undefined, g: Galpon | undefined) => {
  const e = etapa ?? 'produccion';
  return e === 'todas' || e === tipoGalpon(g);
};

// ------------------------------------------------------------------ registros de gestión
export const ES_GESTION = (r: Registro) => r.tipo !== 'tarea' && r.tipo !== 'problema';

export const NOMBRE_TIPO: Record<string, string> = {
  proceso: 'Sala de proceso',
  bodega: 'Bodega',
  despacho: 'Despacho',
  recuperacion: 'Recuperación',
  insumo: 'Insumos',
  sanidad: 'Sanidad',
  lote: 'Lote',
};

export const NOMBRE_SUB: Record<string, string> = {
  conteo: 'Conteo físico',
  traspaso: 'Traspaso',
  ajuste: 'Ajuste',
  recepcion: 'Recepción',
  consumo: 'Consumo',
  vacuna: 'Vacunación',
  tratamiento: 'Tratamiento',
  visita: 'Visita veterinaria',
  traslado: 'Traslado de lote',
  cierre: 'Cierre de lote',
};

/** Título corto de un registro de gestión, para listas. */
export function tituloGestion(c: Config, r: Registro): string {
  const d = r.detalle ?? {};
  switch (r.tipo) {
    case 'proceso':
      return 'Clasificación en sala';
    case 'bodega':
      return NOMBRE_SUB[d.sub] ?? 'Bodega';
    case 'despacho':
      return `Despacho a ${d.cliente || 'cliente'}`;
    case 'recuperacion':
      return 'Recuperación de merma';
    case 'insumo':
      return `${NOMBRE_SUB[d.sub] ?? 'Insumo'}: ${d.nombre ?? ''}`.trim();
    case 'sanidad':
      return `${NOMBRE_SUB[d.sub] ?? 'Sanidad'}: ${d.producto || d.diagnostico || ''}`.replace(/: $/, '');
    case 'lote':
      return `${NOMBRE_SUB[d.sub] ?? 'Lote'}: ${lotesDe(c).find((l) => l.id === d.lote_id)?.nombre ?? d.lote ?? ''}`;
    default:
      return NOMBRE_TIPO[r.tipo] ?? r.tipo;
  }
}

const sumaHuevos = (items: { huevos: number }[] | undefined) => (items ?? []).reduce((s, x) => s + (Number(x.huevos) || 0), 0);
export { sumaHuevos };

/** Resumen de una línea de un registro de gestión. */
export function resumenGestion(c: Config, r: Registro): string {
  if (r.anulado) return 'Anulado';
  const d = r.detalle ?? {};
  const e = envasesDe(c);
  switch (r.tipo) {
    case 'proceso':
      return `${enEnvases(sumaHuevos(d.clasificados), e)} clasificados, ${sumaHuevos(d.merma).toLocaleString('es-CL')} de merma`;
    case 'bodega':
      if (d.sub === 'traspaso') return `${enEnvases(sumaHuevos(d.items), e)} a ${nombreBodega(c, d.destino)}`;
      return `${enEnvases(sumaHuevos(d.items), e)}${d.motivo ? `, ${d.motivo}` : ''}`;
    case 'despacho':
      return `${enEnvases(sumaHuevos(d.items), e)}${d.guia ? `, guía ${d.guia}` : ''}`;
    case 'recuperacion':
      return `${sumaHuevos(d.recuperados).toLocaleString('es-CL')} recuperados, ${(d.industria ?? 0).toLocaleString('es-CL')} a industria, ${(d.descarte ?? 0).toLocaleString('es-CL')} descartados`;
    case 'insumo':
      return `${Number(d.cantidad ?? 0).toLocaleString('es-CL')} ${d.unidad ?? ''}${d.proveedor ? `, ${d.proveedor}` : ''}${d.galpon_nombre ? `, ${d.galpon_nombre}` : ''}`.trim();
    case 'sanidad':
      return [d.galpones_nombres, d.via, d.dosis, d.hasta ? `hasta el ${d.hasta}` : ''].filter(Boolean).join(', ');
    case 'lote':
      return [d.de_nombre && `de ${d.de_nombre}`, d.a_nombre && `a ${d.a_nombre}`, d.aves != null && `${Number(d.aves).toLocaleString('es-CL')} aves`].filter(Boolean).join(' ');
    default:
      return '';
  }
}
