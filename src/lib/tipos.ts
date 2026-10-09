export type Rol = 'operario' | 'supervisor';

export interface Usuario {
  id: string;
  nombre: string;
  rol: Rol;
  /** Vacío = el operario todavía no crea su PIN (o el supervisor lo reinició). */
  pin_hash: string;
  activo: boolean;
  estado: 'activo' | 'licencia' | 'baja';
  /** Correo del supervisor, para recuperar su clave. Los teléfonos de operarios no lo reciben. */
  correo?: string;
  /** Clave temporal de supervisor: debe cambiarla al entrar. */
  temporal?: boolean;
}

export interface Galpon {
  id: string;
  nombre: string;
  aves: number | null;
  lote: string;
  lat: number | null;
  lng: number | null;
  activo: boolean;
  /** Operarios a cargo del galpón (ids). Vacío = cualquiera. Sirve para ver pendientes por persona y dirigir recordatorios. */
  encargados?: string[];
}

export type TipoTarea = 'check' | 'numero' | 'contador' | 'fotos';
export type ModoFoto = 'no' | 'opcional' | 'obligatoria';
export type Bloque = 'manana' | 'tarde';
/** Indicador que se calcula para el supervisor a partir del número anotado. */
export type Calculo = 'valor' | 'por_ave' | 'pct';

export interface Campo {
  etiqueta: string;
  unidad: string;
  decimales: number;
  /** Lectura de un medidor que solo sube: el consumo es la diferencia con la lectura anterior. */
  acumulativo: boolean;
  /** 'valor' = sin indicador; 'por_ave' = por ave x 1.000 (L a ml, kg a g); 'pct' = porcentaje sobre las aves. */
  calculo: Calculo;
  /** Nombre del indicador calculado (ml por ave, % de postura…). Solo lo ve el supervisor. */
  indicador: string;
}

export interface Tarea {
  id: string;
  nombre: string;
  icono: string;
  tipo: TipoTarea;
  ayuda: string;
  campos: Campo[];
  foto: ModoFoto;
  fotoEtiquetas: string[];
  bloque: Bloque;
  /** Días de la semana en que corresponde (0 = domingo). */
  dias: number[];
  /** null = todos los galpones. */
  galpones: string[] | null;
  activo: boolean;
}

export interface Granja {
  id: string;
  nombre: string;
  codigo: string;
}

export interface Config {
  granja: Granja;
  usuarios: Usuario[];
  galpones: Galpon[];
  tareas: Tarea[];
}

export interface FotoRef {
  id: string;
  etiqueta: string;
}

export type Flag =
  | 'problema' // el operario marcó o reportó un problema
  | 'retrocede' // medidor acumulativo con lectura menor que la anterior
  | 'lejos' // GPS lejos del galpón
  | 'sin_foto' // la tarea pedía foto y no se pudo tomar
  | 'omitida' // el operario indicó que hoy no se pudo hacer
  | 'temprano'; // tarea de la tarde registrada en la mañana

export interface Registro {
  id: string;
  tipo: 'tarea' | 'problema';
  fecha: string; // día operativo, AAAA-MM-DD
  galpon_id: string;
  tarea_id: string | null;
  usuario_id: string;
  /** Nombres al momento de registrar: el historial se entiende aunque después se borre el galpón o la persona. */
  usuario_nombre: string;
  galpon_nombre: string;
  /** Copia de la tarea al momento de registrar, para que el historial no cambie si se edita. */
  tarea: Pick<Tarea, 'nombre' | 'icono' | 'tipo' | 'campos' | 'bloque'> | null;
  valores: (number | null)[];
  /** Indicador calculado por campo (ml/ave, % postura…), si aplica. */
  indicadores: (number | null)[];
  ok: boolean | null;
  categoria: string | null;
  nota: string;
  fotos: FotoRef[];
  flags: Flag[];
  lat: number | null;
  lng: number | null;
  precision: number | null;
  capturado_dispositivo: string;
  /** El operario indicó que la tarea no se pudo hacer hoy (el motivo va en 'motivo'). */
  omitida: boolean;
  /** Registro que deja sin efecto al que corrige: la tarea vuelve a quedar pendiente. */
  anulado: boolean;
  corrige: string | null;
  motivo: string;
  // Lo siguiente lo pone el servidor al recibir.
  capturado?: string;
  recibido?: string;
  reloj_desfase_s?: number;
  demora_s?: number;
}

export interface Revision {
  id: string;
  registro_id: string;
  usuario_id: string;
  nota: string;
  creado: string;
}

export interface DispositivoInfo {
  id: string;
  nombre: string;
  visto: string | null;
  pendientes: number;
  usuario_id: string | null;
  creado?: string;
  /** Falso mientras ningún supervisor haya dicho que conoce este equipo. */
  reconocido?: boolean;
}

export interface ItemCola {
  id: string;
  tipo: 'registro' | 'foto' | 'revision' | 'pin';
  ref: string;
  /** No reintentar antes de este momento (ms). */
  proximo?: number;
  creado: number;
  intentos: number;
  error?: string;
}

export interface FotoLocal {
  id: string;
  blob: Blob;
  creado: number;
  subida: boolean;
}

/** Registro tal como vive en el teléfono: con marcas locales que no viajan al servidor. */
export type RegistroLocal = Registro & {
  /** Aún no confirmado por el servidor. */
  _pend?: boolean;
  /** Reloj del teléfono (ms) al momento de capturar, para medir cuánto esperó. */
  _ms?: number;
};
