// Conexión con la base de datos (PostgreSQL en Neon, creada desde Vercel > Storage).
// Toda la lógica vive en funciones de la base (db/esquema.sql); aquí solo se las llama.
// (El guion bajo evita que Vercel publique este archivo como dirección.)
import pg from 'pg';

const limpio = (v) => String(v ?? '').trim();
/** La integración de Vercel crea DATABASE_URL (o POSTGRES_URL / STORAGE_URL según el prefijo elegido). */
export const URL_DB = limpio(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.STORAGE_URL);
export const dbLista = Boolean(URL_DB);

let pool = null;
function conexion() {
  if (!pool) {
    const local = /@(localhost|127\.0\.0\.1)[:/]|host=\/|^postgres(ql)?:\/\/[^@]*@\/|\?host=/.test(URL_DB);
    pool = new pg.Pool({
      connectionString: URL_DB,
      ssl: local ? false : { rejectUnauthorized: true },
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 15000,
    });
    pool.on('error', () => {});
  }
  return pool;
}

export class ErrorDb extends Error {
  constructor(codigo, mensaje) {
    super(mensaje ?? codigo);
    this.codigo = codigo;
  }
}

const NOMBRE = /^oc_[a-z_]{2,60}$/;

/**
 * Llama a una función de la base: select oc_x(p::jsonb). `cabeceras` llega a la función como request.headers
 * (de ahí sale la IP de quien pide, para frenar a quien prueba claves). Los errores "OC_..." vuelven como ErrorDb.
 */
export async function llamar(funcion, p = {}, cabeceras = {}, extra) {
  if (!dbLista) throw new ErrorDb('SIN_DB', 'Falta conectar la base de datos en Vercel > Storage');
  if (!NOMBRE.test(funcion)) throw new ErrorDb('OC_DATOS');
  const cliente = await conexion().connect();
  try {
    await cliente.query('begin');
    await cliente.query("select set_config('request.headers', $1, true)", [JSON.stringify(cabeceras)]);
    const args = extra === undefined ? [JSON.stringify(p ?? {})] : [JSON.stringify(p ?? {}), extra];
    const r = await cliente.query(`select ${funcion}(${args.map((_, i) => `$${i + 1}${i === 0 ? '::jsonb' : ''}`).join(', ')}) as r`, args);
    await cliente.query('commit');
    return r.rows[0]?.r ?? null;
  } catch (e) {
    await cliente.query('rollback').catch(() => {});
    const msg = String(e?.message ?? '');
    if (msg.startsWith('OC_')) throw new ErrorDb(msg);
    throw new ErrorDb('SERVIDOR', msg);
  } finally {
    cliente.release();
  }
}

/** Consulta directa (solo para el servidor de la app: fotos y tareas programadas). */
export async function consultar(sql, valores = []) {
  if (!dbLista) throw new ErrorDb('SIN_DB');
  return conexion().query(sql, valores);
}

/** Lee el cuerpo crudo de una petición (para las fotos). */
export async function cuerpoCrudo(req, limite = 300000) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const partes = [];
  let total = 0;
  for await (const trozo of req) {
    total += trozo.length;
    if (total > limite) throw new ErrorDb('OC_DATOS', 'Archivo demasiado grande');
    partes.push(trozo);
  }
  return Buffer.concat(partes);
}

/** Cuerpo JSON de una petición, venga ya leído o no. */
export async function cuerpoJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let t = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : (await cuerpoCrudo(req, 2_000_000)).toString('utf8');
  try {
    return JSON.parse(t || '{}');
  } catch {
    return {};
  }
}

/** Cabeceras que la base usa para frenar abusos (la IP real de quien pide). */
export const cabecerasDe = (req) => ({ 'x-forwarded-for': String(req.headers?.['x-forwarded-for'] ?? req.headers?.['x-real-ip'] ?? '') });
