import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, ClipboardCheck, Eye, EyeOff, KeyRound, Mail, Minus, Plus, ShieldCheck, UserPlus } from 'lucide-react';
import {
  autorizarOperario, buscarPlantel, cambiarClave, comprobarVinculo, crearGranja, crearPin, entrarOperario, entrarSupervisor, entrarSupervisorCorreo, pedirCodigo,
  pedirCodigoCorreo, recuperarClave, recuperarClaveCorreo, salir, vincular,
} from '../lib/app';
import { avisar, leerEstado, poner, useEstado } from '../lib/estado';
import { mensajeError } from '../lib/nube';
import type { Usuario } from '../lib/tipos';
import { claveDebil, iniciales, vibrar } from '../lib/util';
import { AvisoSinEnviar, Barra, Envio, Hoja, PuntosPin, Teclado, useAtras } from './base';
import { BotonInstalar } from './avisos';

export const correoValido = (c: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.trim());

const nombreEquipo = () =>
  /iPhone|iPad/i.test(navigator.userAgent) ? 'iPhone' : /Android/i.test(navigator.userAgent) ? 'Teléfono Android' : 'Computador';

/** Los dos caminos de entrada. Es lo primero que ve cualquier persona al abrir la app. */
function ElegirRol({ alElegir }: { alElegir: (rol: 'operario' | 'supervisor') => void }) {
  return (
    <div className="pila" style={{ width: '100%' }}>
      <button className="rol" onClick={() => alElegir('operario')}>
        <span className="medallon hecho" aria-hidden>
          <ClipboardCheck size={30} />
        </span>
        <span className="rol-cuerpo">
          <b>Soy operario</b>
          <span>Registro las tareas de los galpones</span>
        </span>
        <ChevronRight className="flecha" aria-hidden />
      </button>
      <button className="rol" onClick={() => alElegir('supervisor')}>
        <span className="medallon naranjo" aria-hidden>
          <ShieldCheck size={30} />
        </span>
        <span className="rol-cuerpo">
          <b>Soy supervisor</b>
          <span>Reviso los registros y organizo el plantel</span>
        </span>
        <ChevronRight className="flecha" aria-hidden />
      </button>
    </div>
  );
}

export function SinNube() {
  return (
    <div className="pantalla blanca">
      <div className="contenido centrado portada">
        <img className="logo" src="/logo.webp" alt="Ovo Check, registro avícola" />
        <div className="tarjeta aviso-atencion" style={{ textAlign: 'left' }}>
          <p className="fuerte">Falta conectar el servidor</p>
          <p className="chico" style={{ marginTop: 6 }}>
            La app no encuentra la dirección de Supabase. Agrega las variables VITE_SUPABASE_URL y VITE_SUPABASE_KEY (paso 3
            del archivo LEEME) y vuelve a publicar.
          </p>
        </div>
      </div>
    </div>
  );
}

export function Bienvenida() {
  // Un enlace de invitación (…/?plantel=Nombre) trae el nombre del plantel ya escrito.
  // Un teléfono desvinculado que vuelve a entrar ya sabe a qué plantel pertenece: solo falta la clave.
  const [sugerido] = useState(() => leerEstado().plantelSugerido ?? '');
  useEffect(() => {
    if (leerEstado().plantelSugerido) poner({ plantelSugerido: null });
  }, []);
  const invitado = sugerido || (new URLSearchParams(window.location.search).get('plantel')?.trim() ?? '');
  const [paso, setPaso] = useState<'inicio' | 'operario' | 'supervisor' | 'crear' | 'olvido'>(invitado ? 'operario' : 'inicio');
  const anterior = useEstado((e) => (e.config && e.dispositivo && !e.desvinculado ? e.config.granja.nombre : ''));
  if (paso === 'operario') return <EntrarPlantel volver={() => setPaso('inicio')} inicial={invitado} />;
  if (paso === 'supervisor') return <EntrarSupervisor volver={() => setPaso('inicio')} crear={() => setPaso('crear')} olvido={() => setPaso('olvido')} />;
  if (paso === 'crear') return <CrearGranja volver={() => setPaso('supervisor')} />;
  if (paso === 'olvido') return <RecuperarPorCorreo volver={() => setPaso('supervisor')} />;
  return (
    <div className="pantalla blanca">
      <div className="contenido centrado portada">
        <img className="logo" src="/logo.webp" alt="Ovo Check, registro avícola" />
        <p className="suave" style={{ maxWidth: 340 }}>
          El registro diario de cada galpón, con respaldo y directo al supervisor.
        </p>
        <ElegirRol alElegir={setPaso} />
        <BotonInstalar />
        {anterior && (
          <button className="enlace gris" onClick={() => poner({ fase: 'ingreso' })}>
            Volver a {anterior}
          </button>
        )}
      </div>
    </div>
  );
}

