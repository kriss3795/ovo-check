import { useEffect, useMemo, useState } from 'react';
import {
  Ban, Bell, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardList, Download, History, House, MapPin, Pencil,
  Settings, ShieldAlert, Smartphone, TriangleAlert, CircleX, Images,
} from 'lucide-react';
import { administrar, ahora, asegurarPeriodo, revisar, traerPeriodo } from '../lib/app';
import { avisar, cambiarRuta, ir, useEstado } from '../lib/estado';
import { armarCsv, entregarArchivo } from '../lib/exportar';
import { anotarBajada, descargarFotos, fotosDe, fotosPorVencer, nombreFoto } from '../lib/fotos';
import {
  FLAGS_CRITICOS, Indice, NOMBRE_BLOQUE, NOMBRE_FLAG, avanceGalpon, comoSeCalculo, conjuntoRevisadas, cuadreAves, decimalesIndicador, esCritico, esDudoso,
  evaluarCampo, flagsDe, indicadoresTexto, momento, relojMalo, resumen, tareasDe, vigenteEn,
} from '../lib/logica';
import { mensajeError } from '../lib/nube';
import { CATEGORIAS_PROBLEMA } from '../lib/plantillas';
import type { Config, Galpon, RegistroLocal, Tarea } from '../lib/tipos';
import { distancia, duracion, fechaCorta, fechaHora, fechaLarga, fechaRelativa, haceCuanto, hora, mayuscula, num, sumarDias } from '../lib/util';
import { AvisoServidor, Barra, Envio, Foto, Hoja, Huevo, IconoTarea, Vacio, VisorFoto } from './base';
import { Ajustes } from './ajustes';
import { TarjetaAvisos } from './avisos';
import { EtiquetaEstado, Falta, useIndice } from './operario';

const nombreRegistro = (r: RegistroLocal) =>
  r.tipo === 'problema' ? `Problema: ${CATEGORIAS_PROBLEMA.find((c) => c.id === r.categoria)?.nombre ?? 'otro'}` : (r.tarea?.nombre ?? 'Tarea');

const nombreGalpon = (config: Config, r: RegistroLocal) =>
  r.galpon_id === 'general' ? 'Plantel en general' : (config.galpones.find((g) => g.id === r.galpon_id)?.nombre ?? r.galpon_nombre ?? 'Galpón eliminado');

function usePendientes() {
  const registros = useEstado((e) => e.registros);
  const revisiones = useEstado((e) => e.revisiones);
  const indice = useIndice();
  return useMemo(() => {
    const revisadas = conjuntoRevisadas(revisiones);
    const vivos = registros.filter((r) => indice.esVigente(r));
    const orden = (a: RegistroLocal, b: RegistroLocal) => momento(b) - momento(a);
    return {
      revisadas,
      criticos: vivos.filter((r) => esCritico(r) && !revisadas.has(r.id)).sort(orden),
      dudosos: vivos.filter((r) => !esCritico(r) && esDudoso(r) && !revisadas.has(r.id)).sort(orden),
      listos: vivos.filter((r) => (esCritico(r) || esDudoso(r)) && revisadas.has(r.id)).sort(orden).slice(0, 40),
    };
  }, [registros, revisiones, indice]);
}

// ------------------------------------------------------------------ armazón con pestañas
const PESTANAS = [
  { id: 'hoy', nombre: 'Hoy', C: House },
  { id: 'alertas', nombre: 'Alertas', C: Bell },
  { id: 'historial', nombre: 'Historial', C: History },
  { id: 'ajustes', nombre: 'Ajustes', C: Settings },
] as const;

export function Supervisor({ tab }: { tab: string }) {
  const config = useEstado((e) => e.config)!;
  const usuario = useEstado((e) => e.usuario)!;
  const { criticos } = usePendientes();
  return (
    <div className="sup">
      <div className="sup-principal">
        <header className="cabecera-sup">
          <div>
            <img src="/marca.webp" alt="" width={38} height={38} />
            <div className="barra-titulo">
              <h1>{config.granja.nombre}</h1>
              <p>{usuario.nombre}, supervisión</p>
            </div>
            <Envio />
          </div>
        </header>
        <main className="sup-cuerpo">
          {tab === 'hoy' && <Hoy />}
          {tab === 'alertas' && <Alertas />}
          {tab === 'historial' && <Historial />}
          {tab === 'ajustes' && <Ajustes />}
        </main>
      </div>
      <nav className="pestanas" aria-label="Secciones">
        <div className="marca-linea">
          <img src="/marca.webp" alt="" />
          <b style={{ fontSize: 19 }}>Ovo Check</b>
        </div>
        {PESTANAS.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => (cambiarRuta({ tab: t.id }), window.scrollTo(0, 0))}>
            <t.C size={24} aria-hidden />
            {t.nombre}
            {t.id === 'alertas' && criticos.length > 0 && <span className="globo">{criticos.length}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ------------------------------------------------------------------ hoy
function TarjetaGalpon({ g, fecha, indice, revisadas }: { g: Galpon; fecha: string; indice: Indice; revisadas: Set<string> }) {
  const config = useEstado((e) => e.config)!;
  const hoy = useEstado((e) => e.hoy);
  const a = avanceGalpon(config, indice, revisadas, g.id, fecha, ahora(), hoy);
  const encargados = (g.encargados ?? []).map((id) => config.usuarios.find((u) => u.id === id && u.activo)?.nombre.split(' ')[0]).filter(Boolean);
  const detalle: string[] = [a.total ? `${a.hechas} de ${a.total} tareas` : 'Sin tareas'];
  if (a.alertas) detalle.push(`${a.alertas} ${a.alertas === 1 ? 'alerta' : 'alertas'}`);
  else if (a.atrasadas.length && fecha === hoy) detalle.push(`${a.atrasadas.length} ${a.atrasadas.length === 1 ? 'atrasada' : 'atrasadas'}`);
  else if (a.atrasadas.length) detalle.push(`${a.atrasadas.length} sin registrar`);
  return (
    <button className={`galpon-tarjeta ${a.estado}`} onClick={() => ir({ p: 'galpondia', id: g.id, fecha })}>
      <Huevo fraccion={a.total ? a.hechas / a.total : 0} estado={a.estado} />
      <span className="crece">
        <span className="linea-h entre">
          <span className="fila-titulo" style={{ fontSize: 19 }}>
            {g.nombre}
          </span>
          <EtiquetaEstado estado={fecha < hoy ? (a.estado === 'atrasado' ? (a.hechas > 0 ? 'incompleto' : 'sin_registros') : a.estado === 'sin_tareas' ? 'sin_tareas_dia' : a.estado) : a.estado} />
        </span>
        <span className="fila-detalle" style={{ display: 'block' }}>
          {detalle.join(', ')}
        </span>
        <span className="fila-detalle" style={{ display: 'block' }}>
          {a.ultimo ? `Último registro ${fecha === hoy ? haceCuanto(momento(a.ultimo)) : `a las ${hora(momento(a.ultimo))}`}` : 'Sin registros'}
          {encargados.length > 0 && `. A cargo de ${encargados.join(' y ')}`}
        </span>
      </span>
    </button>
  );
}

const PASOS_INICIO = [
  { id: 'personas', texto: 'Agrega a tus operarios', destino: 'personas' },
  { id: 'aves', texto: 'Anota las aves y los encargados de cada galpón', destino: 'galpones' },
  { id: 'tareas', texto: 'Revisa las tareas del día', destino: 'tareas' },
  { id: 'telefonos', texto: 'Suma los teléfonos de tus operarios', destino: 'telefonos' },
];

export function marcarPaso(id: string) {
  try {
    const v = JSON.parse(localStorage.getItem('oc_pasos') ?? '{}');
    v[id] = true;
    localStorage.setItem('oc_pasos', JSON.stringify(v));
  } catch {
    /* sin almacenamiento */
  }
}

function PrimerosPasos() {
  const config = useEstado((e) => e.config)!;
  const dispositivos = useEstado((e) => e.dispositivos);
  const [oculto, setOculto] = useState(() => localStorage.getItem('oc_pasos_oculto') === config.granja.id);
  const vistos = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('oc_pasos') ?? '{}') as Record<string, boolean>;
    } catch {
      return {};
    }
  }, []);
  const listo: Record<string, boolean> = {
    aves: config.galpones.filter((g) => g.activo).every((g) => g.aves && (g.encargados ?? []).length > 0),
    personas: config.usuarios.some((u) => u.rol === 'operario'),
    tareas: Boolean(vistos.tareas),
    telefonos: dispositivos.length > 1,
  };
  if (oculto || PASOS_INICIO.every((p) => listo[p.id])) return null;
  return (
    <section className="tarjeta">
      <div className="linea-h entre">
        <h2 className="subtitulo">Para dejar el plantel listo</h2>
        <button
          className="enlace gris chico"
          onClick={() => {
            localStorage.setItem('oc_pasos_oculto', config.granja.id);
            setOculto(true);
          }}
        >
          Ocultar
        </button>
      </div>
      <div className="pasos">
        {PASOS_INICIO.map((p) => (
          <button key={p.id} className={`paso${listo[p.id] ? ' listo' : ''}`} onClick={() => ir({ p: 'ajuste', cual: p.destino })}>
            <span className="crece fuerte" style={listo[p.id] ? { color: 'var(--gris)', fontWeight: 500 } : undefined}>
              {p.texto}
            </span>
            <ChevronRight className="flecha" color="var(--gris-claro)" aria-hidden />
          </button>
        ))}
      </div>
      <p className="chico suave" style={{ marginTop: 8 }}>
        Ten presente: las fotos se guardan 30 días en la nube y después se borran solas. Para conservarlas, descárgalas desde Historial. Los números se guardan siempre.
      </p>
    </section>
  );
}

