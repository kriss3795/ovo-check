import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowDown, ArrowUp, Bell, Check, ChevronRight, ClipboardList, Database, Images, KeyRound, LogOut, MapPin, Plus,
  Send, Settings2, Smartphone, Trash2, Users, Warehouse, Wifi, X,
} from 'lucide-react';
import { administrar, ahora, diagnostico, guardarConfig, salir } from '../lib/app';
import { avisar, ir, useEstado, volver } from '../lib/estado';
import { anotarPausa, cargaDiaria, NOMBRE_BLOQUE } from '../lib/logica';
import { mensajeError } from '../lib/nube';
import { BIBLIOTECA, RUTINA_CLASICA, campoAvesVivas, campoVacio, tareaDesde, tareaVacia } from '../lib/plantillas';
import type { Campo, Config, Galpon, Tarea, Usuario } from '../lib/tipos';
import { DIAS_CORTOS, claveDebil, fechaLocal, haceCuanto, hashPin, iniciales, nombreDia, num, uid } from '../lib/util';
import { Barra, Confirmar, Hoja, ICONOS, IconoTarea, Interruptor, aNumero } from './base';
import { CambiarClave, correoValido } from './inicio';
import { BotonInstalar, PaginaAvisos } from './avisos';
import { HojaExportar, HojaFotos, marcarPaso } from './supervisor';
import { Falta } from './operario';

/** Guarda un cambio de configuración en el servidor y avisa el resultado. */
function useGuardar() {
  const [ocupado, setOcupado] = useState(false);
  const guardar = async (cambio: (c: Config) => void, listo?: string): Promise<boolean> => {
    setOcupado(true);
    try {
      await guardarConfig(cambio);
      if (listo) avisar(listo, 'ok');
      return true;
    } catch (e) {
      avisar(mensajeError(e), 'mal');
      return false;
    } finally {
      setOcupado(false);
    }
  };
  return { ocupado, guardar };
}

const TEXTO_AVISOS = {
  activo: 'Activadas en este equipo',
  apagado: 'Desactivadas en este equipo',
  bloqueado: 'Bloqueadas en este equipo',
  no_disponible: 'No disponibles en este navegador',
};

// ------------------------------------------------------------------ menú
export function Ajustes() {
  const config = useEstado((e) => e.config)!;
  const dispositivos = useEstado((e) => e.dispositivos);
  const [exportar, setExportar] = useState(false);
  const [bajarFotos, setBajarFotos] = useState(false);
  const fotosNube = useEstado((e) => e.fotosNube);
  const [confirmarSalir, setConfirmarSalir] = useState(false);
  const avisos = useEstado((e) => e.avisos);
  const operarios = config.usuarios.filter((u) => u.rol === 'operario' && u.estado !== 'baja').length;
  const fila = (icono: ReactNode, titulo: string, detalle: string, accion: () => void) => (
    <button className="fila" onClick={accion}>
      <span className="medallon">{icono}</span>
      <span className="fila-cuerpo">
        <span className="fila-titulo" style={{ display: 'block' }}>
          {titulo}
        </span>
        <span className="fila-detalle" style={{ display: 'block' }}>
          {detalle}
        </span>
      </span>
      <ChevronRight className="flecha" aria-hidden />
    </button>
  );
  const carga = cargaDiaria(config.tareas);
  return (
    <>
      <h2 className="titulo">Ajustes</h2>
      <p className="seccion">La rutina</p>
      <div className="lista">
        {fila(<ClipboardList size={24} />, 'Tareas', `${config.tareas.filter((t) => t.activo).length} activas, cerca de ${carga.minutos} min de registro por galpón`, () => ir({ p: 'ajuste', cual: 'tareas' }))}
        {fila(<Warehouse size={24} />, 'Galpones', `${config.galpones.filter((g) => g.activo).length} en producción`, () => ir({ p: 'ajuste', cual: 'galpones' }))}
        {fila(<Users size={24} />, 'Personas', `${operarios} ${operarios === 1 ? 'operario' : 'operarios'}`, () => ir({ p: 'ajuste', cual: 'personas' }))}
      </div>
      <p className="seccion">Teléfonos</p>
      <div className="lista">
        {fila(<Smartphone size={24} />, 'Teléfonos y clave del plantel', `${dispositivos.length || 1} ${dispositivos.length > 1 ? 'equipos en el plantel' : 'equipo en el plantel'}`, () => ir({ p: 'ajuste', cual: 'telefonos' }))}
      </div>
      <p className="seccion">Datos y cuenta</p>
      <div className="lista">
        {fila(<Database size={24} />, 'Descargar datos', 'Todos los registros en un archivo para Excel', () => setExportar(true))}
        {fila(<Images size={24} />, 'Descargar fotos', `En la nube se guardan ${fotosNube?.dias ?? 30} días y luego se borran`, () => setBajarFotos(true))}
        {fila(<Bell size={24} />, 'Notificaciones', TEXTO_AVISOS[avisos], () => ir({ p: 'ajuste', cual: 'avisos' }))}
        {fila(<Settings2 size={24} />, 'Plantel', 'Nombre y espacio para fotos', () => ir({ p: 'ajuste', cual: 'granja' }))}
        {fila(<KeyRound size={24} />, 'Cambiar mi clave', 'Clave de supervisor', () => ir({ p: 'ajuste', cual: 'clave' }))}
        {fila(<Wifi size={24} />, 'Probar conexión', 'Revisa el servidor y la subida de fotos', () => ir({ p: 'ajuste', cual: 'diagnostico' }))}
      </div>
      <BotonInstalar />
      <button className="boton" onClick={() => setConfirmarSalir(true)}>
        <LogOut size={22} aria-hidden /> Cerrar sesión
      </button>
      {exportar && <HojaExportar cerrar={() => setExportar(false)} />}
      {bajarFotos && <HojaFotos cerrar={() => setBajarFotos(false)} />}
      {confirmarSalir && <Confirmar titulo="¿Cerrar la sesión de supervisor?" texto="Para volver a entrar necesitarás tu clave." accion="Cerrar sesión" alConfirmar={() => salir(true)} cerrar={() => setConfirmarSalir(false)} />}
    </>
  );
}

export function AjustePantalla(p: { cual: string; id?: string }) {
  switch (p.cual) {
    case 'tareas':
      return <Tareas />;
    case 'tarea':
      return <EditorTarea id={p.id!} />;
    case 'galpones':
      return <Galpones />;
    case 'galpon':
      return <EditorGalpon id={p.id!} />;
    case 'personas':
      return <Personas />;
    case 'telefonos':
      return <Telefonos />;
    case 'granja':
      return <Granja />;
    case 'clave':
      return <CambiarClave alTerminar={volver} />;
    case 'diagnostico':
      return <Diagnostico />;
    case 'avisos':
      return <PaginaAvisos />;
    default:
      return <Falta />;
  }
}

// ------------------------------------------------------------------ tareas
const describirDias = (dias: number[]) =>
  dias.length === 7 ? 'Todos los días' : dias.length === 1 ? `Cada ${nombreDia(dias[0])}` : [...dias].sort().map((d) => DIAS_CORTOS[d]).join(', ');