/** Operario: busca su plantel por el nombre exacto y entra con la clave que creó el supervisor. */
function EntrarPlantel({ volver, inicial }: { volver: () => void; inicial?: string }) {
  const [nombre, setNombre] = useState(inicial ?? '');
  const [plantel, setPlantel] = useState<{ nombre: string } | null>(null);
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useAtras(() => (plantel ? (setPlantel(null), setClave(''), setError('')) : volver()));

  const buscar = async (texto = nombre) => {
    if (texto.trim().length < 3) return setError('Escribe el nombre completo del plantel');
    setError('');
    setOcupado(true);
    try {
      setPlantel(await buscarPlantel(texto));
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };
  const entrar = async () => {
    if (!plantel) return;
    setError('');
    setOcupado(true);
    try {
      await vincular(plantel.nombre, clave, nombreEquipo());
    } catch (e) {
      setError(mensajeError(e));
      setOcupado(false);
    }
  };
  useEffect(() => {
    if (inicial) buscar(inicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!plantel) {
    return (
      <div className="pantalla blanca">
        <Barra titulo="Soy operario" atras={volver} />
        <form
          className="contenido"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ocupado) buscar();
          }}
        >
          <h2 className="titulo">Busca tu plantel</h2>
          <label className="campo">
            <span>Nombre del plantel</span>
            <input className="entrada" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} autoCorrect="off" spellCheck={false} autoFocus enterKeyHint="search" />
            <small>Escríbelo completo, como lo creó tu supervisor. No importan las mayúsculas ni los tildes.</small>
          </label>
          {error && <p className="error-texto" role="alert">{error}</p>}
          <button className="boton primario grande" disabled={ocupado || nombre.trim().length < 3}>
            {ocupado ? 'Buscando…' : 'Buscar'}
          </button>
        </form>
      </div>
    );
  }
  return (
    <div className="pantalla blanca">
      <Barra titulo="Soy operario" atras={() => (setPlantel(null), setClave(''), setError(''))} />
      <form
        className="contenido"
        onSubmit={(e) => {
          e.preventDefault();
          if (clave.trim() && !ocupado) entrar();
        }}
      >
        <div className="tarjeta aviso-ok linea-h">
          <CheckCircle2 size={26} aria-hidden style={{ flex: 'none' }} />
          <div>
            <p className="chico">Plantel encontrado</p>
            <p className="fuerte">{plantel.nombre}</p>
          </div>
        </div>
        <CampoClave rotulo="Clave del plantel" valor={clave} alCambiar={setClave} ayuda="Te la da tu supervisor. Se escribe una sola vez en este teléfono." foco />
        {error && <p className="error-texto" role="alert">{error}</p>}
        <button className="boton primario grande" disabled={!clave.trim() || ocupado}>
          {ocupado ? 'Entrando…' : 'Entrar al plantel'}
        </button>
        <p className="chico suave">Después eliges tu nombre y creas tu PIN.</p>
      </form>
    </div>
  );
}

