import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { aprobarQrEntrada, haySesionSupervisor, salirDemo, tocar, verComoDemo } from './lib/app';
import { avisar, poner, useEstado } from './lib/estado';
import { mensajeError } from './lib/nube';
import { AjustePantalla } from './ui/ajustes';
import { Aviso, Confirmar } from './ui/base';
import { Bienvenida, CambiarClave, Desvinculado, Ingreso, SinNube } from './ui/inicio';
import { Falta, FlujoTarea, OpGalpon, OpInicio, Problema } from './ui/operario';
import { GalponDia, Navegacion, PersonaDia, RegistroDetalle, Supervisor } from './ui/supervisor';
import { AreaInicio, FormGestion } from './ui/areas';

const consulta = typeof window !== 'undefined' ? window.matchMedia('(min-width: 900px)') : null;
/** Pantalla ancha (computador): el menú de secciones queda siempre a la izquierda, como en un programa. */
function useEscritorio() {
  return useSyncExternalStore(
    (f) => (consulta?.addEventListener('change', f), () => consulta?.removeEventListener('change', f)),
    () => Boolean(consulta?.matches),
  );
}

/** En el computador, las pantallas de detalle del supervisor se abren al lado del menú, a todo el ancho. */
function ConMenu({ children }: { children: ReactNode }) {
  const escritorio = useEscritorio();
  const sup = useEstado((e) => e.usuario?.rol === 'supervisor');
  const tab = useEstado((e) => e.ruta[0]?.tab ?? 'hoy');
  if (!escritorio || !sup) return <>{children}</>;
  return (
    <div className="sup escritorio">
      <div className="sup-principal">{children}</div>
      <Navegacion tab={tab} raiz />
    </div>
  );
}

function Pantalla() {
  const fase = useEstado((e) => e.fase);
  const ruta = useEstado((e) => e.ruta[e.ruta.length - 1]);
  const profundidad = useEstado((e) => e.ruta.length);
  const cambiarClave = useEstado((e) => e.cambiarClave);

  if (fase === 'cargando') {
    return (
      <div className="pantalla blanca">
        <div className="contenido centrado portada">
          <img className="logo" src="/logo.webp" alt="Ovo Check" />
        </div>
      </div>
    );
  }
  if (fase === 'sin_nube') return <SinNube />;
  if (fase === 'bienvenida') return <Bienvenida />;
  if (fase === 'desvinculado') return <Desvinculado />;
  if (fase === 'ingreso') return <Ingreso />;
  if (cambiarClave) return <CambiarClave obligatorio />;
  if (!ruta) return <Ingreso />;

  // La clave incluye la profundidad para que cada pantalla nueva parta limpia.
  const k = `${profundidad}-${ruta.p}`;
  if (ruta.p === 'sup') return <Supervisor key={k} tab={ruta.tab ?? 'hoy'} />;
  return <ConMenu>{detalle(ruta, k)}</ConMenu>;
}

function detalle(ruta: { p: string; [k: string]: any }, k: string) {
  switch (ruta.p) {
    case 'op':
      return <OpInicio key={k} />;
    case 'ronda':
      return <OpInicio key={k} embebido />;
    case 'galpon':
      return <OpGalpon key={k} id={ruta.id} />;
    case 'tarea':
      return <FlujoTarea key={k} galpon={ruta.galpon} tarea={ruta.tarea} corrige={ruta.corrige} anular={ruta.anular} />;
    case 'problema':
      return <Problema key={k} galpon={ruta.galpon} />;
    case 'registro':
      return <RegistroDetalle key={k} id={ruta.id} />;
    case 'sup':
      return <Supervisor key={k} tab={ruta.tab ?? 'hoy'} />;
    case 'galpondia':
      return <GalponDia key={k} id={ruta.id} fecha={ruta.fecha} />;
    case 'personadia':
      return <PersonaDia key={k} id={ruta.id} />;
    case 'form':
      return <FormGestion key={k} tipo={ruta.tipo} sub={ruta.sub} corrige={ruta.corrige} anular={ruta.anular} />;
    case 'area':
      return <AreaInicio key={k} area={ruta.area} />;
    case 'ajuste':
      return <AjustePantalla key={`${k}-${ruta.cual}-${ruta.id ?? ''}`} cual={ruta.cual} id={ruta.id} />;
    default:
      return <Falta />;
  }
}

