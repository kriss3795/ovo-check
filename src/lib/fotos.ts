// Descarga de fotos al teléfono o computador. En la nube las fotos se guardan un plazo limitado.
import * as idb from './idb';
import { momento } from './logica';
import { urlFoto } from './nube';
import type { Config, FotoLocal, RegistroLocal } from './tipos';
import { Zip } from './zip';

const limpio = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'sin-nombre';

const p2 = (n: number) => String(n).padStart(2, '0');

/** Nombre de archivo que se entiende solo: fecha, hora, galpón, tarea, quién y código del registro. */
export function nombreFoto(r: RegistroLocal, etiqueta: string, n = 0): string {
  const d = new Date(momento(r));
  const tarea = r.tipo === 'problema' ? 'Problema' : (r.tarea?.nombre ?? 'Tarea');
  return `${r.fecha}_${p2(d.getHours())}${p2(d.getMinutes())}_${limpio(r.galpon_nombre || 'Galpon')}_${limpio(tarea)}_${limpio(etiqueta)}_${limpio(r.usuario_nombre || '')}_${r.id.slice(0, 8).toUpperCase()}${n ? `-${n + 1}` : ''}.jpg`;
}

/** Busca la foto en este equipo y, si no está, en la nube. null = ya no existe o aún no llega. */
export async function obtenerFoto(granjaId: string, fotoId: string): Promise<Blob | null> {
  try {
    const local = await idb.leer<FotoLocal>('fotos', fotoId);
    if (local?.blob) return local.blob;
  } catch {
    /* se intenta en la nube */
  }
  try {
    const r = await fetch(urlFoto(granjaId, fotoId));
    if (!r.ok) return null;
    const b = await r.blob();
    return b.size > 0 ? b : null;
  } catch {
    return null;
  }
}

export function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export interface FotoDeRegistro {
  registro: RegistroLocal;
  id: string;
  etiqueta: string;
  n: number;
}

/** Todas las fotos de los registros de un período (incluye versiones corregidas: también son respaldo). */
export function fotosDe(registros: RegistroLocal[], desde: string, hasta: string): FotoDeRegistro[] {
  const out: FotoDeRegistro[] = [];
  for (const r of registros) {
    if (r.fecha < desde || r.fecha > hasta) continue;
    r.fotos.forEach((f, n) => out.push({ registro: r, id: f.id, etiqueta: f.etiqueta, n }));
  }
  return out;
}

const FOTOS_POR_ARCHIVO = 500;

/** Descarga las fotos en uno o más archivos .zip, ordenadas en carpetas por día y galpón. */
export async function descargarFotos(
  config: Config,
  fotos: FotoDeRegistro[],
  nombreBase: string,
  avance: (hechas: number, total: number) => void,
): Promise<{ guardadas: number; faltantes: number; archivos: number }> {
  let guardadas = 0;
  let faltantes = 0;
  let archivos = 0;
  const partes = Math.max(1, Math.ceil(fotos.length / FOTOS_POR_ARCHIVO));
  for (let p = 0; p < partes; p++) {
    const zip = new Zip();
    const lote = fotos.slice(p * FOTOS_POR_ARCHIVO, (p + 1) * FOTOS_POR_ARCHIVO);
    // De a cuatro a la vez: rápido sin saturar una conexión de campo.
    for (let i = 0; i < lote.length; i += 4) {
      const grupo = lote.slice(i, i + 4);
      const blobs = await Promise.all(grupo.map((f) => obtenerFoto(config.granja.id, f.id)));
      for (let k = 0; k < grupo.length; k++) {
        const f = grupo[k];
        const b = blobs[k];
        if (!b) {
          faltantes++;
          continue;
        }
        await zip.agregar(`${f.registro.fecha}/${limpio(f.registro.galpon_nombre || 'Galpon')}/${nombreFoto(f.registro, f.etiqueta, f.n)}`, b, new Date(momento(f.registro)));
        guardadas++;
      }
      avance(p * FOTOS_POR_ARCHIVO + Math.min(i + 4, lote.length), fotos.length);
    }
    if (zip.cantidad > 0) {
      descargarBlob(zip.cerrar(), `${nombreBase}${partes > 1 ? `-parte-${p + 1}` : ''}.zip`);
      archivos++;
      if (partes > 1) await new Promise((r) => setTimeout(r, 800));
    }
  }
  return { guardadas, faltantes, archivos };
}

// ------------------------------------------------------------------ qué falta por descargar
interface Bajadas {
  desde: string;
  hasta: string;
}

function leerBajadas(granjaId: string): Bajadas | null {
  try {
    return JSON.parse(localStorage.getItem(`oc_fotos_bajadas_${granjaId}`) ?? 'null');
  } catch {
    return null;
  }
}

/** Anota que en este equipo ya se descargaron las fotos de un período. */
export function anotarBajada(granjaId: string, desde: string, hasta: string) {
  const previo = leerBajadas(granjaId);
  let nuevo: Bajadas = { desde, hasta };
  // Si el período nuevo empalma con el anterior, se unen (descargas semanales seguidas).
  if (previo && desde <= previo.hasta && hasta >= previo.desde) nuevo = { desde: desde < previo.desde ? desde : previo.desde, hasta: hasta > previo.hasta ? hasta : previo.hasta };
  try {
    localStorage.setItem(`oc_fotos_bajadas_${granjaId}`, JSON.stringify(nuevo));
  } catch {
    /* sin almacenamiento */
  }
}

/** Fotos que la nube borrará dentro de una semana y que aún no se descargan en este equipo. */
export function fotosPorVencer(granjaId: string, registros: RegistroLocal[], limite: string, piso: string): { cantidad: number; hasta: string } {
  const b = leerBajadas(granjaId);
  let cantidad = 0;
  let hasta = '';
  for (const r of registros) {
    if (!r.fotos.length || r.fecha > limite || r.fecha < piso) continue;
    if (b && r.fecha >= b.desde && r.fecha <= b.hasta) continue;
    cantidad += r.fotos.length;
    if (r.fecha > hasta) hasta = r.fecha;
  }
  return { cantidad, hasta };
}
