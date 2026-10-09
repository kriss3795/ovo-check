import { useEffect } from 'react';
import { tocar } from './lib/app';
import { useEstado } from './lib/estado';
import { AjustePantalla } from './ui/ajustes';
import { Aviso } from './ui/base';
import { Bienvenida, CambiarClave, Desvinculado, Ingreso, SinNube } from './ui/inicio';
import { Falta, FlujoTarea, OpGalpon, OpInicio, Problema } from './ui/operario';
import { GalponDia, PersonaDia, RegistroDetalle, Supervisor } from './ui/supervisor';

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
    case 'ajuste':
      return <AjustePantalla key={`${k}-${ruta.cual}-${ruta.id ?? ''}`} cual={ruta.cual} id={ruta.id} />;
    default:
      return <Falta />;
  }
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
      <Aviso />
    </>
  );
}
