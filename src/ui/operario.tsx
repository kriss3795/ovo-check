import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera, Check, ChevronRight, CircleCheck, Clock, LogOut, Minus, Plus, TriangleAlert, Ban, Keyboard,
} from 'lucide-react';
import { abrirVisita, ahora, guardarRegistro, salir, visitaVigente, type FotoNueva } from '../lib/app';
import { avisar, cerrarPantalla, ir, leerEstado, useEstado, volver } from '../lib/estado';
import {
  HORA_INICIO_TARDE, Indice, LIMITE_BLOQUE, NOMBRE_BLOQUE, avanceGalpon, conjuntoRevisadas, evaluarCampo, resumen, tareasDe,
} from '../lib/logica';
import { CATEGORIAS_PROBLEMA, MOTIVOS_CORREGIR, MOTIVOS_OMITIR } from '../lib/plantillas';
import type { Flag, Galpon, Registro, Tarea } from '../lib/tipos';
import { distancia, fechaHora, fechaLarga, fechaLocal, hora, mayuscula, num, uid } from '../lib/util';
import { AvisoServidor, Barra, Confirmado, Envio, FotoBlob, Hoja, Huevo, IconoTarea, Teclado, aNumero, conMiles, useAtras } from './base';
import { Camara } from './captura';
import { TarjetaAvisos } from './avisos';
import { activarAvisos, desactivarAvisos } from '../lib/avisos';

export function useIndice() {
  const registros = useEstado((e) => e.registros);
  return useMemo(() => new Indice(registros), [registros]);
}

const TEXTO_ESTADO: Record<string, { texto: string; clase: string }> = {
  completo: { texto: 'Completo', clase: 'ok' },
  alerta: { texto: 'Con alerta', clase: 'mal' },
  atrasado: { texto: 'Atrasado', clase: 'atencion' },
  en_curso: { texto: 'En curso', clase: '' },
  sin_empezar: { texto: 'Sin empezar', clase: '' },
  sin_tareas: { texto: 'Sin tareas hoy', clase: '' },
  // Días anteriores
  incompleto: { texto: 'Incompleto', clase: 'atencion' },
  sin_registros: { texto: 'Sin registros', clase: 'atencion' },
  sin_tareas_dia: { texto: 'Sin tareas', clase: '' },
};

export function EtiquetaEstado({ estado }: { estado: string }) {
  const t = TEXTO_ESTADO[estado] ?? TEXTO_ESTADO.sin_empezar;
  return <span className={`etiqueta ${t.clase}`}>{t.texto}</span>;
}

/** Qué pasa con lo recién guardado: sale ahora, espera señal o espera espacio en el servidor. */
function detalleEnvio(): string {
  const { sync, servidorLleno } = leerEstado();
  if (!sync.enLinea) return 'Se enviará cuando haya señal';
  if (sync.freno || servidorLleno) return 'Guardado en este teléfono. Se enviará solo.';
  return 'Enviando al supervisor';
}