const describirTipo = (t: Tarea) =>
  t.tipo === 'check' ? 'Revisión' : t.tipo === 'fotos' ? `${t.fotoEtiquetas.length} ${t.fotoEtiquetas.length === 1 ? 'foto' : 'fotos'}` : t.tipo === 'contador' ? 'Contador' : t.campos.length > 1 ? `${t.campos.length} números` : 'Número';

function Tareas() {
  const config = useEstado((e) => e.config)!;
  const { ocupado, guardar } = useGuardar();
  const [agregar, setAgregar] = useState(false);
  useEffect(() => marcarPaso('tareas'), []);
  const carga = cargaDiaria(config.tareas);
  const mover = (i: number, d: number) =>
    guardar((c) => {
      const j = i + d;
      if (j < 0 || j >= c.tareas.length) return;
      [c.tareas[i], c.tareas[j]] = [c.tareas[j], c.tareas[i]];
    });
  const nombres = new Set(config.tareas.map((t) => t.nombre));
  const disponibles = [...RUTINA_CLASICA, ...BIBLIOTECA].filter((b) => !nombres.has(b.nombre));

  return (
    <div className="pantalla">
      <Barra titulo="Tareas" sub="Lo que el operario registra en cada galpón" />
      <div className="contenido">
        <div className={`tarjeta ${carga.minutos > 6 ? 'aviso-atencion' : 'aviso-info'}`}>
          <p className="fuerte">
            {carga.diarias} tareas diarias, {carga.fotos} {carga.fotos === 1 ? 'foto' : 'fotos'}, cerca de {carga.minutos} min por galpón
          </p>
          <p className="chico">
            {carga.minutos > 6 ? 'Es una rutina larga. Mientras más corta, mejor se cumple: deja solo lo que de verdad vas a revisar.' : 'Es el tiempo que el operario dedica a registrar, sin contar el trabajo mismo.'}
          </p>
        </div>
        {config.tareas.length === 0 && <div className="tarjeta suave">No hay tareas. Agrega las que quieras que el operario registre.</div>}
        <div className="lista">
          {config.tareas.map((t, i) => (
            <div key={t.id} className="fila" style={{ paddingRight: 6 }}>
              <button className="linea-h crece" style={{ gap: 14, minHeight: 56 }} onClick={() => ir({ p: 'ajuste', cual: 'tarea', id: t.id })}>
                <span className="medallon" style={t.activo ? undefined : { opacity: 0.45 }}>
                  <IconoTarea nombre={t.icono} size={24} />
                </span>
                <span className="fila-cuerpo">
                  <span className="fila-titulo" style={{ display: 'block' }}>
                    {t.nombre}
                  </span>
                  <span className="fila-detalle" style={{ display: 'block' }}>
                    {[describirTipo(t), NOMBRE_BLOQUE[t.bloque].toLowerCase(), describirDias(t.dias).toLowerCase(), t.galpones ? `${t.galpones.length} ${t.galpones.length === 1 ? 'galpón' : 'galpones'}` : ''].filter(Boolean).join(', ')}
                  </span>
                  {!t.activo && <span className="etiqueta" style={{ marginTop: 4 }}>En pausa</span>}
                </span>
              </button>
              <button className="icono-boton" style={{ width: 40 }} onClick={() => mover(i, -1)} disabled={ocupado || i === 0} aria-label={`Subir ${t.nombre}`}>
                <ArrowUp size={20} opacity={i === 0 ? 0.25 : 1} />
              </button>
              <button className="icono-boton" style={{ width: 40 }} onClick={() => mover(i, 1)} disabled={ocupado || i === config.tareas.length - 1} aria-label={`Bajar ${t.nombre}`}>
                <ArrowDown size={20} opacity={i === config.tareas.length - 1 ? 0.25 : 1} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="pie">
        <button className="boton primario" onClick={() => setAgregar(true)}>
          <Plus size={22} aria-hidden /> Agregar tarea
        </button>
      </div>
      {agregar && (
        <Hoja titulo="Agregar tarea" cerrar={() => setAgregar(false)}>
          <button
            className="boton primario"
            onClick={() => {
              setAgregar(false);
              ir({ p: 'ajuste', cual: 'tarea', id: 'nueva' });
            }}
          >
            Crear una tarea propia
          </button>
          {disponibles.length > 0 && (
            <>
              <p className="seccion" style={{ margin: '4px 2px 0' }}>
                O elige una frecuente
              </p>
              <div className="lista">
                {disponibles.map((b) => (
                  <button
                    key={b.nombre}
                    className="fila compacta"
                    disabled={ocupado}
                    onClick={async () => {
                      if (await guardar((c) => void c.tareas.push(tareaDesde(b, fechaLocal(ahora()))), `Se agregó ${b.nombre}`)) setAgregar(false);
                    }}
                  >
                    <span className="medallon">
                      <IconoTarea nombre={b.icono} size={22} />
                    </span>
                    <span className="fila-cuerpo">
                      <span className="fila-titulo" style={{ display: 'block' }}>
                        {b.nombre}
                      </span>
                      <span className="fila-detalle" style={{ display: 'block' }}>
                        {describirDias(b.dias)}
                      </span>
                    </span>
                    <Plus className="flecha" aria-hidden />
                  </button>
                ))}
              </div>
            </>
          )}
        </Hoja>
      )}
    </div>
  );
}

function EditorCampo(p: { campo: Campo; alCambiar: (c: Campo) => void; esContador: boolean; quitar?: () => void; titulo: string }) {
  const c = p.campo;
  const set = (cambio: Partial<Campo>) => p.alCambiar({ ...c, ...cambio });
  const sugerido = (r: Campo['calculo']) => (r === 'pct' ? '% del lote' : r === 'por_ave' ? (c.unidad === 'L' ? 'ml por ave' : c.unidad === 'kg' ? 'g por ave' : 'por cada 1.000 aves') : '');
  return (
    <div className="tarjeta pila">
      <div className="linea-h entre">
        <p className="fuerte">{p.titulo}</p>
        {p.quitar && (
          <button className="enlace gris chico" onClick={p.quitar}>
            Quitar
          </button>
        )}
      </div>
      <div className="linea-h" style={{ alignItems: 'flex-start' }}>
        <label className="campo crece">
          <span>Qué se anota</span>
          <input className="entrada" value={c.etiqueta} onChange={(e) => set({ etiqueta: e.target.value })} maxLength={30} />
        </label>
        <label className="campo" style={{ width: 110 }}>
          <span>Unidad</span>
          <input className="entrada" value={c.unidad} onChange={(e) => set({ unidad: e.target.value })} maxLength={10} placeholder="kg, L…" />
        </label>
      </div>
      {!p.esContador && (
        <>
          <div className="campo">
            <span className="rotulo">Decimales</span>
            <div className="segmentos">
              {[0, 1, 2].map((d) => (
                <button key={d} type="button" aria-pressed={c.decimales === d} onClick={() => set({ decimales: d })}>
                  {d === 0 ? 'Sin decimales' : d === 1 ? 'Uno (0,0)' : 'Dos (0,00)'}
                </button>
              ))}
            </div>
          </div>
          <Interruptor activo={c.acumulativo} alCambiar={(v) => set({ acumulativo: v })}>
            <b>Es un medidor que solo sube</b>
            <br />
            <span className="chico suave">Se calcula el consumo del día restando la lectura anterior.</span>
          </Interruptor>
        </>
      )}
      <label className="campo">
        <span>Indicador para el supervisor</span>
        <select className="entrada" value={c.calculo} onChange={(e) => set({ calculo: e.target.value as Campo['calculo'], indicador: sugerido(e.target.value as Campo['calculo']) })}>
          <option value="valor">Ninguno: solo el número anotado</option>
          <option value="por_ave">Por ave, multiplicado por 1.000 (L a ml, kg a g)</option>
          <option value="pct">Porcentaje sobre las aves del galpón</option>
        </select>
        <small>El operario nunca ve este cálculo ni valores de referencia: solo anota lo que mide.</small>
      </label>
      {c.calculo !== 'valor' && (
        <label className="campo">
          <span>Nombre del indicador</span>
          <input className="entrada" value={c.indicador} onChange={(e) => set({ indicador: e.target.value })} maxLength={24} placeholder="ml por ave, % de postura…" />
          <small>Necesita que el galpón tenga anotada su cantidad de aves.</small>
        </label>
      )}
    </div>
  );
}

function EditorTarea({ id }: { id: string }) {
  const config = useEstado((e) => e.config)!;
  const original = config.tareas.find((t) => t.id === id);
  const [t, setT] = useState<Tarea>(() => (original ? structuredClone(original) : tareaVacia()));
  const [borrar, setBorrar] = useState(false);
  const [error, setError] = useState('');
  const { ocupado, guardar } = useGuardar();
  const nueva = !original;
  if (!original && id !== 'nueva') return <Falta />;
  const set = (c: Partial<Tarea>) => setT((x) => ({ ...x, ...c }));

  const cambiarTipo = (tipo: Tarea['tipo']) => {
    const c: Partial<Tarea> = { tipo };
    if (tipo === 'numero') c.campos = t.campos.length === 0 ? [campoVacio()] : t.campos.filter((x) => !x.saldo);
    if (tipo === 'contador') c.campos = [{ ...(t.campos[0] ?? campoVacio()), decimales: 0, acumulativo: false }];
    if (tipo === 'check' || tipo === 'fotos') c.campos = [];
    if (tipo === 'fotos') c.foto = 'obligatoria';
    set(c);
  };

  const enviar = async () => {
    const limpio: Tarea = {
      ...t,
      nombre: t.nombre.trim(),
      ayuda: t.ayuda.trim(),
      fotoEtiquetas: t.fotoEtiquetas.map((x) => x.trim()).filter(Boolean),
      campos: t.campos.map((c) => ({ ...c, etiqueta: c.etiqueta.trim() || 'Valor', unidad: c.unidad.trim(), indicador: c.indicador.trim() })),
    };
    if (!limpio.fotoEtiquetas.length) limpio.fotoEtiquetas = ['Foto'];
    if (limpio.nombre.length < 2) return setError('Ponle un nombre a la tarea');
    if (!limpio.dias.length) return setError('Elige al menos un día');
    if (limpio.galpones && !limpio.galpones.length) return setError('Elige al menos un galpón');
    setError('');
    const ok = await guardar((c) => {
      const i = c.tareas.findIndex((x) => x.id === limpio.id);
      // Se anota desde cuándo se pide y sus pausas: los días en que no correspondía no aparecen como sin registrar.
      const conHistoria = anotarPausa(limpio, i >= 0 ? c.tareas[i] : undefined, fechaLocal(ahora()));
      if (i >= 0) c.tareas[i] = conHistoria;
      else c.tareas.push(conHistoria);
    }, nueva ? 'Tarea creada' : 'Tarea guardada');
    if (ok) volver();
  };

  const conNumeros = t.tipo === 'numero' || t.tipo === 'contador';
  return (
    <div className="pantalla">
      <Barra titulo={nueva ? 'Tarea nueva' : 'Editar tarea'} />
      <div className="contenido">
        <label className="campo">
          <span>Nombre</span>
          <input className="entrada" value={t.nombre} onChange={(e) => set({ nombre: e.target.value })} maxLength={50} placeholder="Por ejemplo: Lectura del medidor de agua" />
        </label>
        <div className="campo">
          <span className="rotulo">Qué registra el operario</span>
          <div className="segmentos">
            {(
              [
                ['check', 'Revisión'],
                ['numero', 'Número'],
                ['contador', 'Contador'],
                ['fotos', 'Solo fotos'],
              ] as const
            ).map(([v, n]) => (
              <button key={v} type="button" aria-pressed={t.tipo === v} onClick={() => cambiarTipo(v)}>
                {n}
              </button>
            ))}
          </div>
          <small>
            {t.tipo === 'check' && 'Dos botones: Todo bien o Hay un problema. Si hay problema, se pide foto y descripción.'}
            {t.tipo === 'numero' && 'El operario teclea uno o dos números, por ejemplo una lectura o los kilos.'}
            {t.tipo === 'contador' && 'Botones de más y menos para contar, por ejemplo las aves muertas.'}
            {t.tipo === 'fotos' && 'Solo fotos de respaldo, por ejemplo la planilla de pesaje llena.'}
          </small>
        </div>
        <label className="campo">
          <span>Instrucción para el operario</span>
          <textarea className="entrada" style={{ minHeight: 72 }} value={t.ayuda} onChange={(e) => set({ ayuda: e.target.value })} maxLength={160} placeholder="Una frase corta y clara" />
        </label>
        <div className="campo">
          <span className="rotulo">Ícono</span>
          <div className="opciones">
            {Object.entries(ICONOS).map(([k, v]) => (
              <button key={k} type="button" className="opcion cuadrada" aria-pressed={t.icono === k} aria-label={v.nombre} title={v.nombre} onClick={() => set({ icono: k })}>
                <v.C size={24} aria-hidden />
              </button>
            ))}
          </div>
        </div>

        {conNumeros && (
          <>
            {t.campos.map((c, i) =>
              c.saldo ? null : (
                <EditorCampo
                  key={i}
                  titulo={t.campos.filter((x) => !x.saldo).length > 1 ? `Dato ${i + 1}` : 'El dato'}
                  campo={c}
                  esContador={t.tipo === 'contador'}
                  alCambiar={(n) => set({ campos: t.campos.map((x, k) => (k === i ? n : x)) })}
                  quitar={t.tipo === 'numero' && t.campos.length > 1 ? () => set({ campos: t.campos.filter((_, k) => k !== i) }) : undefined}
                />
              ),
            )}
            {t.tipo === 'contador' && (
              <div className="tarjeta">
                <Interruptor
                  activo={t.campos.some((x) => x.saldo)}
                  alCambiar={(v) => set({ campos: v ? [t.campos[0] ?? campoVacio(), campoAvesVivas()] : t.campos.filter((x) => !x.saldo) })}
                >
                  <b>Pedir también las aves vivas</b>
                  <br />
                  <span className="chico suave">
                    Después de contar, el operario anota cuántas aves vivas quedan. Si no calza con lo anotado la vez anterior menos las de hoy, te
                    llega una alerta para que preguntes. El operario no ve el número anterior ni el aviso.
                  </span>
                </Interruptor>
              </div>
            )}
            {t.tipo === 'numero' && t.campos.length < 3 && (
              <button className="boton" onClick={() => set({ campos: [...t.campos, campoVacio()] })}>
                <Plus size={20} aria-hidden /> Agregar otro dato a esta tarea
              </button>
            )}
          </>
        )}

        <div className="campo">
          <span className="rotulo">Foto de respaldo</span>
          {t.tipo !== 'fotos' && (
            <div className="segmentos">
              {(
                [
                  ['no', 'No se pide'],
                  ['opcional', 'Opcional'],
                  ['obligatoria', 'Obligatoria'],
                ] as const
              ).map(([v, n]) => (
                <button key={v} type="button" aria-pressed={t.foto === v} onClick={() => set({ foto: v })}>
                  {n}
                </button>
              ))}
            </div>
          )}
          {(t.tipo === 'fotos' || t.foto !== 'no') && (
            <div className="pila" style={{ marginTop: 6 }}>
              {t.fotoEtiquetas.map((f, i) => (
                <div key={i} className="linea-h">
                  <input className="entrada" value={f} onChange={(e) => set({ fotoEtiquetas: t.fotoEtiquetas.map((x, k) => (k === i ? e.target.value : x)) })} maxLength={30} placeholder="Qué debe fotografiar" aria-label={`Foto ${i + 1}`} />
                  {t.fotoEtiquetas.length > 1 && (
                    <button className="icono-boton" onClick={() => set({ fotoEtiquetas: t.fotoEtiquetas.filter((_, k) => k !== i) })} aria-label="Quitar esta foto">
                      <X size={22} />
                    </button>
                  )}
                </div>
              ))}
              {t.fotoEtiquetas.length < 3 && (
                <button className="enlace" onClick={() => set({ fotoEtiquetas: [...t.fotoEtiquetas, ''] })}>
                  <Plus size={18} aria-hidden /> Pedir otra foto
                </button>
              )}
              <small className="suave chico">
                {t.tipo === 'contador' ? 'En un contador la foto se pide solo cuando el número es mayor que cero.' : 'Una foto por tarea, no por cada dato. En tareas con muchas mediciones: una del instrumento y una de la planilla.'}
              </small>
            </div>
          )}
        </div>

        <div className="campo">
          <span className="rotulo">Cuándo</span>
          <div className="segmentos">
            <button type="button" aria-pressed={t.bloque === 'manana'} onClick={() => set({ bloque: 'manana' })}>
              En la mañana
            </button>
            <button type="button" aria-pressed={t.bloque === 'tarde'} onClick={() => set({ bloque: 'tarde' })}>
              En la tarde
            </button>
          </div>
          <div className="opciones" style={{ marginTop: 8 }}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button key={d} type="button" className="opcion cuadrada" aria-pressed={t.dias.includes(d)} aria-label={nombreDia(d)} onClick={() => set({ dias: t.dias.includes(d) ? t.dias.filter((x) => x !== d) : [...t.dias, d] })}>
                {DIAS_CORTOS[d]}
              </button>
            ))}
          </div>
          <small>{t.dias.length ? describirDias(t.dias) : 'Elige al menos un día'}. Pasadas las 13:00 (mañana) o las 20:00 (tarde) lo pendiente se marca como atrasado.</small>
        </div>

        <div className="tarjeta pila">
          <Interruptor activo={t.galpones === null} alCambiar={(v) => set({ galpones: v ? null : config.galpones.filter((g) => g.activo).map((g) => g.id) })}>
            <b>En todos los galpones</b>
          </Interruptor>
          {t.galpones !== null && (
            <div className="opciones">
              {config.galpones.map((g) => (
                <button key={g.id} type="button" className="opcion" aria-pressed={t.galpones!.includes(g.id)} onClick={() => set({ galpones: t.galpones!.includes(g.id) ? t.galpones!.filter((x) => x !== g.id) : [...t.galpones!, g.id] })}>
                  {g.nombre}
                </button>
              ))}
            </div>
          )}
          <Interruptor activo={!t.activo} alCambiar={(v) => set({ activo: !v })}>
            <b>En pausa</b>
            <br />
            <span className="chico suave">Deja de pedirse sin borrarla.</span>
          </Interruptor>
        </div>

        {!nueva && (
          <button className="boton peligro-suave" onClick={() => setBorrar(true)}>
            <Trash2 size={20} aria-hidden /> Eliminar tarea
          </button>
        )}
        {error && <p className="error-texto" role="alert">{error}</p>}
      </div>
      <div className="pie">
        <button className="boton primario grande" onClick={enviar} disabled={ocupado}>
          {ocupado ? 'Guardando…' : nueva ? 'Crear tarea' : 'Guardar cambios'}
        </button>
      </div>
      {borrar && (
        <Confirmar
          titulo={`¿Eliminar "${t.nombre}"?`}
          texto="Deja de pedirse desde ahora. Los registros ya hechos se conservan en el historial."
          accion="Eliminar tarea"
          peligro
          ocupado={ocupado}
          cerrar={() => setBorrar(false)}
          alConfirmar={async () => {
            if (await guardar((c) => void (c.tareas = c.tareas.filter((x) => x.id !== t.id)), 'Tarea eliminada')) {
              setBorrar(false);
              volver();
            }
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ galpones
function Galpones() {
  const config = useEstado((e) => e.config)!;
  return (
    <div className="pantalla">
      <Barra titulo="Galpones" />
      <div className="contenido">
        {config.galpones.length === 0 && <div className="tarjeta suave">Aún no hay galpones.</div>}
        <div className="lista">
          {config.galpones.map((g) => (
            <button key={g.id} className="fila" onClick={() => ir({ p: 'ajuste', cual: 'galpon', id: g.id })}>
              <span className="medallon" style={g.activo ? undefined : { opacity: 0.45 }}>
                <Warehouse size={24} />
              </span>
              <span className="fila-cuerpo">
                <span className="fila-titulo" style={{ display: 'block' }}>
                  {g.nombre}
                </span>
                <span className="fila-detalle" style={{ display: 'block' }}>
                  {[g.aves ? `${num(g.aves)} aves` : 'Falta anotar las aves', g.lote && `lote ${g.lote}`, (g.encargados ?? []).length ? `a cargo de ${(g.encargados ?? []).map((id) => config.usuarios.find((u) => u.id === id)?.nombre.split(' ')[0]).filter(Boolean).join(' y ')}` : 'sin encargado'].filter(Boolean).join(', ')}
                </span>
              </span>
              {!g.activo && <span className="etiqueta">En descanso</span>}
              <ChevronRight className="flecha" aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <div className="pie">
        <button className="boton primario" onClick={() => ir({ p: 'ajuste', cual: 'galpon', id: 'nuevo' })}>
          <Plus size={22} aria-hidden /> Agregar galpón
        </button>
      </div>
    </div>
  );
}

function EditorGalpon({ id }: { id: string }) {
  const config = useEstado((e) => e.config)!;
  const original = config.galpones.find((g) => g.id === id);
  const [g, setG] = useState<Galpon>(() => original ? { ...original } : { id: uid(), nombre: `Galpón ${config.galpones.length + 1}`, aves: null, lote: '', lat: null, lng: null, activo: true });
  const [aves, setAves] = useState(original?.aves ? String(original.aves) : '');
  const [borrar, setBorrar] = useState(false);
  const [ubicando, setUbicando] = useState(false);
  const { ocupado, guardar } = useGuardar();
  const nuevo = !original;
  if (!original && id !== 'nuevo') return <Falta />;
  const set = (c: Partial<Galpon>) => setG((x) => ({ ...x, ...c }));
  const operarios = config.usuarios.filter((u) => u.rol === 'operario' && u.estado !== 'baja').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const ubicar = () => {
    if (!('geolocation' in navigator)) return avisar('Este equipo no entrega ubicación', 'mal');
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setUbicando(false);
        set({ lat: p.coords.latitude, lng: p.coords.longitude });
        avisar(`Ubicación tomada (precisión de ${Math.round(p.coords.accuracy)} m)`, 'ok');
      },
      () => {
        setUbicando(false);
        avisar('No se pudo obtener la ubicación. Revisa el permiso y el GPS.', 'mal');
      },
      { enableHighAccuracy: true, timeout: 20000 },
    );
  };

  const enviar = async () => {
    const limpio: Galpon = { ...g, nombre: g.nombre.trim(), lote: g.lote.trim(), aves: aNumero(aves) };
    if (limpio.nombre.length < 1) return avisar('Ponle un nombre al galpón', 'mal');
    if (config.galpones.some((x) => x.id !== limpio.id && x.nombre.toLowerCase() === limpio.nombre.toLowerCase())) return avisar('Ya hay un galpón con ese nombre', 'mal');
    const ok = await guardar((c) => {
      const i = c.galpones.findIndex((x) => x.id === limpio.id);
      // Se anota desde cuándo está en producción y sus descansos: esos días no aparecen como sin registrar.
      const conHistoria = anotarPausa(limpio, i >= 0 ? c.galpones[i] : undefined, fechaLocal(ahora()));
      if (i >= 0) c.galpones[i] = conHistoria;
      else c.galpones.push(conHistoria);
    }, nuevo ? 'Galpón agregado' : 'Galpón guardado');
    if (ok) volver();
  };

  return (
    <div className="pantalla">
      <Barra titulo={nuevo ? 'Galpón nuevo' : g.nombre} />
      <div className="contenido">
        <label className="campo">
          <span>Nombre</span>
          <input className="entrada" value={g.nombre} onChange={(e) => set({ nombre: e.target.value })} maxLength={30} />
        </label>
        <label className="campo">
          <span>Aves alojadas hoy</span>
          <input className="entrada" inputMode="numeric" value={aves} onChange={(e) => setAves(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Por ejemplo: 12000" />
          <small>Con este número se calculan el consumo por ave, el porcentaje de postura y la mortalidad. Actualízalo cuando cambie.</small>
        </label>
        <label className="campo">
          <span>Lote (opcional)</span>
          <input className="entrada" value={g.lote} onChange={(e) => set({ lote: e.target.value })} maxLength={30} placeholder="Por ejemplo: 24-A, Lohmann Brown" />
        </label>
        <div className="tarjeta pila">
          <Interruptor activo={g.activo} alCambiar={(v) => set({ activo: v })}>
            <b>En producción</b>
            <br />
            <span className="chico suave">Apágalo en el descanso sanitario: no se piden tareas ni aparece a los operarios.</span>
          </Interruptor>
        </div>
        <div className="tarjeta pila">
          <p className="fuerte">Encargados</p>
          {operarios.length ? (
            <div className="opciones">
              {operarios.map((u) => {
                const marcado = (g.encargados ?? []).includes(u.id);
                return (
                  <button key={u.id} type="button" className="opcion" aria-pressed={marcado} onClick={() => set({ encargados: marcado ? (g.encargados ?? []).filter((x) => x !== u.id) : [...(g.encargados ?? []), u.id] })}>
                    {u.nombre}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="chico suave">Primero agrega a los operarios en Ajustes, Personas.</p>
          )}
          <p className="chico suave">Cualquier operario puede registrar en cualquier galpón. Los encargados sirven para ver lo que le falta a cada persona y para que le lleguen a ella los recordatorios.</p>
        </div>
        <div className="tarjeta pila">
          <p className="fuerte">Ubicación del galpón</p>
          <p className="chico suave">
            {g.lat != null ? `Guardada: ${g.lat.toFixed(5)}, ${g.lng!.toFixed(5)}. Los registros hechos a más de 300 m se marcan para verificar.` : 'Opcional. Párate en la puerta del galpón y guarda la ubicación: los registros hechos lejos de ahí se marcan para verificar.'}
          </p>
          <div className="linea-h">
            <button className="boton chico crece" onClick={ubicar} disabled={ubicando}>
              <MapPin size={20} aria-hidden /> {ubicando ? 'Buscando…' : g.lat != null ? 'Tomar de nuevo' : 'Usar donde estoy ahora'}
            </button>
            {g.lat != null && (
              <button className="boton chico" onClick={() => set({ lat: null, lng: null })}>
                Quitar
              </button>
            )}
          </div>
        </div>
        {!nuevo && (
          <button className="boton peligro-suave" onClick={() => setBorrar(true)}>
            <Trash2 size={20} aria-hidden /> Eliminar galpón
          </button>
        )}
      </div>
      <div className="pie">
        <button className="boton primario grande" onClick={enviar} disabled={ocupado}>
          {ocupado ? 'Guardando…' : nuevo ? 'Agregar galpón' : 'Guardar cambios'}
        </button>
      </div>
      {borrar && (
        <Confirmar
          titulo={`¿Eliminar ${g.nombre}?`}
          texto="Desaparece para los operarios. Sus registros anteriores se conservan y siguen saliendo al descargar los datos. Si solo está en descanso, es mejor apagar En producción."
          accion="Eliminar galpón"
          peligro
          ocupado={ocupado}
          cerrar={() => setBorrar(false)}
          alConfirmar={async () => {
            const ok = await guardar((c) => {
              c.galpones = c.galpones.filter((x) => x.id !== g.id);
              for (const t of c.tareas) if (t.galpones) t.galpones = t.galpones.filter((x) => x !== g.id);
            }, 'Galpón eliminado');
            if (ok) {
              setBorrar(false);
              volver();
            }
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ personas
const ESTADOS = { activo: 'Activo', licencia: 'Con licencia', baja: 'De baja' } as const;

function Personas() {
  const config = useEstado((e) => e.config)!;
  const yo = useEstado((e) => e.usuario)!;
  const [editar, setEditar] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const orden = (a: Usuario, b: Usuario) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es');
  const grupo = (rol: Usuario['rol']) => config.usuarios.filter((u) => u.rol === rol).sort(orden);
  const fila = (u: Usuario) => (
    <button key={u.id} className="fila" onClick={() => setEditar(u.id)}>
      <span className="medallon redondo" style={u.activo ? undefined : { opacity: 0.45 }} aria-hidden>
        {iniciales(u.nombre)}
      </span>
      <span className="fila-cuerpo">
        <span className="fila-titulo" style={{ display: 'block' }}>
          {u.nombre}
          {u.id === yo.id && <span className="suave" style={{ fontWeight: 500 }}> (tú)</span>}
        </span>
        <span className="fila-detalle" style={{ display: 'block' }}>
          {u.rol === 'operario' ? (u.pin_hash ? 'Tiene su PIN creado' : 'Crea su PIN la primera vez que entra') : u.temporal ? 'Con clave temporal: debe cambiarla al entrar' : 'Entra con su clave'}
        </span>
      </span>
      {u.estado !== 'activo' && <span className={`etiqueta ${u.estado === 'licencia' ? 'atencion' : ''}`}>{ESTADOS[u.estado]}</span>}
      <ChevronRight className="flecha" aria-hidden />
    </button>
  );
  const elegido = config.usuarios.find((u) => u.id === editar);
  return (
    <div className="pantalla">
      <Barra titulo="Personas" />
      <div className="contenido">
        <p className="seccion">Operarios</p>
        {grupo('operario').length ? <div className="lista">{grupo('operario').map(fila)}</div> : <div className="tarjeta suave">Aún no hay operarios. Agrégalos con su nombre: cada uno crea su propio PIN la primera vez que entra.</div>}
        <p className="seccion">Supervisores</p>
        <div className="lista">{grupo('supervisor').map(fila)}</div>
      </div>
      <div className="pie">
        <button className="boton primario" onClick={() => setNueva(true)}>
          <Plus size={22} aria-hidden /> Agregar persona
        </button>
      </div>
      {nueva && <HojaPersonaNueva cerrar={() => setNueva(false)} />}
      {elegido && <HojaPersona u={elegido} esYo={elegido.id === yo.id} cerrar={() => setEditar(null)} />}
    </div>
  );
}

function HojaPersonaNueva({ cerrar }: { cerrar: () => void }) {
  const config = useEstado((e) => e.config)!;
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<Usuario['rol']>('operario');
  const [clave, setClave] = useState('');
  const [correo, setCorreo] = useState('');
  const [error, setError] = useState('');
  const { ocupado, guardar } = useGuardar();
  const enviar = async () => {
    const n = nombre.trim().replace(/\s+/g, ' ');
    if (n.length < 3) return setError('Escribe nombre y apellido');
    if (config.usuarios.some((u) => u.nombre.toLowerCase() === n.toLowerCase())) return setError('Ya existe una persona con ese nombre');
    if (rol === 'supervisor' && !correoValido(correo)) return setError('Escribe el correo del supervisor: con él entra y ahí le llega el código si olvida su clave');
    if (rol === 'supervisor' && config.usuarios.some((u) => u.rol === 'supervisor' && (u.correo ?? '').toLowerCase() === correo.trim().toLowerCase())) return setError('Otro supervisor de este plantel ya usa ese correo');
    if (rol === 'supervisor' && clave.length < 6) return setError('La clave temporal debe tener al menos 6 caracteres');
    const id = uid();
    const pin_hash = rol === 'supervisor' ? await hashPin(id, clave) : '';
    const ok = await guardar((c) => void c.usuarios.push({ id, nombre: n, rol, pin_hash, activo: true, estado: 'activo', ...(rol === 'supervisor' ? { temporal: true, correo: correo.trim().toLowerCase() } : {}) }), `Se agregó a ${n}`);
    if (ok) cerrar();
  };
  return (
    <Hoja titulo="Agregar persona" cerrar={cerrar}>
      <label className="campo">
        <span>Nombre y apellido</span>
        <input className="entrada" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={50} autoFocus autoComplete="off" />
      </label>
      <div className="segmentos">
        <button type="button" aria-pressed={rol === 'operario'} onClick={() => setRol('operario')}>
          Operario
        </button>
        <button type="button" aria-pressed={rol === 'supervisor'} onClick={() => setRol('supervisor')}>
          Supervisor
        </button>
      </div>
      {rol === 'operario' ? (
        <p className="chico suave">Aparecerá en la lista de ingreso de todos los teléfonos. La primera vez que entre crea su propio PIN; tú no lo conoces, pero puedes reiniciarlo.</p>
      ) : (
        <>
          <label className="campo">
            <span>Su correo</span>
            <input className="entrada" type="email" inputMode="email" value={correo} onChange={(e) => setCorreo(e.target.value)} maxLength={80} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            <small>Con él entra desde cualquier equipo, y ahí le llega un código si olvida su clave.</small>
          </label>
          <label className="campo">
            <span>Clave temporal</span>
            <input className="entrada" value={clave} onChange={(e) => setClave(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            <small>Entrégasela en persona. La app le pedirá cambiarla apenas entre. Un supervisor puede ver todo y cambiar la configuración.</small>
          </label>
        </>
      )}
      {error && <p className="error-texto" role="alert">{error}</p>}
      <button className="boton primario" onClick={enviar} disabled={ocupado}>
        {ocupado ? 'Guardando…' : 'Agregar'}
      </button>
    </Hoja>
  );
}

function HojaPersona({ u, esYo, cerrar }: { u: Usuario; esYo: boolean; cerrar: () => void }) {
  const [nombre, setNombre] = useState(u.nombre);
  const [correo, setCorreo] = useState(u.correo ?? '');
  const [clave, setClave] = useState('');
  const [modo, setModo] = useState<'ver' | 'clave' | 'borrar' | 'pin'>('ver');
  const { ocupado, guardar } = useGuardar();
  const cambiar = (cambio: (x: Usuario) => void, listo: string) =>
    guardar((c) => {
      const x = c.usuarios.find((y) => y.id === u.id);
      if (x) cambio(x);
    }, listo);

  if (modo === 'borrar') {
    return (
      <Confirmar
        titulo={`¿Eliminar a ${u.nombre}?`}
        texto="Ya no podrá entrar y sale de la lista. Sus registros anteriores se conservan con su nombre. Si solo está con licencia, cambia su estado en vez de eliminarla. Si usaba su propio teléfono, quítalo después en Ajustes, Teléfonos."
        accion="Eliminar persona"
        peligro
        ocupado={ocupado}
        cerrar={() => setModo('ver')}
        alConfirmar={async () => {
          const ok = await guardar((c) => {
            c.usuarios = c.usuarios.filter((x) => x.id !== u.id);
            for (const g of c.galpones) if (g.encargados) g.encargados = g.encargados.filter((x) => x !== u.id);
          }, 'Persona eliminada');
          if (ok) cerrar();
        }}
      />
    );
  }
  if (modo === 'pin') {
    return (
      <Confirmar
        titulo={`¿Reiniciar el PIN de ${u.nombre}?`}
        texto="Su PIN actual deja de servir. La próxima vez que entre creará uno nuevo."
        accion="Reiniciar PIN"
        ocupado={ocupado}
        cerrar={() => setModo('ver')}
        alConfirmar={async () => {
          if (await cambiar((x) => void (x.pin_hash = ''), 'PIN reiniciado')) setModo('ver');
        }}
      />
    );
  }
  if (modo === 'clave') {
    return (
      <Hoja titulo={`Clave temporal para ${u.nombre}`} cerrar={() => setModo('ver')}>
        <label className="campo">
          <span>Clave temporal</span>
          <input className="entrada" value={clave} onChange={(e) => setClave(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus />
          <small>Mínimo 6 caracteres. Su clave anterior deja de servir y deberá elegir una nueva al entrar.</small>
        </label>
        <button
          className="boton primario"
          disabled={ocupado || clave.length < 6}
          onClick={async () => {
            const h = await hashPin(u.id, clave);
            if (await cambiar((x) => void ((x.pin_hash = h), (x.temporal = true)), 'Clave temporal guardada')) setModo('ver');
          }}
        >
          Guardar clave temporal
        </button>
      </Hoja>
    );
  }
  return (
    <Hoja titulo={u.rol === 'operario' ? 'Operario' : 'Supervisor'} cerrar={cerrar}>
      <label className="campo">
        <span>Nombre y apellido</span>
        <div className="linea-h">
          <input className="entrada" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={50} />
          {nombre.trim() !== u.nombre && nombre.trim().length >= 3 && (
            <button className="boton chico" disabled={ocupado} onClick={() => cambiar((x) => void (x.nombre = nombre.trim()), 'Nombre guardado')}>
              Guardar
            </button>
          )}
        </div>
      </label>
      {u.rol === 'supervisor' && (
        <label className="campo">
          <span>Correo (con él entra y recupera su clave)</span>
          <div className="linea-h">
            <input className="entrada" type="email" inputMode="email" value={correo} onChange={(e) => setCorreo(e.target.value)} maxLength={80} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            {correo.trim().toLowerCase() !== (u.correo ?? '') && correoValido(correo) && (
              <button className="boton chico" disabled={ocupado} onClick={() => cambiar((x) => void (x.correo = correo.trim().toLowerCase()), 'Correo guardado')}>
                Guardar
              </button>
            )}
          </div>
        </label>
      )}
      {!esYo && (
        <div className="campo">
          <span className="rotulo">Estado</span>
          <div className="segmentos">
            {(Object.keys(ESTADOS) as (keyof typeof ESTADOS)[]).map((e) => (
              <button key={e} type="button" aria-pressed={u.estado === e} disabled={ocupado} onClick={() => u.estado !== e && cambiar((x) => void ((x.estado = e), (x.activo = e === 'activo')), e === 'activo' ? `${u.nombre} vuelve a estar activo` : `${u.nombre} queda ${ESTADOS[e].toLowerCase()}`)}>
                {ESTADOS[e]}
              </button>
            ))}
          </div>
          <small>
            {u.estado === 'activo' && 'Puede entrar y registrar.'}
            {u.estado === 'licencia' && 'No aparece en el ingreso ni puede registrar. Al volver, márcalo como activo: conserva su PIN y su historial.'}
            {u.estado === 'baja' && 'Ya no trabaja en el plantel. No puede entrar; sus registros anteriores se conservan. Si usaba su propio teléfono, quítalo en Ajustes, Teléfonos, y cambia la clave del plantel.'}
          </small>
        </div>
      )}
      {u.rol === 'operario' ? (
        <button className="boton" onClick={() => setModo('pin')} disabled={!u.pin_hash}>
          <KeyRound size={20} aria-hidden /> {u.pin_hash ? 'Reiniciar PIN (lo olvidó)' : 'Aún no crea su PIN'}
        </button>
      ) : (
        !esYo && (
          <button className="boton" onClick={() => setModo('clave')}>
            <KeyRound size={20} aria-hidden /> Poner clave temporal (la olvidó)
          </button>
        )
      )}
      {esYo ? (
        <p className="chico suave">Tu clave se cambia en Ajustes, Cambiar mi clave. Tu propio estado solo lo puede cambiar otro supervisor.</p>
      ) : (
        <button className="boton peligro-suave" onClick={() => setModo('borrar')}>
          <Trash2 size={20} aria-hidden /> Eliminar persona
        </button>
      )}
    </Hoja>
  );
}

// ------------------------------------------------------------------ teléfonos
function HojaClavePlantel({ actual, cerrar }: { actual: string; cerrar: () => void }) {
  const nombrePlantel = useEstado((e) => e.config?.granja.nombre ?? '');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const enviar = async () => {
    if (clave.trim().length < 6) return setError('La clave debe tener al menos 6 caracteres');
    if (claveDebil(clave, nombrePlantel)) return setError('Esa clave es muy fácil de adivinar. Elige otra');
    setError('');
    setOcupado(true);
    try {
      await administrar('clave_operarios', clave.trim());
      avisar('Clave del plantel cambiada', 'ok');
      cerrar();
    } catch (e) {
      setError(mensajeError(e));
      setOcupado(false);
    }
  };
  return (
    <Hoja titulo={actual ? 'Cambiar la clave del plantel' : 'Crear la clave del plantel'} cerrar={cerrar}>
      <label className="campo">
        <span>Clave nueva del plantel</span>
        <input className="entrada" value={clave} onChange={(e) => setClave(e.target.value)} maxLength={40} autoFocus autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <small>Mínimo 6 caracteres. No uses tu clave de supervisor.</small>
      </label>
      <p className="chico suave">Los teléfonos que ya entraron al plantel siguen funcionando igual. La clave nueva se pide solo a los teléfonos que entren desde ahora.</p>
      {error && <p className="error-texto" role="alert">{error}</p>}
      <button className="boton primario grande" disabled={ocupado} onClick={enviar}>
        {ocupado ? 'Guardando…' : 'Guardar clave'}
      </button>
    </Hoja>
  );
}

function Telefonos() {
  const config = useEstado((e) => e.config)!;
  const dispositivos = useEstado((e) => e.dispositivos);
  const propio = useEstado((e) => e.dispositivo?.id);
  const clave = useEstado((e) => e.clavePlantel);
  useEstado((e) => e.tic);
  const [quitar, setQuitar] = useState<string | null>(null);
  const [cambiar, setCambiar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const desvincular = async (id: string) => {
    setOcupado(true);
    try {
      await administrar('desvincular', id);
      avisar('Teléfono desvinculado', 'ok');
      setQuitar(null);
    } catch (e) {
      avisar(mensajeError(e), 'mal');
    } finally {
      setOcupado(false);
    }
  };
  const direccion = window.location.origin;
  const invitar = async () => {
    const texto =
      `Para registrar tus tareas en Ovo Check abre este enlace en tu teléfono:\n${direccion}/?plantel=${encodeURIComponent(config.granja.nombre)}\n\n` +
      `Toca "Soy operario". Plantel: ${config.granja.nombre}. La clave del plantel te la doy yo.`;
    try {
      if (navigator.share) await navigator.share({ text: texto });
      else window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
    } catch {
      /* la persona cerró el menú de compartir */
    }
  };
  const persona = (id: string | null) => config.usuarios.find((u) => u.id === id)?.nombre;
  const d = dispositivos.find((x) => x.id === quitar);
  return (
    <div className="pantalla">
      <Barra titulo="Teléfonos" sub="Sumar y quitar equipos del plantel" />
      <div className="contenido">
        <section className="tarjeta pila">
          <p className="fuerte">Para que un operario entre desde su teléfono</p>
          <ol className="pasos-lista">
            <li>
              Abre <b>{direccion.replace(/^https?:\/\//, '')}</b> y toca <b>Soy operario</b>.
            </li>
            <li>
              Busca el plantel por su nombre: <b>{config.granja.nombre}</b>
            </li>
            <li>Escribe la clave del plantel, elige su nombre y crea su PIN.</li>
          </ol>
          <div className="dato-clave">
            <span className="chico suave">Clave del plantel</span>
            {clave ? <b className="clave-plantel">{clave}</b> : <span className="suave">{clave === null ? 'Se muestra al conectarse con el servidor' : 'Aún no tiene'}</span>}
          </div>
          <div className="linea-h envolver">
            <button className="boton primario" onClick={invitar}>
              <Send size={20} aria-hidden /> Enviar invitación
            </button>
            <button className="boton" onClick={() => setCambiar(true)}>
              <KeyRound size={20} aria-hidden /> Cambiar la clave
            </button>
          </div>
          <p className="chico suave">La invitación lleva el enlace y el nombre del plantel, no la clave: esa dásela tú. Se escribe una sola vez en cada teléfono.</p>
        </section>
        <p className="seccion">Equipos en el plantel</p>
        <div className="lista">
          {dispositivos.length === 0 && <div className="fila suave">Se cargan al conectarse con el servidor.</div>}
          {dispositivos.map((x) => (
            <div key={x.id} className="fila">
              <span className={`medallon ${x.pendientes > 0 ? 'atencion' : ''}`}>
                <Smartphone size={24} />
              </span>
              <span className="fila-cuerpo">
                <span className="fila-titulo" style={{ display: 'block' }}>
                  {persona(x.usuario_id) ?? (x.nombre || 'Sin usar todavía')}
                  {x.id === propio && <span className="suave" style={{ fontWeight: 500 }}> (este equipo)</span>}
                </span>
                <span className="fila-detalle" style={{ display: 'block' }}>
                  {[x.nombre, `última conexión ${haceCuanto(x.visto)}`, x.pendientes > 0 && `${x.pendientes} por enviar`].filter(Boolean).join(', ')}
                </span>
              </span>
              {x.id !== propio && (
                <button className="boton chico peligro-suave" onClick={() => setQuitar(x.id)}>
                  Desvincular
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      {d && (
        <Confirmar
          titulo={`¿Desvincular ${persona(d.usuario_id) ? `el teléfono de ${persona(d.usuario_id)}` : 'este teléfono'}?`}
          texto={`Deja de poder enviar y recibir datos del plantel de inmediato.${d.pendientes > 0 ? ` Tiene ${d.pendientes} registros sin enviar: se enviarán si vuelve a entrar.` : ''} Úsalo si el teléfono se perdió o si la persona ya no trabaja aquí. Si además quieres que no pueda volver a entrar, cambia la clave del plantel.`}
          accion="Desvincular"
          peligro
          ocupado={ocupado}
          cerrar={() => setQuitar(null)}
          alConfirmar={() => desvincular(d.id)}
        />
      )}
      {cambiar && <HojaClavePlantel actual={clave ?? ''} cerrar={() => setCambiar(false)} />}
    </div>
  );
}

// ------------------------------------------------------------------ granja y diagnóstico
function Granja() {
  const config = useEstado((e) => e.config)!;
  const fotos = useEstado((e) => e.fotosNube);
  const [nombre, setNombre] = useState(config.granja.nombre);
  const { ocupado, guardar } = useGuardar();
  const [eliminar, setEliminar] = useState(false);
  return (
    <div className="pantalla">
      <Barra titulo="Plantel" />
      <div className="contenido">
        <label className="campo">
          <span>Nombre del plantel</span>
          <div className="linea-h">
            <input className="entrada" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} />
            {nombre.trim() !== config.granja.nombre && nombre.trim().length >= 3 && (
              <button className="boton chico" disabled={ocupado} onClick={() => guardar((c) => void (c.granja.nombre = nombre.trim()), 'Nombre guardado')}>
                Guardar
              </button>
            )}
          </div>
          <small>Tus operarios buscan el plantel por este nombre. Si lo cambias, avísales.</small>
        </label>
        <div className="tarjeta pila junta">
          <p className="fuerte">Fotos guardadas en la nube</p>
          {fotos ? (
            <>
              <p>
                {num(fotos.usadas)} de {num(fotos.max)} fotos
              </p>
              <div style={{ height: 10, borderRadius: 5, background: 'var(--linea-suave)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (fotos.usadas / fotos.max) * 100)}%`, background: fotos.usadas / fotos.max > 0.9 ? 'var(--mal)' : 'var(--verde)' }} />
              </div>
              <p className="chico suave" style={{ marginTop: 6 }}>
                Cada foto se conserva {fotos.dias} días y después se borra sola de la nube. Si quieres conservarlas, descárgalas antes desde Ajustes, Descargar fotos. Los números y el historial se guardan siempre.
              </p>
            </>
          ) : (
            <p className="suave">Se muestra al conectarse con el servidor.</p>
          )}
        </div>
        <button className="enlace gris" style={{ alignSelf: 'flex-start', marginTop: 'auto' }} onClick={() => setEliminar(true)}>
          Eliminar este plantel
        </button>
      </div>
      {eliminar && <HojaEliminarPlantel nombre={config.granja.nombre} cerrar={() => setEliminar(false)} />}
    </div>
  );
}

function HojaEliminarPlantel({ nombre, cerrar }: { nombre: string; cerrar: () => void }) {
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const enviar = async () => {
    setError('');
    setOcupado(true);
    try {
      await administrar('eliminar_plantel', clave);
      avisar('Plantel eliminado', 'ok');
    } catch (e) {
      setError(mensajeError(e));
      setOcupado(false);
    }
  };
  return (
    <Hoja titulo={`¿Eliminar ${nombre}?`} cerrar={cerrar}>
      <div className="tarjeta aviso-mal">
        Se borran para siempre todos los registros, fotos, personas, galpones y tareas de este plantel, en todos los teléfonos. No se puede deshacer.
      </div>
      <p className="chico suave">Si quieres conservar los datos, descárgalos antes desde Ajustes, Descargar datos.</p>
      <label className="campo">
        <span>Para confirmar, escribe tu clave de supervisor</span>
        <input className="entrada" type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </label>
      {error && <p className="error-texto" role="alert">{error}</p>}
      <button className="boton peligro grande" disabled={!clave || ocupado} onClick={enviar}>
        {ocupado ? 'Eliminando…' : 'Eliminar el plantel para siempre'}
      </button>
      <button className="boton" onClick={cerrar}>
        No eliminar
      </button>
    </Hoja>
  );
}

function Diagnostico() {
  const [pasos, setPasos] = useState<{ paso: string; ok: boolean; detalle: string }[] | null>(null);
  const correr = () => {
    setPasos(null);
    diagnostico().then(setPasos);
  };
  useEffect(correr, []);
  return (
    <div className="pantalla">
      <Barra titulo="Probar conexión" />
      <div className="contenido">
        {!pasos ? (
          <p className="suave centro">Probando…</p>
        ) : (
          <>
            <div className={`tarjeta ${pasos.every((p) => p.ok) ? 'aviso-ok' : 'aviso-atencion'}`}>
              <p className="fuerte">{pasos.every((p) => p.ok) ? 'Todo funciona' : 'Hay algo que revisar'}</p>
            </div>
            <div className="lista">
              {pasos.map((p) => (
                <div key={p.paso} className="fila compacta">
                  <span className={`medallon ${p.ok ? 'hecho' : 'atencion'}`}>{p.ok ? <Check size={24} /> : <X size={24} />}</span>
                  <span className="fila-cuerpo">
                    <span className="fila-titulo" style={{ display: 'block' }}>
                      {p.paso}
                    </span>
                    <span className="fila-detalle" style={{ display: 'block' }}>
                      {p.detalle}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <button className="boton" onClick={correr}>
              Probar de nuevo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
