// Plantel de demostración: seis semanas de datos inventados pero realistas, para conocer la app (y mostrarla)
// sin tener operarios. Se arma con las mismas tareas, cálculos y alertas que un plantel de verdad.
import { estandarDe } from './estandar';
import { Indice, avisosLogicos, evaluarCampo, magnitud, reiniciosDe, valorPar } from './logica';
import { RUTINA_CLASICA, tareaDesde } from './plantillas';
import type { Config, Flag, Galpon, Registro, RegistroLocal, Tarea, Usuario } from './tipos';
import { fechaLocal, hashPin, sumarDias, uid } from './util';

export const PIN_DEMO = '1234';
const DIAS = 42;

/** Número al azar con semilla fija: la demostración sale igual cada vez (y se puede explicar). */
function azar(semilla: number) {
  let s = semilla;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export async function armarDemo(ahora: Date): Promise<{ config: Config; registros: Registro[] }> {
  const hoy = fechaLocal(ahora);
  const inicio = sumarDias(hoy, -DIAS - 3);
  const sup: Usuario = { id: uid(), nombre: 'Supervisión de muestra', rol: 'supervisor', pin_hash: '', activo: true, estado: 'activo' };
  const juan: Usuario = { id: uid(), nombre: 'Juan Pérez', rol: 'operario', pin_hash: '', activo: true, estado: 'activo' };
  const maria: Usuario = { id: uid(), nombre: 'María Soto', rol: 'operario', pin_hash: '', activo: true, estado: 'activo' };
  sup.pin_hash = await hashPin(sup.id, 'demostracion');
  juan.pin_hash = await hashPin(juan.id, PIN_DEMO);
  maria.pin_hash = await hashPin(maria.id, PIN_DEMO);
  const galpon = (nombre: string, aves: number, linea: string, semanas: number, lote: string, encargado: string): Galpon => ({
    id: uid(),
    nombre,
    aves,
    lote,
    linea,
    nacimiento: sumarDias(hoy, -semanas * 7 - 3),
    lat: null,
    lng: null,
    activo: true,
    desde: inicio,
    encargados: [encargado],
  });
  const galpones = [
    galpon('Galpón 1', 12000, 'hyline_brown', 34, '24-A Hy-Line Brown', juan.id),
    galpon('Galpón 2', 10500, 'lohmann_brown', 62, '23-C Lohmann Brown', juan.id),
    galpon('Galpón 3', 14000, 'lohmann_lsl', 26, '25-B Lohmann LSL', maria.id),
  ];
  const tareas: Tarea[] = RUTINA_CLASICA.map((b) => tareaDesde(b, inicio));
  const config: Config = { granja: { id: '', nombre: 'Demostración', codigo: '' }, usuarios: [sup, juan, maria], galpones, tareas };

  const registros: RegistroLocal[] = [];
  const r = azar(20261104);
  const ruido = (x: number) => (r() - 0.5) * 2 * x;
  const vivas = new Map(galpones.map((g) => [g.id, g.aves!]));
  const medidor = new Map(galpones.map((g, i) => [g.id, 180000 + i * 70000]));
  const ultimosDias = 7;

  for (let k = DIAS; k >= 0; k--) {
    const fecha = sumarDias(hoy, -k);
    const esHoy = k === 0;
    galpones.forEach((g, gi) => {
      const semana = (k === 0 ? 0 : 0) + (new Date(`${fecha}T12:00:00`).getTime() - new Date(`${g.nacimiento}T12:00:00`).getTime()) / (7 * 86400000);
      const std = estandarDe(g.linea, semana);
      const aves = vivas.get(g.id)!;
      const quien = g.encargados![0] === juan.id ? juan : maria;
      // Episodios para que la demostración muestre alertas reales: un golpe de calor en el Galpón 2 y una caída
      // de agua (niples tapados) que se adelanta a una baja de postura en el Galpón 1.
      const calor = gi === 1 && (k === 9 || k === 8);
      const niples = gi === 0 && (k === 13 || k === 12);
      const caida = gi === 0 && k >= 10 && k <= 12 ? 4.5 : 0;
      const tmin = 11 + ruido(2.5) + (calor ? 6 : 0);
      const tmax = 25 + ruido(3) + (calor ? 9 : 0);
      const muertas = Math.max(0, Math.round(aves * 0.00012 + ruido(1.6) + (calor ? 6 : 0)));
      const vivasHoy = aves - muertas;
      const hd = Math.min(97, Math.max(0, (std?.postura ?? 90) - 1.2 + ruido(1.3) - caida - (calor ? 3 : 0)));
      const gAve = (std?.alimento ?? 112) + ruido(3.5) - (calor ? 9 : 0);
      const rel = (calor ? 2.6 : 1.85) + ruido(0.12);
      const aguaL = ((gAve * rel) / 1000) * aves * (niples ? 0.78 : 1);
      const lectura = Math.round(medidor.get(g.id)! + aguaL);
      const momento = (h: number, m: number) => {
        const d = new Date(`${fecha}T00:00:00`);
        d.setHours(h, m + Math.round(r() * 20), Math.round(r() * 59));
        return d.toISOString();
      };
      const hora = new Date(ahora).getHours();
      const valores: Record<string, (number | null)[]> = {
        'Temperatura mínima y máxima': [Math.round(tmin * 10) / 10, Math.round(tmax * 10) / 10],
        'Lectura del medidor de agua': [lectura],
        Mortalidad: [muertas, vivasHoy],
        'Huevos recolectados': [Math.round((aves * hd) / 100)],
        'Alimento consumido': [Math.round((gAve * aves) / 1000)],
      };
      for (const t of tareas) {
        if (!t.activo) continue;
        if (esHoy && (t.bloque === 'tarde' || hora < 9)) continue;
        // Hoy, el Galpón 3 todavía no termina la mañana: así se ve una tarea pendiente.
        if (esHoy && gi === 2 && t.tipo === 'check') continue;
        const capturado = momento(t.bloque === 'manana' ? 8 : 16, gi * 25);
        const base: Registro = {
          id: uid(),
          tipo: 'tarea',
          fecha,
          galpon_id: g.id,
          tarea_id: t.id,
          usuario_id: quien.id,
          usuario_nombre: quien.nombre,
          galpon_nombre: g.nombre,
          tarea: { nombre: t.nombre, icono: t.icono, tipo: t.tipo, campos: t.campos, bloque: t.bloque },
          valores: [],
          indicadores: [],
          ok: null,
          categoria: null,
          nota: '',
          fotos: [],
          flags: [],
          lote: g.lote,
          aves,
          aves_origen: 'anotadas',
          lat: -33.84 + gi * 0.0004,
          lng: -70.91,
          precision: 12,
          capturado_dispositivo: capturado,
          omitida: false,
          anulado: false,
          corrige: null,
          motivo: '',
        } as Registro;
        if (t.tipo === 'check') {
          if (k > ultimosDias) continue;
          base.ok = !(niples && /Bebederos/.test(t.nombre));
          if (!base.ok) {
            base.nota = 'Niples tapados en la línea 3, se limpiaron';
            base.flags = ['problema'];
          }
          registros.push(base as RegistroLocal);
          continue;
        }
        const v = valores[t.nombre];
        if (!v || t.tipo === 'fotos') continue;
        base.valores = v.slice(0, t.campos.length);
        const indice = new Indice(registros, reiniciosDe(galpones));
        const previo = indice.anterior(fecha, g.id, t.id);
        const evs = t.campos.map((c, i) =>
          evaluarCampo(c, base.valores[i] ?? null, { ...g, aves }, previo && valorPar(previo, c, i) != null ? { valor: valorPar(previo, c, i)!, fecha: previo.fecha } : null, fecha),
        );
        base.indicadores = evs.map((e) => (e.indicador != null ? Math.round(e.indicador * 100) / 100 : null));
        const flags: Flag[] = [];
        if (evs.some((e) => e.retrocede)) flags.push('retrocede');
        const avisos = avisosLogicos({ config, indice, registro: base, evs });
        if (avisos.length) {
          flags.push('ilogico');
          base.avisos = avisos;
        }
        base.flags = flags;
        registros.push(base as RegistroLocal);
      }
      if (!esHoy) {
        vivas.set(g.id, vivasHoy);
        medidor.set(g.id, lectura);
      }
    });
    // Un problema informado por un operario, con su descripción.
    if (k === 3) {
      const g = galpones[1];
      registros.push({
        id: uid(), tipo: 'problema', fecha, galpon_id: g.id, tarea_id: null, usuario_id: juan.id, usuario_nombre: juan.nombre, galpon_nombre: g.nombre,
        tarea: null, valores: [], indicadores: [], ok: null, categoria: 'agua', nota: 'Fuga en la línea de niples del fondo, se cerró la llave', fotos: [],
        flags: ['problema'], lote: g.lote, aves: vivas.get(g.id)!, lat: -33.8396, lng: -70.91, precision: 10,
        capturado_dispositivo: new Date(`${fecha}T10:42:00`).toISOString(), omitida: false, anulado: false, corrige: null, motivo: '',
      } as unknown as RegistroLocal);
    }
  }
  // Aves de la ficha: las de hoy.
  galpones.forEach((g) => (g.aves = vivas.get(g.id)!));
  return { config, registros };
}

/** ¿Es un plantel de demostración? */
export const esDemo = (c: Config | null | undefined) => Boolean((c as any)?.demo);
export const magnitudDe = magnitud;