// ------------------------------------------------------------------ inicio del operario
export function OpInicio({ embebido }: { embebido?: boolean }) {
  const config = useEstado((e) => e.config)!;
  const usuario = useEstado((e) => e.usuario)!;
  const hoy = useEstado((e) => e.hoy);
  const revisiones = useEstado((e) => e.revisiones);
  useEstado((e) => e.tic);
  const indice = useIndice();
  const [menu, setMenu] = useState(false);
  const avisos = useEstado((e) => e.avisos);
  const revisadas = useMemo(() => conjuntoRevisadas(revisiones), [revisiones]);
  const activos = config.galpones.filter((g) => g.activo);
  // Los galpones a su cargo van primero; los demás quedan a mano por si cubre a un compañero.
  const mios = activos.filter((g) => (g.encargados ?? []).includes(usuario.id));
  const galpones = [...mios, ...activos.filter((g) => !mios.includes(g))];

  const abrir = (g: Galpon) => {
    abrirVisita(g.id);
    ir({ p: 'galpon', id: g.id });
  };

  return (
    <div className="pantalla">
      {embebido ? (
        <Barra titulo="Hacer una ronda" sub={fechaLarga(hoy)} />
      ) : (
        <header className="barra sin-atras">
          <div className="marca-linea crece">
            <img src="/marca.webp" alt="" />
            <div className="barra-titulo">
              <h1>{usuario.nombre}</h1>
              <p>{config.granja.nombre}</p>
            </div>
          </div>
          <Envio />
          <button className="icono-boton" onClick={() => setMenu(true)} aria-label="Cambiar de persona">
            <LogOut size={24} />
          </button>
        </header>
      )}
      <div className="contenido">
        {!embebido && <h2 className="titulo">{mayuscula(fechaLarga(hoy))}</h2>}
        {!embebido && <AvisoServidor />}
        {!embebido && <TarjetaAvisos />}
        {!embebido && galpones.length > 1 && <p className="suave">Toca el galpón donde estás. Puedes cambiar de galpón cuando quieras.</p>}
        {galpones.length === 0 && <div className="tarjeta suave">No hay galpones en producción. El supervisor los activa en Ajustes.</div>}
        <div className="pila">
          {galpones.map((g, k) => {
            const a = avanceGalpon(config, indice, revisadas, g.id, hoy, ahora(), hoy);
            return (
              <Fragment key={g.id}>
              {mios.length > 0 && mios.length < galpones.length && (k === 0 || k === mios.length) && (
                <p className="seccion" style={{ margin: k === 0 ? '0 2px' : '8px 2px 0' }}>
                  {k === 0 ? 'Tus galpones' : 'Otros galpones'}
                </p>
              )}
              <button className={`galpon-tarjeta ${a.estado}`} onClick={() => abrir(g)}>
                <Huevo fraccion={a.total ? a.hechas / a.total : 0} estado={a.estado} size={58} />
                <span className="crece">
                  <span className="fila-titulo" style={{ fontSize: 21, display: 'block' }}>
                    {g.nombre}
                  </span>
                  <span className="fila-detalle" style={{ display: 'block' }}>
                    {a.total ? `${a.hechas} de ${a.total} tareas` : 'Sin tareas hoy'}
                    {a.atrasadas.length > 0 && `, ${a.atrasadas.length} atrasada${a.atrasadas.length > 1 ? 's' : ''}`}
                  </span>
                </span>
                {a.estado === 'completo' ? <EtiquetaEstado estado="completo" /> : <ChevronRight className="flecha" aria-hidden />}
              </button>
              </Fragment>
            );
          })}
        </div>
      </div>
      <div className="pie">
        <button className="boton-problema" onClick={() => ir({ p: 'problema' })}>
          <TriangleAlert size={24} aria-hidden /> Informar un problema
        </button>
      </div>
      {menu && (
        <Hoja titulo={usuario.nombre} cerrar={() => setMenu(false)}>
          <p className="suave">Si otra persona va a usar este teléfono, sal para que entre con su propio PIN.</p>
          <button className="boton primario" onClick={() => salir()}>
            <LogOut size={22} aria-hidden /> Salir
          </button>
          <button className="boton" onClick={() => setMenu(false)}>
            Seguir como {usuario.nombre.split(' ')[0]}
          </button>
          {avisos === 'activo' && (
            <button className="enlace gris" style={{ alignSelf: 'center' }} onClick={() => desactivarAvisos().then(() => avisar('Recordatorios desactivados en este teléfono', 'info'))}>
              Desactivar los recordatorios en este teléfono
            </button>
          )}
          {avisos === 'apagado' && (
            <button className="enlace" style={{ alignSelf: 'center' }} onClick={() => activarAvisos().then((ok) => ok && avisar('Recordatorios activados', 'ok')).catch(() => avisar('No se pudieron activar', 'mal'))}>
              Activar los recordatorios en este teléfono
            </button>
          )}
        </Hoja>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ lista de tareas de un galpón
export function OpGalpon({ id }: { id: string }) {
  const config = useEstado((e) => e.config)!;
  const hoy = useEstado((e) => e.hoy);
  const visitas = useEstado((e) => e.visitas);
  useEstado((e) => e.tic);
  const indice = useIndice();
  const [temprana, setTemprana] = useState<Tarea | null>(null);
  const galpon = config.galpones.find((g) => g.id === id);
  if (!galpon) return <Falta />;
  const tareas = tareasDe(config, id, hoy);
  const h = ahora().getHours();
  const hechas = tareas.filter((t) => indice.vigente(hoy, id, t.id)).length;
  const problemas = indice.problemas.filter((p) => p.fecha === hoy && p.galpon_id === id);

  const fila = (t: Tarea) => {
    const r = indice.vigente(hoy, id, t.id);
    const atrasada = !r && h >= LIMITE_BLOQUE[t.bloque];
    const mal = r && r.flags.includes('problema');
    return (
      <button
        key={t.id}
        className={`fila tarea${r ? ' hecha' : ''}`}
        onClick={() => {
          if (r) return ir({ p: 'registro', id: r.id });
          if (t.bloque === 'tarde' && h < HORA_INICIO_TARDE) return setTemprana(t);
          ir({ p: 'tarea', galpon: id, tarea: t.id });
        }}
      >
        <span className={`medallon ${r ? (mal ? 'mal' : r.omitida ? 'atencion' : 'hecho') : ''}`}>
          {r ? (mal ? <TriangleAlert size={26} /> : r.omitida ? <Ban size={26} /> : <Check size={28} strokeWidth={3} />) : <IconoTarea nombre={t.icono} />}
        </span>
        <span className="fila-cuerpo">
          <span className="fila-titulo" style={{ display: 'block' }}>
            {t.nombre}
          </span>
          {r ? (
            <span className="fila-detalle valor" style={{ display: 'block' }}>
              {resumen(r)}
              <span className="suave"> a las {hora(r.capturado ?? r.capturado_dispositivo)}</span>
            </span>
          ) : (
            <span className="fila-detalle" style={{ display: 'block' }}>
              {descripcionTarea(t)}
            </span>
          )}
        </span>
        {atrasada ? <span className="etiqueta atencion">Atrasada</span> : <ChevronRight className="flecha" aria-hidden />}
      </button>
    );
  };

  return (
    <div className="pantalla">
      <Barra
        titulo={galpon.nombre}
        sub={[galpon.lote && `Lote ${galpon.lote}`, galpon.aves && `${num(galpon.aves)} aves`].filter(Boolean).join(', ') || undefined}
        derecha={<Envio />}
      />
      <div className="contenido">
        <div className="linea-h">
          <Huevo fraccion={tareas.length ? hechas / tareas.length : 0} size={46} />
          <div>
            <p className="subtitulo">
              {tareas.length === 0 ? 'Sin tareas para hoy' : hechas === tareas.length ? 'Todo listo por hoy' : `${hechas} de ${tareas.length} tareas hechas`}
            </p>
            {hechas < tareas.length && <p className="chico suave">Toca una tarea para registrarla.</p>}
          </div>
        </div>
        {(['manana', 'tarde'] as const).map((b) => {
          const del = tareas.filter((t) => t.bloque === b);
          if (!del.length) return null;
          return (
            <div key={b} className="pila">
              <p className="seccion" style={{ marginBottom: 0 }}>
                {NOMBRE_BLOQUE[b]}
              </p>
              <div className="lista">{del.map(fila)}</div>
            </div>
          );
        })}
        {problemas.length > 0 && (
          <div className="pila">
            <p className="seccion" style={{ marginBottom: 0 }}>
              Problemas informados hoy
            </p>
            <div className="lista">
              {problemas.map((p) => (
                <button key={p.id} className="fila" onClick={() => ir({ p: 'registro', id: p.id })}>
                  <span className="medallon mal">
                    <TriangleAlert size={24} />
                  </span>
                  <span className="fila-cuerpo">
                    <span className="fila-titulo" style={{ display: 'block' }}>
                      {CATEGORIAS_PROBLEMA.find((c) => c.id === p.categoria)?.nombre ?? 'Problema'}
                    </span>
                    <span className="fila-detalle" style={{ display: 'block' }}>
                      {p.nota || 'Sin descripción'}, a las {hora(p.capturado ?? p.capturado_dispositivo)}
                    </span>
                  </span>
                  <ChevronRight className="flecha" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="pie">
        <button className="boton-problema" onClick={() => ir({ p: 'problema', galpon: id })}>
          <TriangleAlert size={24} aria-hidden /> Informar un problema
        </button>
      </div>
      {temprana && (
        <Hoja titulo="Esta tarea es de la tarde" cerrar={() => setTemprana(null)}>
          <p className="suave">
            Lo normal es registrar "{temprana.nombre}" después del mediodía. Si la registras ahora, el supervisor verá que se hizo antes de hora.
          </p>
          <button className="boton primario" onClick={() => setTemprana(null)}>
            Dejarla para la tarde
          </button>
          <button
            className="boton"
            onClick={() => {
              const t = temprana;
              setTemprana(null);
              ir({ p: 'tarea', galpon: id, tarea: t.id });
            }}
          >
            Registrarla ahora
          </button>
        </Hoja>
      )}
    </div>
  );
}

function descripcionTarea(t: Tarea): string {
  const fotos = t.tipo === 'fotos' || t.foto === 'obligatoria' ? t.fotoEtiquetas.length : 0;
  const conFoto = fotos === 1 ? ' y una foto' : fotos > 1 ? ` y ${fotos} fotos` : '';
  if (t.tipo === 'check') return `Revisar${conFoto}`;
  if (t.tipo === 'fotos') return fotos === 1 ? 'Una foto' : `${fotos} fotos`;
  if (t.tipo === 'contador') return t.foto === 'no' ? 'Contar' : 'Contar, y una foto si hay';
  return `Anotar ${t.campos.length > 1 ? `${t.campos.length} números` : 'el número'}${conFoto}`;
}

export function Falta() {
  return (
    <div className="pantalla">
      <Barra titulo="No disponible" />
      <div className="contenido">
        <div className="tarjeta suave">Esto ya no existe. Puede que el supervisor lo haya cambiado.</div>
        <button className="boton" onClick={volver}>
          Volver
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ registrar una tarea
type Paso =
  | { t: 'intro' }
  | { t: 'motivo' }
  | { t: 'check' }
  | { t: 'foto'; i: number }
  | { t: 'numero'; i: number }
  | { t: 'contador' }
  | { t: 'nota' }
  | { t: 'omitir' }
  | { t: 'anular' };

function lineasMarca(galpon: string, tarea: string, etiqueta: string, persona: string, id: string, galponId: string): string[] {
  const v = visitaVigente(galponId);
  const gps = v?.lat != null ? `GPS ${v.lat.toFixed(5)}, ${v.lng!.toFixed(5)} (±${v.precision} m)` : 'Sin GPS';
  return [`${galpon} | ${tarea}`, `${fechaHora(ahora())} | ${persona}`, `${etiqueta} | ${gps} | Reg. ${id.slice(0, 8).toUpperCase()}`];
}

function banderasPresencia(galpon: Galpon | undefined, galponId: string): { flags: Flag[]; lat: number | null; lng: number | null; precision: number | null } {
  const v = visitaVigente(galponId);
  const flags: Flag[] = [];
  if (galpon?.lat != null && galpon.lng != null && v?.lat != null && v.lng != null) {
    if (distancia(galpon.lat, galpon.lng, v.lat, v.lng) > 300 + (v.precision ?? 0)) flags.push('lejos');
  }
  return { flags, lat: v?.lat ?? null, lng: v?.lng ?? null, precision: v?.precision ?? null };
}

export function FlujoTarea(p: { galpon: string; tarea?: string; corrige?: string; anular?: boolean }) {
  const config = useEstado((e) => e.config)!;
  const usuario = useEstado((e) => e.usuario)!;
  const indice = useIndice();
  const original = p.corrige ? indice.porId.get(p.corrige) : undefined;
  const galpon = config.galpones.find((g) => g.id === p.galpon);
  // Al corregir se usa la tarea tal como estaba cuando se registró.
  const tarea: Tarea | undefined = useMemo(() => {
    const actual = config.tareas.find((t) => t.id === (p.tarea ?? original?.tarea_id));
    if (original?.tarea) return { ...(actual ?? ({} as Tarea)), ...original.tarea, id: original.tarea_id!, foto: actual?.foto ?? 'opcional', fotoEtiquetas: actual?.fotoEtiquetas ?? ['Foto'], ayuda: actual?.ayuda ?? '' } as Tarea;
    return actual;
  }, [config, p.tarea, original]);
  // El supervisor corrige un dato mirando el respaldo que ya existe: no se le piden fotos nuevas y el registro
  // corregido conserva las fotos del original. (Una tarea que es solo de fotos sí se vuelve a fotografiar.)
  const sinFotosNuevas = Boolean(original) && !p.anular && usuario.rol === 'supervisor' && original?.tarea?.tipo !== 'fotos';
  // Al empezar se toma la ubicación de este momento (no la de cuando se abrió el galpón).
  useEffect(() => {
    if (!(original && usuario.rol === 'supervisor')) abrirVisita(p.galpon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fecha = original?.fecha ?? fechaLocal(ahora());
  const regId = useRef(uid()).current;

  const inicial = (): Paso => {
    if (p.anular) return { t: 'anular' };
    if (original) return { t: 'motivo' };
    return primerPaso();
  };
  const primerPaso = (): Paso => {
    if (!tarea) return { t: 'check' };
    if (tarea.tipo === 'check') return { t: 'check' };
    if (tarea.tipo === 'contador') return { t: 'contador' };
    if (tarea.tipo === 'fotos') return { t: 'intro' };
    return tarea.foto !== 'no' && !sinFotosNuevas ? { t: 'foto', i: 0 } : { t: 'numero', i: 0 };
  };

  const [paso, setPaso] = useState<Paso>(inicial);
  const [historial, setHistorial] = useState<Paso[]>([]);
  const [fotos, setFotos] = useState<(FotoNueva | null)[]>([]);
  const [textos, setTextos] = useState<string[]>(() => (original && !p.anular ? original.valores.map((v, i) => (v === null ? '' : String(v).replace('.', ','))) : []));
  const [ok, setOk] = useState<boolean | null>(null);
  const [nota, setNota] = useState('');
  const [motivo, setMotivo] = useState('');
  const [sinFoto, setSinFoto] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [ver, setVer] = useState<Blob | null>(null);
  const [teclear, setTeclear] = useState(false);
  const guardando = useRef(false);

  const avanzar = (sig: Paso) => {
    setHistorial((h) => [...h, paso]);
    setPaso(sig);
  };
  const retroceder = () => {
    if (ver) return setVer(null);
    if (!historial.length) return cerrarPantalla();
    setPaso(historial[historial.length - 1]);
    setHistorial((h) => h.slice(0, -1));
  };
  useAtras(retroceder, !guardado);

  if (!galpon || !tarea) return <Falta />;

  const valores = tarea.campos.map((_, i) => aNumero(textos[i] ?? ''));
  const previo = indice.anterior(fecha, galpon.id, tarea.id);
  // El cálculo se guarda para el supervisor; al operario no se le muestra ningún valor de referencia.
  const evaluar = (i: number) =>
    evaluarCampo(tarea.campos[i], valores[i], galpon, previo && previo.valores[i] != null ? { valor: previo.valores[i]!, fecha: previo.fecha } : null, fecha);
  const fotosTomadas = fotos.filter((f): f is FotoNueva => Boolean(f));
  const marca = (i: number) => () => lineasMarca(galpon.nombre, tarea.nombre, tarea.fotoEtiquetas[i] ?? 'Foto', usuario.nombre, regId, galpon.id);

  const guardar = async (extra: Partial<Registro> = {}, fotosFinales: FotoNueva[] = fotosTomadas, faltoFoto = sinFoto) => {
    if (guardando.current) return;
    guardando.current = true;
    const pres = banderasPresencia(galpon, galpon.id);
    const omitida = Boolean(extra.omitida);
    const anulado = Boolean(extra.anulado);
    // Una anulación, o una corrección hecha por el supervisor desde su escritorio, no exige estar en el galpón.
    const sinPresencia = anulado || (Boolean(original) && usuario.rol === 'supervisor');
    const flags: Flag[] = sinPresencia ? [] : [...pres.flags];
    const evs = tarea.campos.map((_, i) => evaluar(i));
    const conValores = !omitida && !anulado && (tarea.tipo === 'numero' || tarea.tipo === 'contador');
    if (conValores && evs.some((e) => e.retrocede)) flags.push('retrocede');
    const estaOk = extra.ok !== undefined ? extra.ok : ok;
    if (estaOk === false) flags.push('problema');
    if (omitida) flags.push('omitida');
    if (faltoFoto && !omitida && !anulado && !sinFotosNuevas) flags.push('sin_foto');
    if (!original && !omitida && tarea.bloque === 'tarde' && ahora().getHours() < HORA_INICIO_TARDE) flags.push('temprano');
    const reg: Registro = {
      id: regId,
      tipo: 'tarea',
      fecha,
      galpon_id: galpon.id,
      tarea_id: tarea.id,
      usuario_id: usuario.id,
      usuario_nombre: usuario.nombre,
      galpon_nombre: galpon.nombre,
      tarea: { nombre: tarea.nombre, icono: tarea.icono, tipo: tarea.tipo, campos: tarea.campos, bloque: tarea.bloque },
      valores: conValores ? valores : [],
      indicadores: conValores ? evs.map((e) => e.indicador) : [],
      ok: tarea.tipo === 'check' && !omitida && !anulado ? estaOk : null,
      categoria: null,
      nota: nota.trim(),
      fotos: omitida || anulado ? [] : sinFotosNuevas ? (original?.fotos ?? []) : fotosFinales.map((f) => ({ id: f.id, etiqueta: f.etiqueta })),
      aves: galpon.aves ?? null,
      lote: galpon.lote ?? '',
      ...pres,
      flags,
      capturado_dispositivo: ahora().toISOString(),
      omitida,
      anulado,
      corrige: original?.id ?? null,
      motivo,
      ...extra,
    };
    try {
      await guardarRegistro(reg, omitida || anulado || sinFotosNuevas ? [] : fotosFinales);
    } catch (e) {
      console.error(e);
      guardando.current = false;
      avisar('No se pudo guardar en el teléfono. Revisa que tenga espacio libre e inténtalo de nuevo.', 'mal');
      return;
    }
    setGuardado(true);
    setTimeout(cerrarPantalla, 950);
  };

  // Después de las fotos: a dónde se sigue según el tipo de tarea.
  const fotoLista = (i: number, blob: Blob | null, eraObligatoria: boolean) => {
    const copia = [...fotos];
    copia[i] = blob ? { id: uid(), etiqueta: tarea.fotoEtiquetas[i] ?? 'Foto', blob } : null;
    const falto = sinFoto || (!blob && eraObligatoria);
    setFotos(copia);
    setSinFoto(falto);
    if (i + 1 < tarea.fotoEtiquetas.length) return avanzar({ t: 'foto', i: i + 1 });
    if (tarea.tipo === 'numero' && !historial.some((x) => x.t === 'numero')) return avanzar({ t: 'numero', i: 0 });
    if (tarea.tipo === 'check' && ok === false) return avanzar({ t: 'nota' });
    guardar({}, copia.filter((f): f is FotoNueva => Boolean(f)), falto);
  };

  const seguirTrasNumeros = () => {
    // Contador: la foto se pide solo si hay algo que mostrar (más de cero).
    if (tarea.tipo === 'contador' && !fotosTomadas.length && tarea.foto !== 'no' && !sinFotosNuevas && (valores[0] ?? 0) > 0) return avanzar({ t: 'foto', i: 0 });
    guardar();
  };

  if (guardado) {
    return <Confirmado texto={p.anular ? 'Registro anulado' : 'Guardado'} detalle={detalleEnvio()} />;
  }

  // ---- pasos
  if (paso.t === 'foto') {
    const obligatoria = tarea.tipo === 'fotos' || tarea.foto === 'obligatoria' || ok === false;
    const etiqueta = tarea.fotoEtiquetas[paso.i] ?? 'Foto';
    const tituloFoto = etiqueta !== 'Foto' ? `Foto: ${etiqueta}` : ok === false ? 'Foto del problema' : 'Toma una foto';
    return (
      <Camara
        key={paso.i}
        titulo={tituloFoto}
        sub={tarea.fotoEtiquetas.length > 1 ? `Foto ${paso.i + 1} de ${tarea.fotoEtiquetas.length}, ${tarea.nombre}` : tarea.nombre}
        marca={marca(paso.i)}
        alCapturar={(b) => fotoLista(paso.i, b, obligatoria)}
        alCancelar={retroceder}
        sinFoto={() => fotoLista(paso.i, null, obligatoria)}
        opcional={!obligatoria}
        textoSinFoto={obligatoria ? 'Seguir sin foto' : 'Sin foto'}
      />
    );
  }

  const cabecera = <Barra titulo={tarea.nombre} sub={`${galpon.nombre}${original ? ', corrección' : ''}`} atras={retroceder} />;
  const tira = fotosTomadas.length > 0 && (
    <div className="miniaturas">
      {fotosTomadas.map((f) => (
        <FotoBlob key={f.id} blob={f.blob} etiqueta={f.etiqueta} alTocar={() => setVer(f.blob)} />
      ))}
    </div>
  );
  const visor = ver && <VisorBlob blob={ver} cerrar={() => setVer(null)} />;

  if (paso.t === 'motivo' || paso.t === 'anular') {
    const anular = paso.t === 'anular';
    const opciones = anular ? ['Se registró en el galpón equivocado', 'Registro duplicado', 'Dato sin respaldo'] : MOTIVOS_CORREGIR;
    return (
      <div className="pantalla">
        {cabecera}
        <div className="contenido">
          <h2 className="titulo">{anular ? '¿Por qué se anula?' : '¿Por qué lo corriges?'}</h2>
          <p className="suave">
            {anular
              ? 'El registro original se conserva en el historial, marcado como anulado, y la tarea vuelve a quedar pendiente.'
              : 'El registro anterior se conserva en el historial junto al nuevo.'}
          </p>
          {original && (
            <div className="tarjeta">
              <p className="chico suave">Registro actual</p>
              <p className="fuerte">{resumen(original)}</p>
            </div>
          )}
          <div className="pila">
            {opciones.map((m) => (
              <button key={m} className="boton" aria-pressed={motivo === m} style={motivo === m ? { borderColor: 'var(--verde)', background: 'var(--verde-suave)' } : undefined} onClick={() => setMotivo(m)}>
                {m}
              </button>
            ))}
            <input className="entrada" placeholder="Otro motivo" value={opciones.includes(motivo) ? '' : motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={120} />
          </div>
        </div>
        <div className="pie">
          {anular ? (
            <button className="boton peligro grande" disabled={motivo.trim().length < 3} onClick={() => guardar({ anulado: true })}>
              Anular registro
            </button>
          ) : (
            <button className="boton primario grande" disabled={motivo.trim().length < 3} onClick={() => avanzar(primerPaso())}>
              Continuar
            </button>
          )}
        </div>
      </div>
    );
  }

  if (paso.t === 'omitir') {
    return (
      <div className="pantalla">
        {cabecera}
        <div className="contenido">
          <h2 className="titulo">¿Por qué no se puede hacer hoy?</h2>
          <p className="suave">La tarea queda cerrada por hoy y el supervisor verá el motivo.</p>
          <div className="pila">
            {MOTIVOS_OMITIR.map((m) => (
              <button key={m} className="boton grande" onClick={() => guardar({ omitida: true, motivo: original ? `${motivo} (${m})` : m })}>
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const enlaceOmitir = (
    <button className="enlace gris" style={{ alignSelf: 'center' }} onClick={() => avanzar({ t: 'omitir' })}>
      Hoy no se puede hacer
    </button>
  );

  if (paso.t === 'intro') {
    return (
      <div className="pantalla">
        {cabecera}
        <div className="contenido">
          <div className="linea-h" style={{ alignItems: 'flex-start' }}>
            <span className="medallon claro">
              <IconoTarea nombre={tarea.icono} />
            </span>
            <p className="crece" style={{ fontSize: 20, lineHeight: 1.3 }}>
              {tarea.ayuda || tarea.nombre}
            </p>
          </div>
          <div className="lista">
            {tarea.fotoEtiquetas.map((f, k) => (
              <div key={k} className="fila compacta">
                <span className="medallon">
                  <Camera size={22} aria-hidden />
                </span>
                <span className="fila-titulo">
                  Foto {k + 1}: {f}
                </span>
              </div>
            ))}
          </div>
          <span style={{ marginTop: 'auto' }} />
          {enlaceOmitir}
        </div>
        <div className="pie">
          <button className="boton primario grande" onClick={() => avanzar({ t: 'foto', i: 0 })}>
            <Camera size={24} aria-hidden /> {tarea.fotoEtiquetas.length > 1 ? 'Tomar las fotos' : 'Tomar la foto'}
          </button>
        </div>
      </div>
    );
  }

  if (paso.t === 'check') {
    const seguir = (valor: boolean) => {
      setOk(valor);
      if (valor) {
        if (tarea.foto === 'obligatoria' && !sinFotosNuevas) return avanzar({ t: 'foto', i: 0 });
        return guardar({ ok: true });
      }
      avanzar(sinFotosNuevas ? { t: 'nota' } : { t: 'foto', i: 0 });
    };
    return (
      <div className="pantalla">
        {cabecera}
        <div className="contenido">
          <div className="linea-h" style={{ alignItems: 'flex-start' }}>
            <span className="medallon claro">
              <IconoTarea nombre={tarea.icono} />
            </span>
            <p className="crece" style={{ fontSize: 20, lineHeight: 1.3 }}>
              {tarea.ayuda || tarea.nombre}
            </p>
          </div>
          <div className="dos-botones" style={{ marginTop: 'auto' }}>
            <button className="boton-gigante" onClick={() => seguir(true)}>
              <CircleCheck size={44} aria-hidden /> Todo bien
            </button>
            <button className="boton-gigante problema" onClick={() => seguir(false)}>
              <TriangleAlert size={44} aria-hidden /> Hay un problema
            </button>
          </div>
          {enlaceOmitir}
        </div>
      </div>
    );
  }

  if (paso.t === 'nota') {
    return (
      <div className="pantalla">
        {cabecera}
        <div className="contenido">
          <h2 className="titulo">¿Qué problema hay?</h2>
          {tira}
          <label className="campo">
            <span>Descríbelo en pocas palabras</span>
            <textarea className="entrada" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Por ejemplo: fuga en la línea 2" />
            <small>Puedes usar el micrófono del teclado para dictar.</small>
          </label>
        </div>
        <div className="pie">
          <button className="boton primario grande" disabled={fotosTomadas.length === 0 && nota.trim().length < 3} onClick={() => guardar()}>
            {usuario.rol === 'supervisor' ? 'Guardar' : 'Guardar y avisar al supervisor'}
          </button>
        </div>
        {visor}
      </div>
    );
  }

  if (paso.t === 'contador') {
    const c = tarea.campos[0];
    const n = valores[0] ?? 0;
    const cambiar = (d: number) => {
      const copia = [...textos];
      copia[0] = String(Math.max(0, n + d));
      setTextos(copia);
      try {
        navigator.vibrate?.(10);
      } catch {
        /* sin vibración */
      }
    };
    return (
      <div className="pantalla">
        {cabecera}
        <div className="contenido">
          {tarea.ayuda && <p style={{ fontSize: 19 }}>{tarea.ayuda}</p>}
          {tira}
          <div style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p className="centro fuerte suave">{c.etiqueta}</p>
            {teclear ? (
              <>
                <div className="lectura">
                  <span className={`numero${textos[0] ? '' : ' vacio'}`}>{conMiles(textos[0] || '0')}</span>
                  <span className="unidad">{c.unidad}</span>
                </div>
                <Teclado valor={textos[0] ?? ''} largo={6} alCambiar={(v) => setTextos([v])} />
              </>
            ) : (
              <>
                <div className="contador">
                  <button onClick={() => cambiar(-1)} disabled={n <= 0} aria-label="Uno menos">
                    <Minus size={40} />
                  </button>
                  <span className="numero" aria-live="polite">
                    {n}
                  </span>
                  <button className="mas" onClick={() => cambiar(1)} aria-label="Uno más">
                    <Plus size={40} />
                  </button>
                </div>
                <button className="enlace gris" style={{ alignSelf: 'center' }} onClick={() => setTeclear(true)}>
                  <Keyboard size={20} aria-hidden /> Escribir el número
                </button>
              </>
            )}
          </div>
          {enlaceOmitir}
        </div>
        <div className="pie">
          <button className="boton primario grande" onClick={seguirTrasNumeros}>
            {n > 0 && tarea.foto !== 'no' && !sinFotosNuevas && !fotosTomadas.length ? 'Seguir a la foto' : `Guardar ${n} ${c.unidad}`}
          </button>
        </div>
        {visor}
      </div>
    );
  }

  // paso numero
  const i = paso.i;
  const c = tarea.campos[i];
  const ultimo = i === tarea.campos.length - 1;
  const hayValor = valores[i] !== null;
  return (
    <div className="pantalla">
      {cabecera}
      <div className="contenido" style={{ gap: 12 }}>
        {tira || (tarea.ayuda && <p className="suave">{tarea.ayuda}</p>)}
        {tarea.campos.length > 1 && (
          <div className="segmentos" role="tablist">
            {tarea.campos.map((x, k) => (
              <button key={k} aria-pressed={k === i} onClick={() => k !== i && (k < i || valores[i] !== null) && setPaso({ t: 'numero', i: k })}>
                {x.etiqueta}
                {valores[k] !== null && k !== i ? `: ${num(valores[k], x.decimales)}` : ''}
              </button>
            ))}
          </div>
        )}
        <p className="fuerte" style={{ marginTop: 'auto' }}>
          {c.etiqueta}
        </p>
        <div className="lectura">
          <span className={`numero${textos[i] ? '' : ' vacio'}`}>{textos[i] ? conMiles(textos[i]) : '0'}</span>
          <span className="unidad">{c.unidad}</span>
        </div>
        {/°/.test(c.unidad) && (
          <button
            type="button"
            className="enlace gris"
            style={{ alignSelf: 'center' }}
            aria-pressed={(textos[i] ?? '').startsWith('-')}
            onClick={() => {
              const copia = [...textos];
              const t = copia[i] ?? '';
              copia[i] = t.startsWith('-') ? t.slice(1) : `-${t}`;
              setTextos(copia);
            }}
          >
            {(textos[i] ?? '').startsWith('-') ? 'Quitar el signo menos' : 'Es bajo cero: poner signo menos'}
          </button>
        )}
        <Teclado
          valor={textos[i] ?? ''}
          decimales={c.decimales}
          alCambiar={(v) => {
            const copia = [...textos];
            copia[i] = v;
            setTextos(copia);
          }}
        />
        {i === 0 && enlaceOmitir}
      </div>
      <div className="pie">
        <button className="boton primario grande" disabled={!hayValor} onClick={() => (ultimo ? seguirTrasNumeros() : avanzar({ t: 'numero', i: i + 1 }))}>
          {ultimo ? 'Guardar' : `Seguir con ${tarea.campos[i + 1].etiqueta.toLowerCase()}`}
        </button>
      </div>
      {visor}
    </div>
  );
}

function VisorBlob({ blob, cerrar }: { blob: Blob; cerrar: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return (
    <div className="visor-foto" onClick={cerrar} role="dialog" aria-label="Foto tomada">
      <div className="lienzo">{url && <img src={url} alt="Foto tomada" />}</div>
      <div className="camara-pie" style={{ minHeight: 0 }}>
        <button className="boton" style={{ color: '#fff', background: 'transparent', borderColor: 'rgba(255,255,255,.4)' }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ informar un problema
const FRASES: Record<string, string[]> = {
  agua: ['Fuga de agua', 'Sin agua en la línea', 'Niples tapados', 'Agua sucia'],
  alimento: ['No llega alimento', 'Alimento mojado', 'Silo vacío', 'Línea trabada'],
  aves: ['Aves decaídas', 'Mortalidad alta', 'Picaje', 'Aves sueltas'],
  equipo: ['Ventilador detenido', 'Luces apagadas', 'Cinta de huevos detenida', 'Motor con ruido'],
  instalacion: ['Malla rota', 'Puerta dañada', 'Gotera', 'Roedores'],
  otro: [],
};

export function Problema(p: { galpon?: string }) {
  const config = useEstado((e) => e.config)!;
  const usuario = useEstado((e) => e.usuario)!;
  const [galponId, setGalponId] = useState<string | null>(p.galpon ?? null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [camara, setCamara] = useState(false);
  const [foto, setFoto] = useState<FotoNueva | null>(null);
  const [sinFoto, setSinFoto] = useState(false);
  const [frases, setFrases] = useState<string[]>([]);
  const [nota, setNota] = useState('');
  const [guardado, setGuardado] = useState(false);
  const regId = useRef(uid()).current;
  const guardando = useRef(false);
  const galpon = config.galpones.find((g) => g.id === galponId);
  const nombreLugar = galpon?.nombre ?? 'Plantel en general';

  // La ubicación se pide al saber dónde está el problema (antes solo se tomaba al abrir un galpón).
  useEffect(() => {
    if (galponId) abrirVisita(galponId);
  }, [galponId]);

  const retroceder = () => {
    if (camara) return setCamara(false);
    if (foto || sinFoto) {
      setFoto(null);
      setSinFoto(false);
      return;
    }
    if (categoria) return setCategoria(null);
    if (galponId && !p.galpon) return setGalponId(null);
    cerrarPantalla();
  };
  useAtras(retroceder, !guardado);

  const enviar = async () => {
    if (guardando.current) return;
    guardando.current = true;
    const pres = banderasPresencia(galpon, galponId ?? '');
    const texto = [...frases, nota.trim()].filter(Boolean).join('. ');
    const flags: Flag[] = ['problema', ...pres.flags.filter((f) => f === 'lejos')];
    if (!foto) flags.push('sin_foto');
    await guardarRegistro(
      {
        id: regId,
        tipo: 'problema',
        fecha: fechaLocal(ahora()),
        galpon_id: galponId ?? 'general',
        tarea_id: null,
        usuario_id: usuario.id,
        usuario_nombre: usuario.nombre,
        galpon_nombre: nombreLugar,
        tarea: null,
        valores: [],
        indicadores: [],
        ok: false,
        categoria,
        nota: texto,
        fotos: foto ? [{ id: foto.id, etiqueta: foto.etiqueta }] : [],
        flags,
        lat: pres.lat,
        lng: pres.lng,
        precision: pres.precision,
        capturado_dispositivo: ahora().toISOString(),
        omitida: false,
        anulado: false,
        corrige: null,
        motivo: '',
      },
      foto ? [foto] : [],
    ).catch((e) => {
      console.error(e);
      guardando.current = false;
      avisar('No se pudo guardar en el teléfono. Revisa que tenga espacio libre e inténtalo de nuevo.', 'mal');
      throw e;
    });
    setGuardado(true);
    setTimeout(cerrarPantalla, 1100);
  };

  if (guardado) return <Confirmado texto="Problema informado" detalle={detalleEnvio()} />;

  if (camara) {
    return (
      <Camara
        titulo="Foto del problema"
        sub={nombreLugar}
        marca={() => lineasMarca(nombreLugar, 'Problema informado', CATEGORIAS_PROBLEMA.find((c) => c.id === categoria)?.nombre ?? '', usuario.nombre, regId, galponId ?? '')}
        alCapturar={(b) => {
          setFoto({ id: uid(), etiqueta: 'Problema', blob: b });
          setCamara(false);
        }}
        alCancelar={() => setCamara(false)}
        sinFoto={() => {
          setSinFoto(true);
          setCamara(false);
        }}
        opcional
        textoSinFoto="Sin foto"
      />
    );
  }

  if (galponId === null) {
    return (
      <div className="pantalla">
        <Barra titulo="Informar un problema" atras={retroceder} />
        <div className="contenido">
          <h2 className="titulo">¿Dónde está el problema?</h2>
          <div className="pila">
            {config.galpones.filter((g) => g.activo).map((g) => (
              <button key={g.id} className="boton grande" onClick={() => setGalponId(g.id)}>
                {g.nombre}
              </button>
            ))}
            <button className="boton grande" onClick={() => setGalponId('general')}>
              Otro lugar del plantel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!categoria) {
    return (
      <div className="pantalla">
        <Barra titulo="Informar un problema" sub={nombreLugar} atras={retroceder} />
        <div className="contenido">
          <h2 className="titulo">¿De qué se trata?</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {CATEGORIAS_PROBLEMA.map((c) => (
              <button
                key={c.id}
                className="boton"
                style={{ flexDirection: 'column', minHeight: 116, fontSize: 19 }}
                onClick={() => {
                  setCategoria(c.id);
                  setCamara(true);
                }}
              >
                <IconoTarea nombre={c.icono} size={38} />
                {c.nombre}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const opciones = FRASES[categoria] ?? [];
  const puede = Boolean(foto) || frases.length > 0 || nota.trim().length >= 3;
  return (
    <div className="pantalla">
      <Barra titulo="Informar un problema" sub={`${nombreLugar}, ${CATEGORIAS_PROBLEMA.find((c) => c.id === categoria)?.nombre}`} atras={retroceder} />
      <div className="contenido">
        {foto ? (
          <div className="miniaturas">
            <FotoBlob blob={foto.blob} etiqueta="Foto del problema" />
            <button className="boton chico" style={{ alignSelf: 'center' }} onClick={() => setCamara(true)}>
              <Camera size={20} aria-hidden /> Repetir
            </button>
          </div>
        ) : (
          <button className="boton" onClick={() => setCamara(true)}>
            <Camera size={22} aria-hidden /> Tomar una foto
          </button>
        )}
        {opciones.length > 0 && (
          <div className="pila">
            <p className="rotulo">¿Qué pasa?</p>
            <div className="opciones">
              {opciones.map((f) => (
                <button key={f} className="opcion" aria-pressed={frases.includes(f)} onClick={() => setFrases(frases.includes(f) ? frases.filter((x) => x !== f) : [...frases, f])}>
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="campo">
          <span>{opciones.length ? 'Algo más (opcional)' : 'Descríbelo en pocas palabras'}</span>
          <textarea className="entrada" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
          <small>Puedes usar el micrófono del teclado para dictar.</small>
        </label>
      </div>
      <div className="pie">
        <button className="boton peligro grande" disabled={!puede} onClick={enviar}>
          <TriangleAlert size={24} aria-hidden /> Avisar al supervisor
        </button>
      </div>
    </div>
  );
}

export { Clock as IconoReloj };
