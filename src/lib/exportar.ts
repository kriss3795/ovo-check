// Exporta los registros a un archivo que abre en Excel (CSV con punto y coma).
import { Indice, NOMBRE_BLOQUE, NOMBRE_FLAG, decimalesIndicador, flagsDe } from './logica';
import { urlFoto } from './nube';
import type { Config, RegistroLocal, Revision } from './tipos';
import { fechaHora } from './util';

const celda = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const decimal = (v: number | null | undefined, d: number) =>
  v === null || v === undefined ? '' : v.toFixed(d).replace('.', ',');

export function armarCsv(config: Config, registros: RegistroLocal[], revisiones: Revision[]): string {
  const galpon = new Map(config.galpones.map((g) => [g.id, g]));
  const persona = new Map(config.usuarios.map((u) => [u.id, u.nombre]));
  const rev = new Map(revisiones.map((v) => [v.registro_id, v]));
  const indice = new Indice(registros);
  const filas: unknown[][] = [
    [
      'Fecha', 'Hora (servidor)', 'Galpón', 'Lote', 'Aves', 'Bloque', 'Tarea', 'Dato', 'Valor', 'Unidad',
      'Indicador', 'Valor indicador', 'Resultado', 'Nota', 'Registró', 'Vigente', 'Corrige a', 'Motivo',
      'Latitud', 'Longitud', 'Demora en llegar (s)', 'Observaciones', 'Revisado por', 'Nota de revisión',
      'Fotos', 'Código de registro',
    ],
  ];
  for (const r of registros) {
    const g = galpon.get(r.galpon_id);
    const v = rev.get(r.id);
    const comunes = (dato: string, valor: string, unidad: string, ind: string, vind: string) => [
      r.fecha,
      fechaHora(r.capturado ?? r.capturado_dispositivo).slice(11),
      g?.nombre ?? r.galpon_nombre ?? '',
      g?.lote ?? '',
      g?.aves ?? '',
      r.tarea ? NOMBRE_BLOQUE[r.tarea.bloque] : '',
      r.tipo === 'problema' ? 'Problema informado' : (r.tarea?.nombre ?? ''),
      dato,
      valor,
      unidad,
      ind,
      vind,
      r.anulado ? 'Anulado' : r.omitida ? 'No se hizo' : r.tipo === 'problema' ? 'Problema' : r.ok === false ? 'Problema' : r.ok === true ? 'Todo bien' : 'Registrado',
      r.nota,
      persona.get(r.usuario_id) ?? r.usuario_nombre ?? '',
      indice.esVigente(r) ? 'Sí' : 'No',
      r.corrige ? r.corrige.slice(0, 8).toUpperCase() : '',
      r.motivo,
      decimal(r.lat, 5),
      decimal(r.lng, 5),
      r.demora_s ?? '',
      flagsDe(r).map((f) => NOMBRE_FLAG[f]).join(', '),
      v ? (persona.get(v.usuario_id) ?? '') : '',
      v?.nota ?? '',
      r.fotos.map((f) => urlFoto(config.granja.id, f.id)).join(' '),
      r.id.slice(0, 8).toUpperCase(),
    ];
    const campos = r.tarea?.campos ?? [];
    if (campos.length && !r.omitida && !r.anulado) {
      campos.forEach((c, i) => {
        filas.push(
          comunes(
            c.etiqueta,
            decimal(r.valores[i], c.decimales),
            c.unidad,
            c.calculo === 'valor' ? '' : c.indicador,
            c.calculo === 'valor' || r.indicadores?.[i] == null ? '' : decimal(r.indicadores[i], decimalesIndicador(c, r.indicadores[i]!)),
          ),
        );
      });
    } else {
      filas.push(comunes(r.categoria ?? '', '', '', '', ''));
    }
  }
  return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
}

/** Entrega el archivo: en el computador se descarga; en el teléfono se abre el menú para guardarlo o enviarlo. */
export async function entregarArchivo(nombre: string, contenido: string): Promise<'descargado' | 'compartido'> {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' });
  const archivo = new File([blob], nombre, { type: 'text/csv' });
  const esMovil = matchMedia('(pointer: coarse)').matches;
  if (esMovil && navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
      return 'compartido';
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'compartido';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'descargado';
}