/** Supervisor: correo y clave. Desde aquí también se crea un plantel nuevo. */
function EntrarSupervisor({ volver, crear, olvido }: { volver: () => void; crear: () => void; olvido: () => void }) {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [opciones, setOpciones] = useState<{ id: string; nombre: string }[] | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useAtras(() => (opciones ? setOpciones(null) : volver()));

  const entrar = async (granjaId?: string) => {
    if (!correoValido(correo)) return setError('Escribe tu correo completo');
    setError('');
    setOcupado(true);
    try {
      const lista = await entrarSupervisorCorreo(correo, clave, nombreEquipo(), granjaId);
      if (lista) {
        setOpciones(lista);
        setOcupado(false);
      }
    } catch (e) {
      setError(mensajeError(e));
      setOcupado(false);
    }
  };

  if (opciones) {
    return (
      <div className="pantalla blanca">
        <Barra titulo="Soy supervisor" atras={() => setOpciones(null)} />
        <div className="contenido">
          <h2 className="titulo">¿A cuál plantel entras?</h2>
          <div className="lista">
            {opciones.map((o) => (
              <button key={o.id} className="fila" disabled={ocupado} onClick={() => entrar(o.id)}>
                <span className="fila-cuerpo">
                  <span className="fila-titulo">{o.nombre}</span>
                </span>
                <ChevronRight className="flecha" aria-hidden />
              </button>
            ))}
          </div>
          {error && <p className="error-texto" role="alert">{error}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className="pantalla blanca">
      <Barra titulo="Soy supervisor" atras={volver} />
      <form
        className="contenido"
        onSubmit={(e) => {
          e.preventDefault();
          if (clave && !ocupado) entrar();
        }}
      >
        <h2 className="titulo">Entra con tu correo y tu clave</h2>
        <label className="campo">
          <span>Tu correo</span>
          <input className="entrada" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} maxLength={80} autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" />
        </label>
        <CampoClave rotulo="Tu clave de supervisor" valor={clave} alCambiar={setClave} />
        {error && <p className="error-texto" role="alert">{error}</p>}
        <button className="boton primario grande" disabled={!correo.trim() || !clave || ocupado}>
          {ocupado ? 'Verificando…' : 'Entrar'}
        </button>
        <button type="button" className="enlace" style={{ alignSelf: 'center' }} onClick={olvido}>
          Olvidé mi clave
        </button>
        <div className="separador" />
        <p className="suave">¿Tu plantel todavía no está en Ovo Check?</p>
        <button type="button" className="boton" onClick={crear}>
          Crear un plantel nuevo
        </button>
      </form>
    </div>
  );
}

/** "Olvidé mi clave" desde un equipo que aún no está en el plantel: llega un código al correo. */
function RecuperarPorCorreo({ volver }: { volver: () => void }) {
  const [correo, setCorreo] = useState('');
  const [envio, setEnvio] = useState<{ correo: string; minutos: number } | null>(null);
  const [opciones, setOpciones] = useState<{ id: string; nombre: string }[] | null>(null);
  const [codigo, setCodigo] = useState('');
  const [clave, setClave] = useState('');
  const [clave2, setClave2] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useAtras(volver);

  const pedir = async () => {
    if (!correoValido(correo)) return setError('Escribe tu correo completo');
    setError('');
    setOcupado(true);
    try {
      setEnvio(await pedirCodigoCorreo(correo));
      setCodigo('');
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };
  const entrar = async (granjaId?: string) => {
    const lista = await entrarSupervisorCorreo(correo, clave, nombreEquipo(), granjaId);
    if (lista) {
      setOpciones(lista);
      setOcupado(false);
    } else {
      avisar('Clave cambiada', 'ok');
    }
  };
  const cambiar = async () => {
    if (codigo.replace(/\D/g, '').length !== 6) return setError('El código tiene 6 números');
    if (clave.length < 6) return setError('La clave nueva debe tener al menos 6 caracteres');
    if (claveDebil(clave)) return setError('Esa clave es muy fácil de adivinar. Elige otra');
    if (clave !== clave2) return setError('Las dos claves no coinciden');
    setError('');
    setOcupado(true);
    try {
      await recuperarClaveCorreo(correo, codigo, clave);
    } catch (e) {
      setError(mensajeError(e));
      setOcupado(false);
      return;
    }
    try {
      await entrar();
    } catch {
      // La clave ya cambió; si falló la entrada (por ejemplo, se cortó la señal), se entra con ella desde la pantalla anterior.
      avisar('Tu clave nueva quedó guardada. Entra con ella.', 'ok');
      volver();
    }
  };

  if (opciones) {
    return (
      <div className="pantalla blanca">
        <Barra titulo="Recuperar mi clave" atras={volver} />
        <div className="contenido">
          <div className="tarjeta aviso-ok">Tu clave nueva ya quedó guardada.</div>
          <h2 className="titulo">¿A cuál plantel entras?</h2>
          <div className="lista">
            {opciones.map((o) => (
              <button key={o.id} className="fila" disabled={ocupado} onClick={() => entrar(o.id).catch((e) => setError(mensajeError(e)))}>
                <span className="fila-cuerpo">
                  <span className="fila-titulo">{o.nombre}</span>
                </span>
                <ChevronRight className="flecha" aria-hidden />
              </button>
            ))}
          </div>
          {error && <p className="error-texto" role="alert">{error}</p>}
        </div>
      </div>
    );
  }
  if (!envio) {
    return (
      <div className="pantalla blanca">
        <Barra titulo="Recuperar mi clave" atras={volver} />
        <form
          className="contenido"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ocupado) pedir();
          }}
        >
          <span className="medallon hecho" style={{ width: 60, height: 60 }}>
            <Mail size={32} aria-hidden />
          </span>
          <h2 className="titulo">Recibe un código en tu correo</h2>
          <p>Escribe el correo con que te registraste como supervisor. Con el código que te llegue eliges una clave nueva.</p>
          <label className="campo">
            <span>Tu correo</span>
            <input className="entrada" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} maxLength={80} autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" autoFocus />
          </label>
          {error && <p className="error-texto" role="alert">{error}</p>}
          <button className="boton primario grande" disabled={ocupado || !correo.trim()}>
            {ocupado ? 'Enviando…' : 'Enviar el código'}
          </button>
        </form>
      </div>
    );
  }
  return (
    <div className="pantalla blanca">
      <Barra titulo="Recuperar mi clave" atras={volver} />
      <form
        className="contenido"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ocupado) cambiar();
        }}
      >
        <div className="tarjeta aviso-ok">
          Enviamos un código a <b>{envio.correo}</b>. Vence en {envio.minutos} minutos. Si no lo ves, revisa la carpeta de correo no deseado.
        </div>
        <label className="campo">
          <span>Código de 6 números</span>
          <input className="entrada codigo" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/[^\d ]/g, '').slice(0, 7))} placeholder="000 000" inputMode="numeric" autoComplete="one-time-code" autoFocus />
        </label>
        <CampoClave rotulo="Clave nueva" valor={clave} alCambiar={setClave} ayuda="Mínimo 6 caracteres." nueva />
        <CampoClave rotulo="Repite la clave nueva" valor={clave2} alCambiar={setClave2} nueva />
        {error && <p className="error-texto" role="alert">{error}</p>}
        <button className="boton primario grande" disabled={ocupado}>
          {ocupado ? 'Verificando…' : 'Cambiar clave y entrar'}
        </button>
        <button type="button" className="enlace gris" style={{ alignSelf: 'center' }} onClick={pedir} disabled={ocupado}>
          Enviar un código nuevo
        </button>
      </form>
    </div>
  );
}