/** Aviso de versión nueva. Solo aparece en las pantallas principales, nunca en medio de un registro. */
function VersionNueva() {
  const hay = useEstado((e) => e.actualizacion);
  const tranquilo = useEstado((e) => e.fase !== 'app' || e.ruta.length <= 1);
  if (!hay || !tranquilo) return null;
  return (
    <div className="version-nueva" role="status">
      <span>Hay una versión nueva de Ovo Check</span>
      <button onClick={() => window.location.reload()}>Actualizar</button>
      <button className="cerrar" onClick={() => poner({ actualizacion: false })} aria-label="Más tarde">
        ×
      </button>
    </div>
  );
}

/**
 * El supervisor escaneó (o abrió con la cámara) el QR que muestra un computador: confirma y ese equipo entra con su nombre.
 * Si todavía no ha entrado a la app, la pregunta espera a que lo haga.
 */
function AprobarEntrada() {
  const codigo = useEstado((e) => e.qrAprobar);
  const listo = useEstado((e) => e.fase === 'app' && e.usuario?.rol === 'supervisor' && !e.cambiarClave);
  const operario = useEstado((e) => e.fase === 'app' && e.usuario?.rol === 'operario');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (codigo && operario) {
      poner({ qrAprobar: null });
      avisar('Solo un supervisor puede aprobar la entrada en un computador.', 'mal');
    }
  }, [codigo, operario]);
  if (!codigo || !listo) return null;
  const cerrar = () => poner({ qrAprobar: null });
  return (
    <Confirmar
      titulo="¿Entrar en el otro equipo con tu usuario?"
      texto="Ese equipo quedará con tu sesión de supervisor y podrá ver y cambiar todo el plantel. Apruébalo solo si es tu computador o lo tienes delante."
      accion="Sí, entrar"
      ocupado={ocupado}
      cerrar={cerrar}
      alConfirmar={async () => {
        if (!haySesionSupervisor()) {
          cerrar();
          return avisar('Primero entra con tu clave de supervisor en este teléfono.', 'mal');
        }
        setOcupado(true);
        try {
          const equipo = await aprobarQrEntrada(codigo);
          avisar(`Listo: ${equipo === 'Computador' ? 'el computador' : equipo} ya entró con tu usuario`, 'ok');
        } catch (e) {
          avisar(mensajeError(e), 'mal');
        } finally {
          setOcupado(false);
          cerrar();
        }
      }}
    />
  );
}

/** Franja fija en la demostración: cambiar entre operario y supervisor con un toque, o salir. */
function FranjaDemo() {
  const demo = useEstado((e) => Boolean((e.config as any)?.demo) && e.fase === 'app');
  const rol = useEstado((e) => e.usuario?.rol);
  const nombre = useEstado((e) => e.usuario?.nombre);
  if (!demo) return null;
  return (
    <div className="franja-demo" role="region" aria-label="Demostración">
      <span>
        <b>Demostración</b> con datos de ejemplo. Estás viendo la app como {rol === 'operario' ? `operario (${nombre})` : 'supervisor'}.
      </span>
      <span className="franja-demo-botones">
        <button onClick={() => verComoDemo(rol === 'operario' ? 'supervisor' : 'operario')}>Ver como {rol === 'operario' ? 'supervisor' : 'operario'}</button>
        <button onClick={() => salirDemo()}>Salir</button>
      </span>
    </div>
  );
}

export function App() {
  useEffect(() => {
    const f = () => tocar();
    window.addEventListener('pointerdown', f, { passive: true });
    return () => window.removeEventListener('pointerdown', f);
  }, []);
  return (
    <>
      <Pantalla />
      <FranjaDemo />
      <AprobarEntrada />
      <Aviso />
      <VersionNueva />
    </>
  );
}