/**
 * Vigilancia del plantel: cada equipo nuevo que entra queda a la vista hasta que un supervisor dice que lo conoce,
 * y se avisa si alguien está probando claves del plantel.
 */
function TarjetaSeguridad() {
  const config = useEstado((e) => e.config)!;
  const dispositivos = useEstado((e) => e.dispositivos);
  const propio = useEstado((e) => e.dispositivo?.id);
  const intentos = useEstado((e) => e.intentosFallidos);
  const [ocupado, setOcupado] = useState('');
  const nuevos = dispositivos.filter((d) => d.reconocido === false && d.id !== propio);
  if (!nuevos.length && intentos < 5) return null;
  const persona = (id: string | null) => config.usuarios.find((u) => u.id === id)?.nombre;
  const hacer = async (accion: 'reconocer' | 'desvincular', id: string) => {
    setOcupado(id || 'todos');
    try {
      await administrar(accion, id || undefined);
      avisar(accion === 'desvincular' ? 'Equipo desvinculado' : id ? 'Equipo reconocido' : 'Equipos reconocidos', 'ok');
    } catch (e) {
      avisar(mensajeError(e), 'mal');
    } finally {
      setOcupado('');
    }
  };
  return (
    <section className="tarjeta aviso-atencion pila">
      <div className="linea-h">
        <ShieldAlert size={24} aria-hidden style={{ flex: 'none', color: 'var(--atencion)' }} />
        <h2 className="subtitulo">Seguridad del plantel</h2>
      </div>
      {nuevos.map((d) => (
        <div key={d.id} className="pila junta">
          <p>
            <b>{persona(d.usuario_id) ?? 'Alguien'}</b> entró con un equipo nuevo ({d.nombre || 'sin nombre'}), {haceCuanto(d.creado ?? null)}.
          </p>
          <div className="linea-h envolver">
            <button className="boton chico" disabled={ocupado === d.id} onClick={() => hacer('reconocer', d.id)}>
              <Check size={18} aria-hidden /> Lo conozco
            </button>
            <button className="boton chico peligro-suave" disabled={ocupado === d.id} onClick={() => hacer('desvincular', d.id)}>
              No lo conozco: desvincular
            </button>
          </div>
        </div>
      ))}
      {nuevos.length > 1 && (
        <button className="enlace" style={{ alignSelf: 'flex-start' }} disabled={Boolean(ocupado)} onClick={() => hacer('reconocer', '')}>
          Los conozco a todos
        </button>
      )}
      {intentos >= 5 && (
        <div className="pila junta">
          <p>
            En las últimas 24 horas alguien escribió mal la clave del plantel <b>{intentos} veces</b>. Si no fueron tus operarios, cambia la clave.
          </p>
          <button className="boton chico" style={{ alignSelf: 'flex-start' }} onClick={() => ir({ p: 'ajuste', cual: 'telefonos' })}>
            Cambiar la clave del plantel
          </button>
        </div>
      )}
    </section>
  );
}