function CampoClave(p: { rotulo: string; valor: string; alCambiar: (v: string) => void; ayuda?: string; nueva?: boolean; foco?: boolean }) {
  const [ver, setVer] = useState(false);
  return (
    <label className="campo">
      <span>{p.rotulo}</span>
      <div className="con-boton">
        <input
          className="entrada"
          type={ver ? 'text' : 'password'}
          value={p.valor}
          onChange={(e) => p.alCambiar(e.target.value)}
          autoComplete={p.nueva ? 'new-password' : 'current-password'}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={p.foco}
        />
        <button type="button" className="icono-boton" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar clave' : 'Mostrar clave'}>
          {ver ? <EyeOff size={22} /> : <Eye size={22} />}
        </button>
      </div>
      {p.ayuda && <small>{p.ayuda}</small>}
    </label>
  );
}

function CrearGranja({ volver }: { volver: () => void }) {
  const [granja, setGranja] = useState('');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [clave2, setClave2] = useState('');
  const [claveOp, setClaveOp] = useState('');
  const [galpones, setGalpones] = useState(2);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useAtras(volver);

  const falta =
    granja.replace(/[^\p{L}\p{N}]/gu, '').length < 3 ? 'Escribe el nombre del plantel'
    : nombre.trim().length < 2 ? 'Escribe tu nombre'
    : !correoValido(correo) ? 'Escribe un correo válido: con él entras y ahí llega el código si olvidas tu clave'
    : clave.length < 6 ? 'Tu clave debe tener al menos 6 caracteres'
    : claveDebil(clave, granja, nombre, correo.split('@')[0]) ? 'Tu clave es muy fácil de adivinar. Elige otra'
    : clave !== clave2 ? 'Las dos claves de supervisor no coinciden'
    : claveOp.trim().length < 6 ? 'La clave del plantel debe tener al menos 6 caracteres'
    : claveDebil(claveOp, granja) ? 'La clave del plantel es muy fácil de adivinar. Elige otra'
    : claveOp.trim().toLowerCase() === clave.toLowerCase() ? 'La clave del plantel debe ser distinta de tu clave de supervisor'
    : '';

  const enviar = async () => {
    if (falta) return setError(falta);
    setError('');
    setOcupado(true);
    try {
      await crearGranja({ granja, supervisor: nombre, correo, clave, claveOperarios: claveOp, galpones, dispositivo: `${nombreEquipo()} de ${nombre.trim().split(' ')[0]}` });
      avisar('Plantel creado', 'ok');
    } catch (e) {
      setError(mensajeError(e));
      setOcupado(false);
    }
  };

  return (
    <div className="pantalla blanca">
      <Barra titulo="Crear un plantel nuevo" atras={volver} />
      <form
        className="contenido"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ocupado) enviar();
        }}
      >
        <p className="suave">Tú quedas como supervisor. Después agregas a tus operarios, galpones y tareas.</p>
        <label className="campo">
          <span>Nombre del plantel</span>
          <input className="entrada" value={granja} onChange={(e) => setGranja(e.target.value)} maxLength={60} autoComplete="organization" />
          <small>Tus operarios lo escribirán para encontrarlo. Usa un nombre que no se confunda con otro.</small>
        </label>
        <div className="campo">
          <span className="rotulo">Galpones en producción</span>
          <div className="linea-h">
            <button type="button" className="boton chico" onClick={() => setGalpones(Math.max(1, galpones - 1))} aria-label="Un galpón menos">
              <Minus size={20} />
            </button>
            <b style={{ fontSize: 26, minWidth: 44, textAlign: 'center' }}>{galpones}</b>
            <button type="button" className="boton chico" onClick={() => setGalpones(Math.min(40, galpones + 1))} aria-label="Un galpón más">
              <Plus size={20} />
            </button>
          </div>
          <small>Después puedes cambiarles el nombre, agregar o quitar.</small>
        </div>
        <label className="campo">
          <span>Tu nombre y apellido</span>
          <input className="entrada" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} autoComplete="name" />
        </label>
        <label className="campo">
          <span>Tu correo</span>
          <input className="entrada" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} maxLength={80} autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" />
          <small>Con él entras como supervisor. Si olvidas tu clave, ahí te llega un código.</small>
        </label>
        <CampoClave rotulo="Tu clave de supervisor" valor={clave} alCambiar={setClave} ayuda="Mínimo 6 caracteres. Solo tú debes conocerla." nueva />
        <CampoClave rotulo="Repite tu clave" valor={clave2} alCambiar={setClave2} nueva />
        <label className="campo">
          <span>Clave del plantel para tus operarios</span>
          <input className="entrada" value={claveOp} onChange={(e) => setClaveOp(e.target.value)} maxLength={40} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          <small>La inventas tú y se la das a tus operarios: la escriben una vez en su teléfono para entrar al plantel. Mínimo 6 caracteres. Puedes cambiarla cuando quieras.</small>
        </label>
        {error && <p className="error-texto" role="alert">{error}</p>}
        <button className="boton primario grande" disabled={ocupado}>
          {ocupado ? 'Creando…' : 'Crear plantel'}
        </button>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ ingreso
