// Controles de la demostración: cambiar entre operario y supervisor, o salir. Discretos, sin tapar la pantalla:
// en el computador van al pie del menú lateral; en el celular, una franja delgada arriba.
import { salirDemo, verComoDemo } from '../lib/app';
import { useEstado } from '../lib/estado';

export function FranjaDemo({ enMenu = false }: { enMenu?: boolean }) {
  const demo = useEstado((e) => Boolean((e.config as any)?.demo) && e.fase === 'app');
  const rol = useEstado((e) => e.usuario?.rol);
  if (!demo) return null;
  const otro = rol === 'operario' ? 'supervisor' : 'operario';
  return (
    <div className={enMenu ? 'demo-menu' : `franja-demo${rol === 'supervisor' ? ' es-sup' : ''}`} role="region" aria-label="Demostración">
      <span className="demo-rotulo">Demostración</span>
      <span className="demo-botones">
        <button onClick={() => verComoDemo(otro)}>Ver como {otro}</button>
        <button onClick={() => salirDemo()}>Salir</button>
      </span>
    </div>
  );
}