function Hoy() {
  const config = useEstado((e) => e.config)!;
  const hoy = useEstado((e) => e.hoy);
  const dispositivos = useEstado((e) => e.dispositivos);
  const fotos = useEstado((e) => e.fotosNube);
  useEstado((e) => e.tic);
  const indice = useIndice();
  const { revisadas, criticos } = usePendientes();
  const galpones = config.galpones.filter((g) => g.activo);
  const avances = galpones.map((g) => avanceGalpon(config, indice, revisadas, g.id, hoy, ahora(), hoy));
  const total = avances.reduce((n, a) => n + a.total, 0);
  const hechas = avances.reduce((n, a) => n + a.hechas, 0);
  const atrasadas = avances.reduce((n, a) => n + a.atrasadas.length, 0);
  const registros = useEstado((e) => e.registros);
  const vista: 'galpon' | 'persona' = useEstado((e) => e.ruta[e.ruta.length - 1]?.vista ?? 'galpon');
  const [bajarFotos, setBajarFotos] = useState(false);
  const diasFotos = fotos?.dias ?? 30;
  // Fotos que la nube borrará durante los próximos 7 días y que no se han descargado en este equipo.
  const porVencer = useMemo(
    () => fotosPorVencer(config.granja.id, registros, sumarDias(hoy, -(diasFotos - 7)), sumarDias(hoy, -diasFotos)),
    [config.granja.id, registros, hoy, diasFotos, bajarFotos],
  );
  const personaDe = (id: string | null) => config.usuarios.find((u) => u.id === id);
  const conProblema = dispositivos.filter((d) => {
    if (!d.visto) return false;
    const horas = (Date.now() - new Date(d.visto).getTime()) / 3600000;
    if (horas >= 24 * 14) return false;
    // Con datos sin enviar: basta un rato sin conexión. Sin pendientes conocidos: solo los teléfonos de operarios
    // activos que llevan más de un día y medio sin conectarse (pueden estar trabajando sin señal).
    const u = personaDe(d.usuario_id);
    return d.pendientes > 0 ? horas > 0.25 : horas > 36 && u?.rol === 'operario' && u.activo;
  });

  return (
    <>
      <div className="linea-h entre envolver">
        <h2 className="titulo">{mayuscula(fechaLarga(hoy))}</h2>
        <button className="boton chico" onClick={() => ir({ p: 'ronda' })}>
          <ClipboardList size={20} aria-hidden /> Hacer una ronda
        </button>
      </div>
      <AvisoServidor />
      <TarjetaAvisos />
      <TarjetaSeguridad />
      <PrimerosPasos />
      {fotos && (fotos.lleno || fotos.usadas >= fotos.max * 0.9) && (
        <div className="tarjeta aviso-atencion">
          <p className="fuerte">{fotos.lleno || fotos.usadas >= fotos.max ? 'El espacio para fotos está lleno' : 'Queda poco espacio para fotos'}</p>
          <p className="chico">
            {!fotos.lleno || fotos.usadas >= fotos.max * 0.9 ? `Hay ${num(fotos.usadas)} de ${num(fotos.max)} fotos guardadas. ` : ''}
            Los números siguen llegando con normalidad; las fotos nuevas esperan en cada teléfono hasta que se libere espacio (cada foto se borra
            sola a los {fotos.dias} días).
          </p>
        </div>
      )}
      {porVencer.cantidad > 0 && (
        <div className="tarjeta aviso-atencion">
          <p className="fuerte">
            {porVencer.cantidad} {porVencer.cantidad === 1 ? 'foto se borra' : 'fotos se borran'} de la nube esta semana
          </p>
          <p className="chico">
            Son las del {fechaLarga(porVencer.hasta)} hacia atrás. La nube guarda cada foto {diasFotos} días: descárgalas a este equipo si quieres conservarlas. Los números no se borran.
          </p>
          <button className="boton chico" style={{ marginTop: 10 }} onClick={() => setBajarFotos(true)}>
            <Images size={20} aria-hidden /> Descargar fotos
          </button>
        </div>
      )}
      {bajarFotos && <HojaFotos cerrar={() => setBajarFotos(false)} />}
      <div className="cifras">
        <div>
          <b>
            {hechas}
            <span style={{ fontSize: 18, fontWeight: 500 }}> de {total}</span>
          </b>
          <span>tareas hechas</span>
        </div>
        <button className={criticos.length ? 'mal' : ''} onClick={() => cambiarRuta({ tab: 'alertas' })} style={{ textAlign: 'center' }}>
          <b>{criticos.length}</b>
          <span>{criticos.length === 1 ? 'alerta por revisar' : 'alertas por revisar'}</span>
        </button>
        <div>
          <b>{atrasadas}</b>
          <span>{atrasadas === 1 ? 'tarea atrasada' : 'tareas atrasadas'}</span>
        </div>
      </div>
      <div className="segmentos">
        <button aria-pressed={vista === 'galpon'} onClick={() => cambiarRuta({ vista: 'galpon' })}>
          Por galpón
        </button>
        <button aria-pressed={vista === 'persona'} onClick={() => cambiarRuta({ vista: 'persona' })}>
          Por persona
        </button>
      </div>
      {vista === 'persona' ? (
        <VistaPersonas indice={indice} revisadas={revisadas} />
      ) : galpones.length === 0 ? (
        <Vacio titulo="No hay galpones en producción">
          <button className="boton chico" onClick={() => ir({ p: 'ajuste', cual: 'galpones' })}>
            Agregar galpones
          </button>
        </Vacio>
      ) : (
        <div className="rejilla">
          {galpones.map((g) => (
            <TarjetaGalpon key={g.id} g={g} fecha={hoy} indice={indice} revisadas={revisadas} />
          ))}
        </div>
      )}
      {conProblema.length > 0 && (
        <section className="pila">
          <p className="seccion" style={{ marginBottom: 0 }}>
            Teléfonos que requieren atención
          </p>
          <div className="lista">
            {conProblema.map((d) => (
              <button key={d.id} className="fila compacta" onClick={() => ir({ p: 'ajuste', cual: 'telefonos' })}>
                <span className="medallon atencion">
                  <Smartphone size={22} />
                </span>
                <span className="fila-cuerpo">
                  <span className="fila-titulo" style={{ display: 'block' }}>
                    {personaDe(d.usuario_id)?.nombre ?? (d.nombre || 'Teléfono')}
                  </span>
                  <span className="fila-detalle" style={{ display: 'block' }}>
                    {personaDe(d.usuario_id) && d.nombre ? `${d.nombre}. ` : ''}Última conexión {haceCuanto(d.visto)}
                    {d.pendientes > 0 && `, ${d.pendientes} por enviar`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ------------------------------------------------------------------ avance por persona
/** Lo que lleva y lo que le falta a una persona hoy, según los galpones que tiene a cargo. */
function avanceDePersona(config: Config, indice: Indice, revisadas: Set<string>, usuarioId: string, hoy: string, registros: RegistroLocal[]) {
  const galpones = config.galpones.filter((g) => g.activo && (g.encargados ?? []).includes(usuarioId));
  const avances = galpones.map((g) => ({ g, a: avanceGalpon(config, indice, revisadas, g.id, hoy, ahora(), hoy) }));
  const propios = registros.filter((r) => r.fecha === hoy && r.usuario_id === usuarioId && indice.esVigente(r)).sort((a, b) => momento(b) - momento(a));
  return {
    galpones,
    avances,
    propios,
    total: avances.reduce((n, x) => n + x.a.total, 0),
    hechas: avances.reduce((n, x) => n + x.a.hechas, 0),
    atrasadas: avances.reduce((n, x) => n + x.a.atrasadas.length, 0),
  };
}

function VistaPersonas({ indice, revisadas }: { indice: Indice; revisadas: Set<string> }) {
  const config = useEstado((e) => e.config)!;
  const hoy = useEstado((e) => e.hoy);
  const registros = useEstado((e) => e.registros);
  const conRegistros = new Set(registros.filter((r) => r.fecha === hoy).map((r) => r.usuario_id));
  // Operarios activos, y cualquier otra persona que haya registrado hoy (por ejemplo un supervisor en una ronda).
  const personas = config.usuarios
    .filter((u) => (u.rol === 'operario' && u.activo) || conRegistros.has(u.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const sinEncargado = config.galpones.filter((g) => g.activo && !(g.encargados ?? []).some((id) => config.usuarios.some((u) => u.id === id && u.activo)));
  if (!personas.length) {
    return (
      <Vacio titulo="Aún no hay operarios">
        <button className="boton chico" onClick={() => ir({ p: 'ajuste', cual: 'personas' })}>
          Agregar personas
        </button>
      </Vacio>
    );
  }
  return (
    <>
      <div className="lista">
        {personas.map((u) => {
          const p = avanceDePersona(config, indice, revisadas, u.id, hoy, registros);
          const completo = p.total > 0 && p.hechas === p.total;
          return (
            <button key={u.id} className="fila" onClick={() => ir({ p: 'personadia', id: u.id })}>
              <Huevo fraccion={p.total ? p.hechas / p.total : 0} size={46} />
              <span className="fila-cuerpo">
                <span className="fila-titulo" style={{ display: 'block' }}>
                  {u.nombre}
                </span>
                <span className="fila-detalle valor" style={{ display: 'block' }}>
                  {p.galpones.length ? `${p.hechas} de ${p.total} tareas en ${p.galpones.map((g) => g.nombre).join(', ')}` : 'Sin galpones a cargo'}
                </span>
                <span className="fila-detalle" style={{ display: 'block' }}>
                  {p.propios.length ? `${p.propios.length} ${p.propios.length === 1 ? 'registro' : 'registros'} hoy, el último a las ${hora(momento(p.propios[0]))}` : 'Sin registros hoy'}
                </span>
              </span>
              {p.atrasadas > 0 ? (
                <span className="etiqueta atencion">
                  {p.atrasadas} {p.atrasadas === 1 ? 'atrasada' : 'atrasadas'}
                </span>
              ) : completo ? (
                <span className="etiqueta ok">Completo</span>
              ) : null}
              <ChevronRight className="flecha" aria-hidden />
            </button>
          );
        })}
      </div>
      {sinEncargado.length > 0 && (
        <div className="tarjeta aviso-info">
          <p className="fuerte">
            {sinEncargado.length === 1 ? `${sinEncargado[0].nombre} no tiene encargado` : `${sinEncargado.length} galpones no tienen encargado`}
          </p>
          <p className="chico">Asigna a cada galpón sus operarios para ver aquí lo que le falta a cada uno y para que los recordatorios lleguen a quien corresponde.</p>
          <button className="boton chico" style={{ marginTop: 10 }} onClick={() => ir({ p: 'ajuste', cual: 'galpones' })}>
            Asignar encargados
          </button>
        </div>
      )}
    </>
  );
}

/** Detalle de una persona en el día: lo que le falta en sus galpones y todo lo que registró. */
export function PersonaDia({ id }: { id: string }) {
  const config = useEstado((e) => e.config)!;
  const hoy = useEstado((e) => e.hoy);
  const registros = useEstado((e) => e.registros);
  useEstado((e) => e.tic);
  const indice = useIndice();
  const { revisadas } = usePendientes();
  const u = config.usuarios.find((x) => x.id === id);
  if (!u) return <Falta />;
  const p = avanceDePersona(config, indice, revisadas, id, hoy, registros);
  return (
    <div className="pantalla">
      <Barra titulo={u.nombre} sub={`Hoy, ${fechaLarga(hoy)}`} derecha={<Envio />} />
      <div className="contenido">
        {p.galpones.length === 0 ? (
          <div className="tarjeta aviso-info">
            <p className="fuerte">No tiene galpones a cargo</p>
            <p className="chico">Para ver lo que le falta, asígnale galpones en Ajustes, Galpones. Abajo aparece lo que ha registrado hoy.</p>
          </div>
        ) : (
          p.avances.map(({ g, a }) => (
            <section key={g.id} className="pila">
              <button className={`galpon-tarjeta ${a.estado}`} onClick={() => ir({ p: 'galpondia', id: g.id, fecha: hoy })}>
                <Huevo fraccion={a.total ? a.hechas / a.total : 0} estado={a.estado} size={46} />
                <span className="crece">
                  <span className="fila-titulo" style={{ display: 'block', fontSize: 19 }}>
                    {g.nombre}
                  </span>
                  <span className="fila-detalle" style={{ display: 'block' }}>
                    {a.hechas} de {a.total} tareas{a.pendientes.length ? `, ${a.pendientes.length === 1 ? 'falta 1' : `faltan ${a.pendientes.length}`}` : ''}
                  </span>
                </span>
                <ChevronRight className="flecha" color="var(--gris-claro)" aria-hidden />
              </button>
              {a.pendientes.length > 0 && (
                <div className="lista">
                  {a.pendientes.map((t) => (
                    <div key={t.id} className="fila compacta">
                      <span className="medallon">
                        <IconoTarea nombre={t.icono} size={22} />
                      </span>
                      <span className="fila-cuerpo">
                        <span className="fila-titulo" style={{ display: 'block', fontWeight: 600 }}>
                          {t.nombre}
                        </span>
                        <span className="fila-detalle" style={{ display: 'block' }}>
                          {NOMBRE_BLOQUE[t.bloque]}
                        </span>
                      </span>
                      <span className={`etiqueta ${a.atrasadas.includes(t) ? 'atencion' : ''}`}>{a.atrasadas.includes(t) ? 'Atrasada' : 'Pendiente'}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))
        )}
        <p className="seccion">Registró hoy</p>
        {p.propios.length ? (
          <div className="lista">
            {p.propios.map((r) => (
              <FilaRegistro key={r.id} r={r} conFecha={false} />
            ))}
          </div>
        ) : (
          <div className="tarjeta suave">Aún no registra nada hoy.</div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ alertas
function FilaRegistro({ r, conGalpon = true, conFecha = true }: { r: RegistroLocal; conGalpon?: boolean; conFecha?: boolean }) {
  const config = useEstado((e) => e.config)!;
  const critico = esCritico(r);
  const flags = flagsDe(r);
  const ind = indicadoresTexto(r);
  return (
    <button className="fila" onClick={() => ir({ p: 'registro', id: r.id })}>
      <span className={`medallon ${critico ? 'mal' : esDudoso(r) ? 'atencion' : 'hecho'}`}>
        {r.tipo === 'problema' || r.ok === false ? <TriangleAlert size={24} /> : r.omitida ? <Ban size={24} /> : <IconoTarea nombre={r.tarea?.icono ?? 'general'} size={24} />}
      </span>
      <span className="fila-cuerpo">
        <span className="fila-titulo" style={{ display: 'block' }}>
          {nombreRegistro(r)}
        </span>
        <span className="fila-detalle valor" style={{ display: 'block' }}>
          {resumen(r)}
          {ind && <span className="suave"> ({ind})</span>}
        </span>
        <span className="fila-detalle" style={{ display: 'block' }}>
          {[conGalpon && nombreGalpon(config, r), conFecha ? `${fechaRelativa(r.fecha)} ${hora(momento(r))}` : hora(momento(r))].filter(Boolean).join(', ')}
        </span>
        {flags.length > 0 && (
          <span className="etiquetas" style={{ marginTop: 6 }}>
            {flags.map((f) => (
              <span key={f} className={`etiqueta ${(FLAGS_CRITICOS as string[]).includes(f) ? 'mal' : 'atencion'}`}>
                {NOMBRE_FLAG[f]}
              </span>
            ))}
          </span>
        )}
      </span>
      {r.fotos[0] && <Foto id={r.fotos[0].id} clase="chica" />}
      <ChevronRight className="flecha" aria-hidden />
    </button>
  );
}

function Alertas() {
  const { criticos, dudosos, listos } = usePendientes();
  const [ver, setVer] = useState<'pendientes' | 'revisadas'>('pendientes');
  const [ocupado, setOcupado] = useState(false);
  const revisarTodas = async () => {
    setOcupado(true);
    for (const r of dudosos) await revisar(r.id, '');
    setOcupado(false);
    avisar('Marcadas como revisadas', 'ok');
  };
  return (
    <>
      <h2 className="titulo">Alertas</h2>
      <div className="segmentos">
        <button aria-pressed={ver === 'pendientes'} onClick={() => setVer('pendientes')}>
          Por revisar ({criticos.length + dudosos.length})
        </button>
        <button aria-pressed={ver === 'revisadas'} onClick={() => setVer('revisadas')}>
          Revisadas
        </button>
      </div>
      {ver === 'pendientes' ? (
        <>
          {criticos.length === 0 && dudosos.length === 0 && (
            <Vacio titulo="Nada por revisar" icono={<Check size={40} color="var(--verde)" aria-hidden />}>
              <p>Aquí aparecen los problemas que informan los operarios, las lecturas de medidor menores que la anterior y las aves vivas que no calzan.</p>
            </Vacio>
          )}
          {criticos.length > 0 && (
            <section className="pila">
              <p className="seccion" style={{ marginBottom: 0 }}>
                Requieren atención
              </p>
              <div className="lista">
                {criticos.map((r) => (
                  <FilaRegistro key={r.id} r={r} />
                ))}
              </div>
            </section>
          )}
          {dudosos.length > 0 && (
            <section className="pila">
              <div className="linea-h entre">
                <p className="seccion" style={{ margin: 0 }}>
                  Registros para verificar
                </p>
                <button className="enlace chico" onClick={revisarTodas} disabled={ocupado}>
                  Marcar todos como revisados
                </button>
              </div>
              <div className="lista">
                {dudosos.map((r) => (
                  <FilaRegistro key={r.id} r={r} />
                ))}
              </div>
            </section>
          )}
        </>
      ) : listos.length ? (
        <div className="lista">
          {listos.map((r) => (
            <FilaRegistro key={r.id} r={r} />
          ))}
        </div>
      ) : (
        <Vacio titulo="Aún no hay alertas revisadas" />
      )}
    </>
  );
}

// ------------------------------------------------------------------ historial
function NavFecha({ fecha, alCambiar }: { fecha: string; alCambiar: (f: string) => void }) {
  const hoy = useEstado((e) => e.hoy);
  return (
    <div className="fecha-nav">
      <button className="icono-boton" onClick={() => alCambiar(sumarDias(fecha, -1))} aria-label="Día anterior">
        <ChevronLeft size={26} />
      </button>
      <label className="centro">
        <span className="linea-h">
          <CalendarDays size={20} aria-hidden /> {fecha === hoy ? `Hoy, ${fechaLarga(fecha)}` : mayuscula(fechaLarga(fecha))}
        </span>
        <input type="date" value={fecha} max={hoy} onChange={(e) => e.target.value && alCambiar(e.target.value)} aria-label="Elegir fecha" />
      </label>
      <button className="icono-boton" onClick={() => alCambiar(sumarDias(fecha, 1))} disabled={fecha >= hoy} aria-label="Día siguiente" style={fecha >= hoy ? { opacity: 0.3 } : undefined}>
        <ChevronRight size={26} />
      </button>
    </div>
  );
}

/** Carga del servidor los días antiguos cuando se piden. */
function usePeriodo(desde: string) {
  const [estado, setEstado] = useState<'listo' | 'cargando' | 'error'>('listo');
  const [error, setError] = useState('');
  useEffect(() => {
    let vivo = true;
    setEstado('cargando');
    asegurarPeriodo(desde)
      .then(() => vivo && setEstado('listo'))
      .catch((e) => {
        if (!vivo) return;
        setError(mensajeError(e));
        setEstado('error');
      });
    return () => {
      vivo = false;
    };
  }, [desde]);
  return { estado, error };
}

function Historial() {
  const config = useEstado((e) => e.config)!;
  const hoy = useEstado((e) => e.hoy);
  const ruta = useEstado((e) => e.ruta[e.ruta.length - 1]);
  const modo: 'dia' | 'resumen' = ruta.modo ?? 'dia';
  const fecha: string = ruta.fecha ?? sumarDias(hoy, -1);
  const [exportar, setExportar] = useState(false);
  const [fotos, setFotos] = useState(false);
  return (
    <>
      <div className="linea-h entre envolver">
        <h2 className="titulo">Historial</h2>
        <div className="linea-h envolver">
          <button className="boton chico" onClick={() => setExportar(true)}>
            <Download size={20} aria-hidden /> Datos
          </button>
          <button className="boton chico" onClick={() => setFotos(true)}>
            <Images size={20} aria-hidden /> Fotos
          </button>
        </div>
      </div>
      <div className="segmentos">
        <button aria-pressed={modo === 'dia'} onClick={() => cambiarRuta({ modo: 'dia' })}>
          Por día
        </button>
        <button aria-pressed={modo === 'resumen'} onClick={() => cambiarRuta({ modo: 'resumen' })}>
          Resumen por tarea
        </button>
      </div>
      {modo === 'dia' ? <HistorialDia config={config} fecha={fecha} /> : <ResumenTarea />}
      {exportar && <HojaExportar cerrar={() => setExportar(false)} />}
      {fotos && <HojaFotos cerrar={() => setFotos(false)} />}
    </>
  );
}

function HistorialDia({ config, fecha }: { config: Config; fecha: string }) {
  const indice = useIndice();
  const { revisadas } = usePendientes();
  const carga = usePeriodo(fecha);
  // Los galpones que estaban en producción ese día (uno que hoy descansa sigue apareciendo en sus días anteriores).
  const galpones = config.galpones.filter((g) => vigenteEn(g, fecha));
  return (
    <>
      <NavFecha fecha={fecha} alCambiar={(f) => cambiarRuta({ fecha: f })} />
      {carga.estado === 'cargando' && <p className="suave centro">Cargando ese día…</p>}
      {carga.estado === 'error' && <div className="tarjeta aviso-atencion">No se pudo cargar ese día. {carga.error}</div>}
      {carga.estado === 'listo' && galpones.length === 0 && (
        <Vacio titulo="Sin galpones en producción ese día">
          <p>Ese día el plantel todavía no estaba en la app, o sus galpones estaban en descanso.</p>
        </Vacio>
      )}
      {carga.estado === 'listo' && galpones.length > 0 && (
        <div className="rejilla">
          {galpones.map((g) => (
            <TarjetaGalpon key={g.id} g={g} fecha={fecha} indice={indice} revisadas={revisadas} />
          ))}
        </div>
      )}
    </>
  );
}

/** Para el supervisor: de dónde sale cada número calculado, para que lo pueda comprobar. */
function ComoSeCalculo({ reg, galpon }: { reg: RegistroLocal; galpon: Galpon | undefined }) {
  const indice = useIndice();
  const lineas = comoSeCalculo(indice, reg, galpon);
  if (!lineas.length) return null;
  return (
    <div className="calculo">
      <p className="chico fuerte">Cómo se calculó</p>
      {lineas.map((l, k) => (
        <p key={k} className="chico">
          {mayuscula(l)}
        </p>
      ))}
    </div>
  );
}

/** Para el supervisor: si las aves vivas anotadas calzan con las de la vez anterior menos las muertas de este registro. */
function CuadreAves({ reg }: { reg: RegistroLocal }) {
  const indice = useIndice();
  const cuadre = cuadreAves(reg.tarea?.campos ?? [], reg.valores, indice.anterior(reg.fecha, reg.galpon_id, reg.tarea_id ?? ''));
  const marcado = reg.flags.includes('no_calza');
  if (!cuadre) {
    return marcado ? <p className="chico">Al registrar, las aves vivas no calzaban con el registro anterior.</p> : null;
  }
  const d = cuadre.diferencia;
  const antes = `${fechaRelativa(cuadre.fechaAntes)} se anotaron ${num(cuadre.antes)} aves vivas`;
  if (d === 0) {
    return <p className="chico suave">{marcado ? `Al registrar no calzaba; con la corrección posterior ahora calza (${antes.toLowerCase()}).` : `Calza: ${antes.toLowerCase()}.`}</p>;
  }
  return (
    <p className="chico fuerte" style={{ color: 'var(--mal)' }}>
      No calza. {antes}; con {num(cuadre.bajas)} {cuadre.bajas === 1 ? 'muerta' : 'muertas'} debían quedar {num(cuadre.esperado)} y se anotaron{' '}
      {num(cuadre.anotado)}: {d < 0 ? `faltan ${num(-d)}` : `sobran ${num(d)}`}.
    </p>
  );
}

function ResumenTarea() {
  const config = useEstado((e) => e.config)!;
  const hoy = useEstado((e) => e.hoy);
  const indice = useIndice();
  const opciones = useMemo(() => {
    const o: { clave: string; tarea: Tarea; i: number; nombre: string }[] = [];
    for (const t of config.tareas) {
      if (t.tipo !== 'numero' && t.tipo !== 'contador') continue;
      t.campos.forEach((c, i) => o.push({ clave: `${t.id}|${i}`, tarea: t, i, nombre: t.campos.length > 1 ? `${t.nombre}: ${c.etiqueta}` : t.nombre }));
    }
    return o;
  }, [config]);
  const ruta = useEstado((e) => e.ruta[e.ruta.length - 1]);
  const clave: string = ruta.rt ?? opciones[0]?.clave ?? '';
  const dias: number = ruta.rd ?? 14;
  const setClave = (v: string) => cambiarRuta({ rt: v });
  const setDias = (v: number) => cambiarRuta({ rd: v });
  const desde = sumarDias(hoy, -(dias - 1));
  const carga = usePeriodo(desde);
  const op = opciones.find((o) => o.clave === clave) ?? opciones[0];
  if (!op) return <Vacio titulo="No hay tareas con números">Agrega una tarea de tipo número o contador en Ajustes.</Vacio>;
  const c = op.tarea.campos[op.i];
  const galpones = config.galpones.filter((g) => g.activo && (op.tarea.galpones === null || op.tarea.galpones.includes(g.id)));
  const fechas = Array.from({ length: dias }, (_, k) => sumarDias(hoy, -k));
  const conIndicador = c.calculo !== 'valor';
  const unidad = conIndicador ? c.indicador : c.acumulativo ? `${c.unidad} al día` : c.unidad;
  const dec = (x: number) => (conIndicador ? decimalesIndicador(c, x) : c.decimales);

  const celda = (g: Galpon, f: string) => {
    const r = indice.vigente(f, g.id, op.tarea.id);
    if (!r) return { texto: '', mal: false, id: null as string | null };
    if (r.omitida) return { texto: 'No se hizo', mal: false, id: r.id };
    const v = r.valores[op.i];
    let x: number | null | undefined = v;
    if (c.acumulativo) {
      // Medidor: se recalcula con la lectura anterior vigente, así una corrección de ayer arregla también el consumo de hoy.
      const prev = indice.anterior(f, g.id, op.tarea.id);
      const ev = evaluarCampo(c, v, r.aves !== undefined ? { ...g, aves: r.aves } : g, prev && prev.valores[op.i] != null ? { valor: prev.valores[op.i]!, fecha: prev.fecha } : null, f);
      // Registros anteriores a esta versión no guardaban las aves del día: se usa el indicador que se calculó entonces.
      x = !conIndicador ? ev.base : r.aves === undefined && r.indicadores?.[op.i] != null ? r.indicadores[op.i] : ev.indicador;
    } else if (conIndicador) x = r.indicadores?.[op.i];
    // Aves vivas: en rojo el día en que no calzan con las del registro anterior menos las muertas anotadas.
    const cuadre = c.saldo ? cuadreAves(r.tarea?.campos ?? [], r.valores, indice.anterior(f, g.id, op.tarea.id)) : null;
    return { texto: x === null || x === undefined ? '' : num(x, dec(x)), mal: Boolean(cuadre && cuadre.diferencia !== 0), id: r.id };
  };

  return (
    <>
      <div className="pila">
        <label className="campo">
          <span className="oculto-visual">Tarea</span>
          <select className="entrada" value={op.clave} onChange={(e) => setClave(e.target.value)}>
            {opciones.map((o) => (
              <option key={o.clave} value={o.clave}>
                {o.nombre}
              </option>
            ))}
          </select>
        </label>
        <div className="segmentos">
          {[7, 14, 30].map((d) => (
            <button key={d} aria-pressed={dias === d} onClick={() => setDias(d)}>
              {d} días
            </button>
          ))}
        </div>
      </div>
      <p className="suave chico">
        Valores en {unidad}. Toca un valor para ver su respaldo y cómo se calculó. La raya indica que ese día no hubo registro.
        {conIndicador && ' Los valores por ave usan las últimas aves vivas anotadas o, si no hay, las de la ficha del galpón.'}
      </p>
      {carga.estado === 'cargando' && <p className="suave centro">Cargando…</p>}
      {carga.estado === 'error' && <div className="tarjeta aviso-atencion">No se pudo cargar el período. {carga.error}</div>}
      <div className="tabla-wrap">
        <table className="datos">
          <thead>
            <tr>
              <th>Fecha</th>
              {galpones.map((g) => (
                <th key={g.id}>{g.nombre}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fechas.map((f) => (
              <tr key={f}>
                <td>{f === hoy ? 'Hoy' : fechaCorta(f)}</td>
                {galpones.map((g) => {
                  const x = celda(g, f);
                  return (
                    <td key={g.id} className={x.mal ? 'mal' : x.texto ? '' : 'falta'} onClick={() => x.id && ir({ p: 'registro', id: x.id })} style={x.id ? { cursor: 'pointer' } : undefined}>
                      {x.texto || <span aria-label="sin dato">–</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function HojaExportar({ cerrar }: { cerrar: () => void }) {
  const config = useEstado((e) => e.config)!;
  const hoy = useEstado((e) => e.hoy);
  const revisiones = useEstado((e) => e.revisiones);
  const [ocupado, setOcupado] = useState('');
  const [error, setError] = useState('');
  const periodos = [
    { id: 'hoy', nombre: 'Solo hoy', desde: hoy },
    { id: '7', nombre: 'Últimos 7 días', desde: sumarDias(hoy, -6) },
    { id: '30', nombre: 'Últimos 30 días', desde: sumarDias(hoy, -29) },
    { id: '90', nombre: 'Últimos 90 días', desde: sumarDias(hoy, -89) },
    { id: 'todo', nombre: 'Todo desde el primer día', desde: '2020-01-01' },
  ];
  const descargar = async (p: (typeof periodos)[number]) => {
    setOcupado(p.id);
    setError('');
    try {
      const regs = await traerPeriodo(p.desde, hoy);
      if (!regs.length) {
        setError('No hay registros en ese período.');
        return;
      }
      const nombre = `ovocheck-${config.granja.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${p.id === 'todo' ? 'completo' : `${p.desde}-a-${hoy}`}.csv`;
      const r = await entregarArchivo(nombre, armarCsv(config, regs, revisiones));
      avisar(r === 'descargado' ? `Archivo descargado con ${regs.length} registros` : 'Archivo listo', 'ok');
      cerrar();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado('');
    }
  };
  return (
    <Hoja titulo="Descargar datos" cerrar={cerrar}>
      <p className="suave">
        Un archivo que abre en Excel con todos los galpones: cada dato con su fecha, hora, operario y respaldo. Úsalo para llenar tus
        planillas.
      </p>
      {periodos.map((p) => (
        <button key={p.id} className="boton" disabled={Boolean(ocupado)} onClick={() => descargar(p)}>
          {ocupado === p.id ? 'Preparando…' : p.nombre}
        </button>
      ))}
      {error && <p className="error-texto" role="alert">{error}</p>}
    </Hoja>
  );
}

/** Descarga de fotos: en la nube duran un plazo limitado; aquí se bajan al teléfono o computador. */
export function HojaFotos({ cerrar }: { cerrar: () => void }) {
  const config = useEstado((e) => e.config)!;
  const hoy = useEstado((e) => e.hoy);
  const registros = useEstado((e) => e.registros);
  const dias = useEstado((e) => e.fotosNube?.dias ?? 30);
  const [avance, setAvance] = useState<{ id: string; hechas: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<{ guardadas: number; faltantes: number; archivos: number } | null>(null);
  const periodos = [
    { id: 'hoy', nombre: 'Las de hoy', desde: hoy },
    { id: '7', nombre: 'Últimos 7 días', desde: sumarDias(hoy, -6) },
    { id: 'todo', nombre: `Todas las que quedan (${dias} días)`, desde: sumarDias(hoy, -dias) },
  ].map((p) => ({ ...p, fotos: fotosDe(registros, p.desde, hoy) }));
  const bajar = async (p: (typeof periodos)[number]) => {
    setResultado(null);
    setAvance({ id: p.id, hechas: 0, total: p.fotos.length });
    const base = `ovocheck-fotos-${config.granja.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${p.desde}-a-${hoy}`;
    const r = await descargarFotos(config, p.fotos, base, (hechas, total) => setAvance({ id: p.id, hechas, total }));
    if (r.guardadas > 0) anotarBajada(config.granja.id, p.desde, hoy);
    setAvance(null);
    setResultado(r);
  };
  return (
    <Hoja titulo="Descargar fotos" cerrar={cerrar}>
      <div className="tarjeta aviso-atencion">
        <p className="fuerte">Las fotos se borran de la nube a los {dias} días</p>
        <p className="chico">Para conservarlas, descárgalas a este equipo antes de ese plazo. Los números y el historial no se borran.</p>
      </div>
      {periodos.map((p) => (
        <button key={p.id} className="boton" disabled={Boolean(avance) || p.fotos.length === 0} onClick={() => bajar(p)}>
          {avance?.id === p.id ? `Descargando ${avance.hechas} de ${avance.total}…` : `${p.nombre}: ${p.fotos.length} ${p.fotos.length === 1 ? 'foto' : 'fotos'}`}
        </button>
      ))}
      {resultado && (
        <div className={`tarjeta ${resultado.guardadas ? 'aviso-ok' : 'aviso-atencion'}`} role="status">
          <p className="fuerte">
            {resultado.guardadas
              ? `${resultado.guardadas} ${resultado.guardadas === 1 ? 'foto guardada' : 'fotos guardadas'} en ${resultado.archivos === 1 ? 'un archivo .zip' : `${resultado.archivos} archivos .zip`}`
              : 'No se pudo descargar ninguna foto'}
          </p>
          <p className="chico">
            {resultado.guardadas > 0 && 'Quedan en la carpeta Descargas, ordenadas por día y galpón. '}
            {resultado.faltantes > 0 && `${resultado.faltantes} no estaban disponibles: aún no llegan desde el teléfono o ya se borraron.`}
          </p>
        </div>
      )}
      <p className="chico suave">Cada foto lleva en su nombre la fecha, la hora, el galpón, la tarea, quién la tomó y el código del registro.</p>
    </Hoja>
  );
}

// ------------------------------------------------------------------ un galpón en un día
export function GalponDia({ id, fecha }: { id: string; fecha: string }) {
  const config = useEstado((e) => e.config)!;
  const hoy = useEstado((e) => e.hoy);
  useEstado((e) => e.tic);
  const indice = useIndice();
  const carga = usePeriodo(fecha);
  const galpon = config.galpones.find((g) => g.id === id);
  if (!galpon) return <Falta />;
  const tareas = tareasDe(config, id, fecha);
  const regs = tareas.map((t) => indice.vigente(fecha, id, t.id)).filter((r): r is RegistroLocal => Boolean(r));
  const problemas = indice.problemas.filter((p) => p.fecha === fecha && p.galpon_id === id);
  // Registros de tareas que el supervisor quitó o cambió de día después de que se registraron.
  const deHoy = new Set(tareas.map((t) => t.id));
  const otros = indice.delDia(fecha, id).filter((r) => !deHoy.has(r.tarea_id ?? ''));
  const todos = [...regs, ...otros, ...problemas];
  const personas = [...new Set(todos.map((r) => config.usuarios.find((u) => u.id === r.usuario_id)?.nombre ?? r.usuario_nombre ?? 'Persona eliminada'))];
  const tiempos = todos.map(momento).sort((a, b) => a - b);

  return (
    <div className="pantalla">
      <Barra titulo={galpon.nombre} sub={fecha === hoy ? `Hoy, ${fechaLarga(fecha)}` : fechaLarga(fecha)} derecha={<Envio />} />
      <div className="contenido">
        <div className="tarjeta">
          <div className="linea-h">
            <Huevo fraccion={tareas.length ? regs.length / tareas.length : 0} size={46} />
            <div className="crece">
              <p className="subtitulo">
                {regs.length} de {tareas.length} tareas registradas
              </p>
              <p className="chico suave">
                {!todos.length
                  ? 'Aún sin registros'
                  : hora(tiempos[0]) === hora(tiempos[tiempos.length - 1])
                    ? `${personas.join(' y ')}, a las ${hora(tiempos[0])}`
                    : `${personas.join(' y ')}, entre las ${hora(tiempos[0])} y las ${hora(tiempos[tiempos.length - 1])}`}
              </p>
              {(galpon.lote || galpon.aves) && (
                <p className="chico suave">{[galpon.lote && `Lote ${galpon.lote}`, galpon.aves && `${num(galpon.aves)} aves`].filter(Boolean).join(', ')}</p>
              )}
            </div>
          </div>
        </div>
        {carga.estado === 'cargando' && <p className="suave centro">Cargando ese día…</p>}
        {carga.estado === 'error' && <div className="tarjeta aviso-atencion">No se pudo cargar ese día. {carga.error}</div>}
        {(['manana', 'tarde'] as const).map((b) => {
          const del = tareas.filter((t) => t.bloque === b);
          if (!del.length) return null;
          return (
            <section key={b} className="pila">
              <p className="seccion" style={{ marginBottom: 0 }}>
                {NOMBRE_BLOQUE[b]}
              </p>
              <div className="lista">
                {del.map((t) => {
                  const r = indice.vigente(fecha, id, t.id);
                  if (r) return <FilaRegistro key={t.id} r={r} conGalpon={false} conFecha={false} />;
                  const anulada = indice.anulacion(fecha, id, t.id);
                  if (anulada) {
                    return (
                      <button key={t.id} className="fila" onClick={() => ir({ p: 'registro', id: anulada.id })}>
                        <span className="medallon atencion">
                          <Ban size={24} />
                        </span>
                        <span className="fila-cuerpo">
                          <span className="fila-titulo" style={{ display: 'block', fontWeight: 600 }}>
                            {t.nombre}
                          </span>
                          <span className="fila-detalle" style={{ display: 'block' }}>
                            Registro anulado{anulada.motivo ? `: ${anulada.motivo}` : ''}. {fecha < hoy ? 'No se volvió a registrar' : 'Pendiente de registrar de nuevo'}
                          </span>
                        </span>
                        <ChevronRight className="flecha" aria-hidden />
                      </button>
                    );
                  }
                  return (
                    <div key={t.id} className="fila">
                      <span className="medallon">
                        <IconoTarea nombre={t.icono} size={24} />
                      </span>
                      <span className="fila-cuerpo">
                        <span className="fila-titulo" style={{ display: 'block', fontWeight: 600 }}>
                          {t.nombre}
                        </span>
                        <span className="fila-detalle" style={{ display: 'block' }}>
                          {fecha < hoy ? 'No se registró' : 'Pendiente'}
                        </span>
                      </span>
                      {fecha < hoy && <CircleX size={22} color="var(--gris-claro)" aria-hidden />}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        {otros.length > 0 && (
          <section className="pila">
            <p className="seccion" style={{ marginBottom: 0 }}>
              Otros registros del día
            </p>
            <div className="lista">
              {otros.map((r) => (
                <FilaRegistro key={r.id} r={r} conGalpon={false} conFecha={false} />
              ))}
            </div>
          </section>
        )}
        {problemas.length > 0 && (
          <section className="pila">
            <p className="seccion" style={{ marginBottom: 0 }}>
              Problemas informados
            </p>
            <div className="lista">
              {problemas.map((r) => (
                <FilaRegistro key={r.id} r={r} conGalpon={false} conFecha={false} />
              ))}
            </div>
          </section>
        )}
      </div>
      {fecha === hoy && (
        <div className="pie">
          <button className="boton" onClick={() => ir({ p: 'galpon', id })}>
            <Pencil size={20} aria-hidden /> Registrar en este galpón
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ detalle de un registro
export function RegistroDetalle({ id }: { id: string }) {
  const config = useEstado((e) => e.config)!;
  const usuario = useEstado((e) => e.usuario)!;
  const hoy = useEstado((e) => e.hoy);
  const revisiones = useEstado((e) => e.revisiones);
  const fotosNube = useEstado((e) => e.fotosNube);
  const indice = useIndice();
  const [foto, setFoto] = useState<{ id: string; etiqueta: string; nombre: string } | null>(null);
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState(false);

  let r = indice.porId.get(id);
  // Si fue corregido, se muestra la versión vigente y la anterior queda en la historia.
  for (let n = 0; r && n < 50; n++) {
    const sig = indice.reemplazadoPor(r);
    if (!sig) break;
    r = sig;
  }
  if (!r) return <Falta />;
  const reg = r;
  const esSup = usuario.rol === 'supervisor';
  const galpon = config.galpones.find((g) => g.id === reg.galpon_id);
  const persona = (uid: string, respaldo?: string) => config.usuarios.find((u) => u.id === uid)?.nombre ?? respaldo ?? 'Persona eliminada';
  const revision = revisiones.find((v) => v.registro_id === reg.id);
  const historia = indice.historia(reg);
  // Al operario no se le muestran las marcas de verificación (lectura menor que la anterior, lejos del galpón, etc.).
  const flags = esSup ? flagsDe(reg) : flagsDe(reg).filter((f) => f === 'problema' || f === 'omitida');
  const necesitaRevision = !reg.anulado && (esCritico(reg) || esDudoso(reg));
  const puedeCorregir = reg.tipo === 'tarea' && !reg.anulado && (esSup || reg.fecha === hoy);
  const diasFotos = fotosNube?.dias ?? 30;
  const antigua = (Date.now() - momento(reg)) / 86400000 > diasFotos;
  const lejos = galpon?.lat != null && galpon.lng != null && reg.lat != null && reg.lng != null ? Math.round(distancia(galpon.lat, galpon.lng, reg.lat, reg.lng)) : null;

  const marcar = async () => {
    setOcupado(true);
    await revisar(reg.id, nota);
    setOcupado(false);
    avisar('Marcada como revisada', 'ok');
  };

  return (
    <div className="pantalla">
      <Barra titulo={nombreRegistro(reg)} sub={`${nombreGalpon(config, reg)}, ${fechaRelativa(reg.fecha).toLowerCase()}`} />
      <div className="contenido">
        <section className={`tarjeta ${(esSup ? esCritico(reg) : reg.flags.includes('problema')) ? 'aviso-mal' : ''}`}>
          {reg.anulado ? (
            <p className="subtitulo">Registro anulado</p>
          ) : reg.omitida ? (
            <>
              <p className="subtitulo">No se hizo</p>
              <p>{reg.motivo}</p>
            </>
          ) : reg.tipo === 'problema' ? (
            <p style={{ fontSize: 20, fontWeight: 600 }}>{reg.nota || 'Sin descripción'}</p>
          ) : reg.tarea?.tipo === 'check' ? (
            <>
              <p className="subtitulo">{reg.ok ? 'Todo bien' : 'Hay un problema'}</p>
              {reg.nota && <p style={{ marginTop: 4 }}>{reg.nota}</p>}
            </>
          ) : reg.tarea?.tipo === 'fotos' ? (
            <p className="subtitulo">{reg.fotos.length === 1 ? 'Una foto de respaldo' : `${reg.fotos.length} fotos de respaldo`}</p>
          ) : (
            <div className="pila">
              {reg.tarea?.campos.map((c, i) => {
                // Consumo e indicador: cálculos para el supervisor. El operario solo ve lo que anotó.
                const ind = esSup ? reg.indicadores?.[i] : null;
                const prev = esSup && c.acumulativo ? indice.anterior(reg.fecha, reg.galpon_id, reg.tarea_id ?? '') : null;
                const consumo =
                  prev && prev.valores[i] != null
                    ? evaluarCampo(c, reg.valores[i], galpon, { valor: prev.valores[i]!, fecha: prev.fecha }, reg.fecha).base
                    : null;
                const calculos = [consumo != null && `Consumo ${num(consumo, c.decimales)} ${c.unidad} al día`, ind != null && `${num(ind, decimalesIndicador(c, ind))} ${c.indicador}`].filter(Boolean);
                return (
                  <div key={i}>
                    <p className="chico suave">{c.etiqueta}</p>
                    <p style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>
                      {num(reg.valores[i], c.decimales)} <span style={{ fontSize: 18, fontWeight: 600 }}>{c.unidad}</span>
                    </p>
                    {calculos.length > 0 && <p className="chico fuerte">{calculos.join(', ')}</p>}
                  </div>
                );
              })}
              {esSup && <CuadreAves reg={reg} />}
              {esSup && (reg.avisos?.length ?? 0) > 0 && (
                <ul className="avisos-logicos">
                  {reg.avisos!.map((a, k) => (
                    <li key={k}>{a}.</li>
                  ))}
                </ul>
              )}
              {esSup && <ComoSeCalculo reg={reg} galpon={galpon} />}
            </div>
          )}
          {flags.length > 0 && (
            <div className="etiquetas" style={{ marginTop: 12 }}>
              {flags.map((f) => (
                <span key={f} className={`etiqueta ${(FLAGS_CRITICOS as string[]).includes(f) ? 'mal' : 'atencion'}`}>
                  {NOMBRE_FLAG[f]}
                </span>
              ))}
            </div>
          )}
        </section>

        {reg.fotos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: reg.fotos.length > 1 ? '1fr 1fr' : '1fr', gap: 10 }}>
            {reg.fotos.map((f) => (
              <Foto key={f.id} id={f.id} etiqueta={f.etiqueta} clase="grande" alTocar={() => setFoto({ ...f, nombre: nombreFoto(reg, f.etiqueta, reg.fotos.indexOf(f)) })} antigua={antigua} />
            ))}
          </div>
        )}

        <section className="tarjeta">
          <h2 className="subtitulo" style={{ marginBottom: 10 }}>
            Respaldo del registro
          </h2>
          <dl className="ficha">
            <dt>Registró</dt>
            <dd>{persona(reg.usuario_id, reg.usuario_nombre)}</dd>
            <dt>Hora</dt>
            <dd>
              {fechaHora(momento(reg))}
              <br />
              <span className="suave" style={{ fontWeight: 400 }}>
                {reg._pend
                  ? 'Guardado en este teléfono, aún no enviado'
                  : (reg.demora_s ?? 0) > 180
                    ? `Registrado sin señal; llegó al servidor ${duracion(reg.demora_s!)} después`
                    : 'Confirmada por el servidor'}
                {relojMalo(reg) && '. El reloj del teléfono estaba desajustado.'}
              </span>
            </dd>
            <dt>Ubicación</dt>
            <dd>
              {reg.lat != null && reg.lng != null ? (
                <a className="enlace" style={{ minHeight: 0 }} href={`https://www.google.com/maps?q=${reg.lat},${reg.lng}`} target="_blank" rel="noreferrer">
                  <MapPin size={18} aria-hidden />
                  {lejos !== null ? `A ${num(lejos)} m del galpón` : 'Ver en el mapa'}
                </a>
              ) : (
                'Sin GPS'
              )}
            </dd>
            <dt>Código</dt>
            <dd>{reg.id.slice(0, 8).toUpperCase()}</dd>
            {reg.corrige && (
              <>
                <dt>Motivo</dt>
                <dd>{reg.motivo || 'Corrección'}</dd>
              </>
            )}
          </dl>
        </section>

        {historia.length > 0 && (
          <section className="tarjeta">
            <h2 className="subtitulo" style={{ marginBottom: 10 }}>
              Versiones anteriores
            </h2>
            <div className="linea-tiempo">
              {historia.map((h) => (
                <div key={h.id}>
                  <p className="fuerte">{resumen(h)}</p>
                  <p className="chico suave">
                    {persona(h.usuario_id, h.usuario_nombre)}, {fechaHora(momento(h))}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {revision ? (
          <section className="tarjeta aviso-ok">
            <p className="fuerte">Revisada por {persona(revision.usuario_id)}</p>
            <p className="chico">{fechaHora(revision.creado)}</p>
            {revision.nota && <p style={{ marginTop: 6 }}>{revision.nota}</p>}
          </section>
        ) : (
          esSup &&
          necesitaRevision && (
            <section className="tarjeta pila">
              <label className="campo">
                <span>Qué se hizo (opcional)</span>
                <textarea className="entrada" style={{ minHeight: 72 }} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Por ejemplo: se cambió el niple" />
              </label>
              <button className="boton primario" onClick={marcar} disabled={ocupado}>
                <Check size={22} aria-hidden /> Marcar como revisada
              </button>
            </section>
          )
        )}

        {(puedeCorregir || (esSup && reg.tipo === 'tarea' && !reg.anulado)) && (
          <div className="pila">
            {puedeCorregir && (
              <button className="boton" onClick={() => ir({ p: 'tarea', galpon: reg.galpon_id, corrige: reg.id })}>
                <Pencil size={20} aria-hidden /> Corregir este registro
              </button>
            )}
            {esSup && reg.tipo === 'tarea' && (
              <button className="boton peligro-suave" onClick={() => ir({ p: 'tarea', galpon: reg.galpon_id, corrige: reg.id, anular: true })}>
                <Ban size={20} aria-hidden /> Anular este registro
              </button>
            )}
          </div>
        )}
      </div>
      {foto && <VisorFoto id={foto.id} etiqueta={foto.etiqueta} nombre={foto.nombre} cerrar={() => setFoto(null)} />}
    </div>
  );
}