/** Equipo que ya está en un plantel: primero se elige cómo entrar, después quién eres. */
export function Ingreso() {
  const config = useEstado((e) => e.config)!;
  const equipo = useEstado((e) => e.dispositivo?.nombre ?? '');
  // Quien acaba de entrar al plantel como operario pasa directo a elegir su nombre.
  const [rol, setRol] = useState<'operario' | 'supervisor' | null>(() => leerEstado().rolIngreso);
  const [elegido, setElegido] = useState<Usuario | null>(null);
  const [nuevo, setNuevo] = useState(false);
  useEffect(() => {
    if (leerEstado().rolIngreso) poner({ rolIngreso: null });
  }, []);
  const activos = config.usuarios.filter((u) => u.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const operarios = activos.filter((u) => u.rol === 'operario');
  const supervisores = activos.filter((u) => u.rol === 'supervisor');
  useAtras(() => setRol(null), rol !== null && !elegido);

  // Si cambia la configuración mientras alguien escribe su PIN, se usa la ficha actualizada.
  const actual = elegido ? activos.find((u) => u.id === elegido.id) ?? null : null;
  const soltar = () => {
    setElegido(null);
    if (actual?.rol === 'supervisor' && supervisores.length === 1) setRol(null);
  };
  if (actual) {
    if (actual.rol === 'supervisor') return <ClaveSupervisor usuario={actual} volver={soltar} />;
    if (!actual.pin_hash) return <CrearPin usuario={actual} volver={soltar} />;
    return <PinOperario usuario={actual} volver={soltar} />;
  }

  const elegirRol = (r: 'operario' | 'supervisor') => {
    setRol(r);
    // Con un solo supervisor no hace falta la lista: va directo a la clave.
    if (r === 'supervisor' && supervisores.length === 1) setElegido(supervisores[0]);
  };
  const fila = (u: Usuario) => (
    <button key={u.id} className="fila" onClick={() => setElegido(u)}>
      <span className="medallon redondo" aria-hidden>
        {iniciales(u.nombre)}
      </span>
      <span className="fila-cuerpo">
        <span className="fila-titulo">{u.nombre}</span>
      </span>
      <ChevronRight className="flecha" aria-hidden />
    </button>
  );
  const cabecera = (
    <header className="barra sin-atras">
      <div className="marca-linea crece">
        <img src="/marca.webp" alt="" />
        <div className="barra-titulo">
          <h1>{config.granja.nombre}</h1>
          <p>{equipo}</p>
        </div>
      </div>
      <Envio />
    </header>
  );

  if (!rol) {
    return (
      <div className="pantalla">
        {cabecera}
        <div className="contenido">
          <h2 className="titulo">¿Cómo vas a entrar?</h2>
          <AvisoSinEnviar />
          <ElegirRol alElegir={elegirRol} />
          <BotonInstalar />
          <button className="enlace gris" style={{ alignSelf: 'center', marginTop: 'auto' }} onClick={() => poner({ fase: 'bienvenida' })}>
            Entrar a otro plantel
          </button>
        </div>
      </div>
    );
  }
  const lista = rol === 'operario' ? operarios : supervisores;
  return (
    <div className="pantalla">
      <Barra titulo={rol === 'operario' ? 'Soy operario' : 'Soy supervisor'} sub={config.granja.nombre} atras={() => setRol(null)} />
      <div className="contenido">
        <h2 className="titulo">¿Quién eres?</h2>
        {lista.length > 0 ? (
          <div className="lista">{lista.map(fila)}</div>
        ) : (
          <div className="tarjeta suave">{rol === 'operario' ? 'Aún no hay operarios en este plantel. Agrega el primero aquí mismo, con la clave del supervisor.' : 'No hay supervisores activos.'}</div>
        )}
        {rol === 'operario' && (
          <button className="boton" onClick={() => setNuevo(true)}>
            <UserPlus size={20} aria-hidden /> No estoy en la lista
          </button>
        )}
      </div>
      {nuevo && <HojaOperarioNuevo supervisores={supervisores} cerrar={() => setNuevo(false)} />}
    </div>
  );
}

/**
 * El teléfono de la empresa pasa a una persona nueva: se agrega aquí mismo, con la clave de un supervisor.
 * No hay que desvincular el teléfono ni usar otro equipo.
 */
function HojaOperarioNuevo({ supervisores, cerrar }: { supervisores: Usuario[]; cerrar: () => void }) {
  const [nombre, setNombre] = useState('');
  const [supId, setSupId] = useState(supervisores[0]?.id ?? '');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const enviar = async () => {
    const n = nombre.trim().replace(/\s+/g, ' ');
    const sup = supervisores.find((u) => u.id === supId);
    if (n.length < 3) return setError('Escribe el nombre y el apellido del operario');
    if (!sup) return setError('Elige al supervisor que autoriza');
    if (!clave) return setError('Falta la clave del supervisor');
    setError('');
    setOcupado(true);
    try {
      await autorizarOperario(n, sup, clave);
      avisar(`${n} ya está en la lista. Toca su nombre para crear su PIN.`, 'ok');
      cerrar();
    } catch (e) {
      setError(mensajeError(e));
      setOcupado(false);
    }
  };
  return (
    <Hoja titulo="Agregar operario" cerrar={cerrar}>
      <p className="chico suave">Lo autoriza un supervisor con su clave. La clave no queda guardada en este teléfono.</p>
      <label className="campo">
        <span>Nombre y apellido del operario</span>
        <input className="entrada" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={50} autoComplete="off" autoFocus />
      </label>
      {supervisores.length > 1 && (
        <label className="campo">
          <span>Supervisor que autoriza</span>
          <select className="entrada" value={supId} onChange={(e) => setSupId(e.target.value)}>
            {supervisores.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
      <CampoClave rotulo={supervisores.length === 1 ? `Clave de ${supervisores[0].nombre} (supervisor)` : 'Clave del supervisor'} valor={clave} alCambiar={setClave} />
      {error && <p className="error-texto" role="alert">{error}</p>}
      <button className="boton primario grande" disabled={ocupado} onClick={enviar}>
        {ocupado ? 'Agregando…' : 'Agregar operario'}
      </button>
    </Hoja>
  );
}

function PinOperario({ usuario, volver }: { usuario: Usuario; volver: () => void }) {
  const [pin, setPin] = useState('');
  const [mal, setMal] = useState(0);
  const [msg, setMsg] = useState('');
  useAtras(volver);

  useEffect(() => {
    if (pin.length !== 4) return;
    let vivo = true;
    entrarOperario(usuario, pin).then((r) => {
      if (!vivo || r === 'ok') return;
      vibrar([70, 50, 70]);
      setMal((n) => n + 1);
      setMsg(r === 'espera' ? 'Demasiados intentos. Espera medio minuto.' : 'PIN incorrecto');
      setTimeout(() => vivo && setPin(''), 350);
    });
    return () => {
      vivo = false;
    };
  }, [pin, usuario]);

  return (
    <div className="pantalla blanca">
      <Barra titulo={usuario.nombre} atras={volver} />
      <div className="contenido" style={{ justifyContent: 'flex-end' }}>
        <div className="centro" style={{ marginBottom: 'auto', paddingTop: 20 }}>
          <h2 className="titulo">Escribe tu PIN</h2>
          <div key={mal}>
            <PuntosPin largo={pin.length} mal={mal > 0 && pin.length === 4} />
          </div>
          <p className="error-texto" role="alert" style={{ minHeight: 22 }}>
            {msg}
          </p>
          <p className="chico suave">Si lo olvidaste, pide al supervisor que lo reinicie.</p>
        </div>
        <Teclado
          valor={pin}
          largo={4}
          alCambiar={(v) => {
            setMsg('');
            setPin(v.slice(0, 4));
          }}
        />
      </div>
    </div>
  );
}

function CrearPin({ usuario, volver }: { usuario: Usuario; volver: () => void }) {
  const [primero, setPrimero] = useState('');
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');
  const [mal, setMal] = useState(0);
  useAtras(() => (primero ? (setPrimero(''), setPin('')) : volver()));

  useEffect(() => {
    if (pin.length !== 4) return;
    const t = setTimeout(() => {
      if (!primero) {
        if (/^(\d)\1{3}$/.test(pin) || pin === '1234') {
          setMsg('Elige un PIN menos fácil de adivinar');
          setMal((n) => n + 1);
          setPin('');
          return;
        }
        setPrimero(pin);
        setPin('');
        setMsg('');
      } else if (pin === primero) {
        crearPin(usuario, pin).then(() => avisar('PIN creado', 'ok'));
      } else {
        vibrar([70, 50, 70]);
        setMsg('No coincide. Empecemos de nuevo.');
        setMal((n) => n + 1);
        setPrimero('');
        setPin('');
      }
    }, 180);
    return () => clearTimeout(t);
  }, [pin, primero, usuario]);

  return (
    <div className="pantalla blanca">
      <Barra titulo={usuario.nombre} atras={() => (primero ? (setPrimero(''), setPin('')) : volver())} />
      <div className="contenido" style={{ justifyContent: 'flex-end' }}>
        <div className="centro" style={{ marginBottom: 'auto', paddingTop: 20 }}>
          <h2 className="titulo">{primero ? 'Repite tu PIN' : 'Crea tu PIN'}</h2>
          <p className="suave" style={{ marginTop: 6 }}>
            {primero ? 'Escríbelo otra vez para confirmar.' : 'Cuatro números que solo tú conozcas. Con él firmas tus registros.'}
          </p>
          <div key={mal}>
            <PuntosPin largo={pin.length} mal={mal > 0 && !pin && Boolean(msg)} />
          </div>
          <p className="error-texto" role="alert" style={{ minHeight: 22 }}>
            {msg}
          </p>
        </div>
        <Teclado valor={pin} largo={4} alCambiar={(v) => setPin(v.slice(0, 4))} />
      </div>
    </div>
  );
}

function ClaveSupervisor({ usuario, volver }: { usuario: Usuario; volver: () => void }) {
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [olvido, setOlvido] = useState(false);
  useAtras(volver, !olvido);
  const enviar = async () => {
    setError('');
    setOcupado(true);
    try {
      await entrarSupervisor(usuario, clave);
    } catch (e) {
      setError(mensajeError(e));
      setOcupado(false);
    }
  };
  if (olvido) return <RecuperarClave usuario={usuario} volver={() => setOlvido(false)} />;
  return (
    <div className="pantalla blanca">
      <Barra titulo={usuario.nombre} sub="Supervisión" atras={volver} />
      <form
        className="contenido"
        onSubmit={(e) => {
          e.preventDefault();
          if (clave && !ocupado) enviar();
        }}
      >
        <div className="linea-h" style={{ marginTop: 8 }}>
          <span className="medallon hecho">
            <KeyRound size={24} aria-hidden />
          </span>
          <h2 className="subtitulo">Entra con tu clave</h2>
        </div>
        <CampoClave rotulo="Clave de supervisor" valor={clave} alCambiar={setClave} foco />
        {error && <p className="error-texto" role="alert">{error}</p>}
        <button className="boton primario grande" disabled={!clave || ocupado}>
          {ocupado ? 'Verificando…' : 'Entrar'}
        </button>
        <button type="button" className="enlace" style={{ alignSelf: 'center' }} onClick={() => setOlvido(true)}>
          Olvidé mi clave
        </button>
      </form>
    </div>
  );
}

function RecuperarClave({ usuario, volver }: { usuario: Usuario; volver: () => void }) {
  const [envio, setEnvio] = useState<{ correo: string; minutos: number } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [clave, setClave] = useState('');
  const [clave2, setClave2] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useAtras(volver);

  const pedir = async () => {
    setError('');
    setOcupado(true);
    try {
      setEnvio(await pedirCodigo(usuario));
      setCodigo('');
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };
  const cambiar = async () => {
    if (codigo.replace(/\D/g, '').length !== 6) return setError('El código tiene 6 números');
    if (clave.length < 6) return setError('La clave nueva debe tener al menos 6 caracteres');
    if (claveDebil(clave)) return setError('Esa clave es muy fácil de adivinar. Elige otra');
    if (clave !== clave2) return setError('Las dos claves no coinciden');
    setError('');
    setOcupado(true);
    try {
      await recuperarClave(usuario, codigo, clave);
      avisar('Clave cambiada', 'ok');
    } catch (e) {
      setError(mensajeError(e));
      setOcupado(false);
    }
  };

  if (!envio) {
    return (
      <div className="pantalla blanca">
        <Barra titulo="Recuperar mi clave" sub={usuario.nombre} atras={volver} />
        <div className="contenido">
          <span className="medallon hecho" style={{ width: 60, height: 60 }}>
            <Mail size={32} aria-hidden />
          </span>
          <h2 className="titulo">Recibe un código en tu correo</h2>
          <p>Lo enviamos al correo que registraste como supervisor. Con ese código eliges una clave nueva.</p>
          {error && <p className="error-texto" role="alert">{error}</p>}
          <button className="boton primario grande" onClick={pedir} disabled={ocupado}>
            {ocupado ? 'Enviando…' : 'Enviar el código'}
          </button>
          <div className="tarjeta aviso-info chico">
            <b>¿Ya no usas ese correo?</b> Otro supervisor puede ponerte una clave temporal desde Ajustes, Personas.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="pantalla blanca">
      <Barra titulo="Recuperar mi clave" sub={usuario.nombre} atras={volver} />
      <form
        className="contenido"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ocupado) cambiar();
        }}
      >
        <div className="tarjeta aviso-ok">
          Enviamos un código a <b>{envio.correo}</b>. Vence en {envio.minutos} minutos. Si no lo ves, revisa la carpeta de correo no deseado.
        </div>
        <label className="campo">
          <span>Código de 6 números</span>
          <input className="entrada codigo" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/[^\d ]/g, '').slice(0, 7))} placeholder="000 000" inputMode="numeric" autoComplete="one-time-code" autoFocus />
        </label>
        <CampoClave rotulo="Clave nueva" valor={clave} alCambiar={setClave} ayuda="Mínimo 6 caracteres." nueva />
        <CampoClave rotulo="Repite la clave nueva" valor={clave2} alCambiar={setClave2} nueva />
        {error && <p className="error-texto" role="alert">{error}</p>}
        <button className="boton primario grande" disabled={ocupado}>
          {ocupado ? 'Verificando…' : 'Cambiar clave y entrar'}
        </button>
        <button type="button" className="enlace gris" style={{ alignSelf: 'center' }} onClick={pedir} disabled={ocupado}>
          Enviar un código nuevo
        </button>
      </form>
    </div>
  );
}

