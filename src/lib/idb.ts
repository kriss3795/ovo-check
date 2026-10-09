// Almacenamiento local del teléfono (IndexedDB). Todo se guarda aquí primero.
const NOMBRE = 'ovocheck';
const ALMACENES = ['kv', 'registros', 'fotos', 'cola', 'revisiones'] as const;
export type Almacen = (typeof ALMACENES)[number];

let abierta: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (!abierta) {
    abierta = new Promise((ok, mal) => {
      const req = indexedDB.open(NOMBRE, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        for (const a of ALMACENES) {
          if (a !== 'kv' && !db.objectStoreNames.contains(a)) db.createObjectStore(a, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => mal(req.error);
      req.onblocked = () => mal(new Error('Base de datos bloqueada'));
    });
  }
  return abierta;
}

function tx<T>(almacen: Almacen, modo: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((ok, mal) => {
        const t = db.transaction(almacen, modo);
        const r = f(t.objectStore(almacen));
        t.oncomplete = () => ok(r ? r.result : (undefined as T));
        t.onerror = () => mal(t.error);
        t.onabort = () => mal(t.error ?? new Error('Transacción cancelada'));
      }),
  );
}

export const leer = <T>(almacen: Almacen, clave: string) =>
  tx<T | undefined>(almacen, 'readonly', (s) => s.get(clave) as IDBRequest<T | undefined>);

export const todos = <T>(almacen: Almacen) => tx<T[]>(almacen, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);

export const guardar = (almacen: Almacen, valor: unknown, clave?: string) =>
  tx<IDBValidKey>(almacen, 'readwrite', (s) => (almacen === 'kv' ? s.put(valor, clave) : s.put(valor)));

export function guardarVarios(almacen: Almacen, valores: unknown[]): Promise<void> {
  if (!valores.length) return Promise.resolve();
  return tx<void>(almacen, 'readwrite', (s) => {
    for (const v of valores) s.put(v);
  });
}

export const borrar = (almacen: Almacen, clave: string) => tx<undefined>(almacen, 'readwrite', (s) => s.delete(clave));

export function borrarVarios(almacen: Almacen, claves: string[]): Promise<void> {
  if (!claves.length) return Promise.resolve();
  return tx<void>(almacen, 'readwrite', (s) => {
    for (const c of claves) s.delete(c);
  });
}

export const vaciar = (almacen: Almacen) => tx<undefined>(almacen, 'readwrite', (s) => s.clear());

export async function vaciarTodo() {
  for (const a of ALMACENES) await vaciar(a);
}

/** Pide al sistema que no borre los datos de la app si el teléfono se queda sin espacio. */
export function pedirPersistencia() {
  try {
    navigator.storage?.persist?.();
  } catch {
    /* no disponible */
  }
}