/** Clave nueva de supervisor: obligatoria cuando entró con una temporal, o voluntaria desde Ajustes. */
export function CambiarClave({ obligatorio, alTerminar }: { obligatorio?: boolean; alTerminar?: () => void }) {
  const [clave, setClave] = useState('');
  const [clave2, setClave2] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const enviar = async () => {
    if (clave.length < 6) return setError('La clave debe tener al menos 6 caracteres');
    if (claveDebil(clave)) return setError('Esa clave es muy fácil de adivinar. Elige otra');
    if (clave !== clave2) return setError('Las dos claves no coinciden');
    setError('');
    setOcupado(true);
    try {
      await cambiarClave(clave);
      avisar('Clave cambiada', 'ok');
      alTerminar?.();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div className="pantalla blanca">
      <Barra titulo={obligatorio ? 'Elige tu clave' : 'Cambiar mi clave'} atras={obligatorio ? false : undefined} />
      <form
        className="contenido"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ocupado) enviar();
        }}
      >
        {obligatorio && (
          <div className="tarjeta aviso-info">
            Entraste con una clave temporal. Elige una clave que solo tú conozcas para continuar.
          </div>
        )}
        <CampoClave rotulo="Clave nueva" valor={clave} alCambiar={setClave} ayuda="Mínimo 6 caracteres." nueva foco />
        <CampoClave rotulo="Repite la clave nueva" valor={clave2} alCambiar={setClave2} nueva />
        {error && <p className="error-texto" role="alert">{error}</p>}
        <button className="boton primario grande" disabled={ocupado}>
          {ocupado ? 'Guardando…' : 'Guardar clave'}
        </button>
        {obligatorio && (
          <button type="button" className="boton" onClick={() => salir(true)}>
            Salir
          </button>
        )}
      </form>
    </div>
  );
}

export function Desvinculado() {
  const pendientes = useEstado((e) => e.sync.pendientes + e.sync.fotosPendientes);
  const plantel = useEstado((e) => e.config?.granja.nombre ?? '');
  const [ocupado, setOcupado] = useState(false);
  const comprobar = async () => {
    setOcupado(true);
    const ok = await comprobarVinculo();
    setOcupado(false);
    if (!ok) avisar('Todavía no. El supervisor lo permite en Ajustes, Teléfonos.', 'info');
  };
  return (
    <div className="pantalla blanca">
      <div className="contenido centrado portada">
        <img src="/marca.webp" alt="" width={96} height={96} />
        <h1 className="titulo">Este teléfono fue desvinculado</h1>
        <p className="suave">
          Un supervisor lo quitó{plantel ? ` de ${plantel}` : ' del plantel'}. Lo guardado aquí no se borra. Hay dos formas de volver a usarlo:
        </p>
        {pendientes > 0 && (
          <div className="tarjeta aviso-atencion">
            Hay {pendientes} registros guardados en este teléfono que no alcanzaron a enviarse. Se enviarán al volver a entrar.
          </div>
        )}
        <button className="boton primario grande" onClick={() => poner({ fase: 'bienvenida', plantelSugerido: plantel || null })}>
          Entrar con la clave del plantel
        </button>
        <p className="chico suave" style={{ maxWidth: 340 }}>
          O el supervisor lo vuelve a permitir desde su equipo, en Ajustes, Teléfonos. Este teléfono se da cuenta solo en un minuto.
        </p>
        <button className="boton" disabled={ocupado} onClick={comprobar}>
          {ocupado ? 'Comprobando…' : 'Ya lo permitió: comprobar ahora'}
        </button>
      </div>
    </div>
  );
}
