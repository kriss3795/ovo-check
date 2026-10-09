import { useState } from 'react';
import { Bell, BellOff, Check, Download, X } from 'lucide-react';
import { activarAvisos, desactivarAvisos, esIosSinInstalar, estaInstalada, instalarApp, probarAviso } from '../lib/avisos';
import { avisar, useEstado } from '../lib/estado';
import { mensajeError } from '../lib/nube';
import { Barra } from './base';

const CLAVE_DESPUES = 'oc_avisos_despues';

async function activar(): Promise<void> {
  try {
    const ok = await activarAvisos();
    if (ok) avisar('Notificaciones activadas', 'ok');
    else avisar('El teléfono no dio permiso para las notificaciones', 'mal');
  } catch (e) {
    avisar(mensajeError(e), 'mal');
  }
}

/** Invitación a activar las notificaciones. Se muestra hasta que la persona decide. */
export function TarjetaAvisos() {
  const estado = useEstado((e) => e.avisos);
  const usuario = useEstado((e) => e.usuario);
  const [ocupado, setOcupado] = useState(false);
  const [oculta, setOculta] = useState(() => {
    try {
      return Number(localStorage.getItem(CLAVE_DESPUES) ?? 0) > Date.now();
    } catch {
      return false;
    }
  });
  if (estado !== 'apagado' || oculta || !usuario) return null;
  const esSup = usuario.rol === 'supervisor';
  return (
    <section className="tarjeta aviso-info">
      <div className="linea-h" style={{ alignItems: 'flex-start' }}>
        <Bell size={26} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
        <div className="crece">
          <p className="fuerte">{esSup ? 'Activa las notificaciones en este equipo' : 'Activa los recordatorios en este teléfono'}</p>
          <p className="chico">
            {esSup
              ? 'Te avisamos al instante cuando un operario informa un problema, y si quedan tareas sin registrar al cierre de la mañana y de la tarde.'
              : 'Te avisamos si quedan tareas por registrar al cierre de la mañana y de la tarde.'}
          </p>
        </div>
      </div>
      <div className="linea-h" style={{ marginTop: 12 }}>
        <button
          className="boton primario chico crece"
          disabled={ocupado}
          onClick={async () => {
            setOcupado(true);
            await activar();
            setOcupado(false);
          }}
        >
          {ocupado ? 'Activando…' : 'Activar'}
        </button>
        <button
          className="boton chico"
          onClick={() => {
            try {
              localStorage.setItem(CLAVE_DESPUES, String(Date.now() + 3 * 86400000));
            } catch {
              /* sin almacenamiento */
            }
            setOculta(true);
          }}
        >
          Ahora no
        </button>
      </div>
    </section>
  );
}

/** Botón para instalar la app en la pantalla de inicio, cuando el navegador lo permite. */
export function BotonInstalar({ clase = 'boton' }: { clase?: string }) {
  const instalable = useEstado((e) => e.instalable);
  if (!instalable || estaInstalada()) return null;
  return (
    <button
      className={clase}
      onClick={async () => {
        if (await instalarApp()) avisar('Ovo Check quedó instalada en este equipo', 'ok');
      }}
    >
      <Download size={22} aria-hidden /> Instalar la app en este equipo
    </button>
  );
}

/** Ajustes > Notificaciones (supervisor). */
export function PaginaAvisos() {
  const estado = useEstado((e) => e.avisos);
  const [ocupado, setOcupado] = useState('');
  const hacer = async (cual: string, f: () => Promise<void>) => {
    setOcupado(cual);
    try {
      await f();
    } catch (e) {
      avisar(mensajeError(e), 'mal');
    } finally {
      setOcupado('');
    }
  };
  return (
    <div className="pantalla">
      <Barra titulo="Notificaciones" sub="En este equipo" />
      <div className="contenido">
        <div className={`tarjeta ${estado === 'activo' ? 'aviso-ok' : 'aviso-atencion'}`}>
          <div className="linea-h">
            {estado === 'activo' ? <Check size={26} aria-hidden /> : <BellOff size={26} aria-hidden />}
            <p className="fuerte crece">
              {estado === 'activo' && 'Activadas en este equipo'}
              {estado === 'apagado' && 'Desactivadas en este equipo'}
              {estado === 'bloqueado' && 'Bloqueadas en este equipo'}
              {estado === 'no_disponible' && 'No disponibles en este navegador'}
            </p>
          </div>
          {estado === 'bloqueado' && (
            <p className="chico" style={{ marginTop: 6 }}>
              El teléfono o el navegador tiene bloqueadas las notificaciones de Ovo Check. Actívalas en los ajustes del teléfono (Aplicaciones, Ovo Check o Chrome, Notificaciones) y vuelve a esta pantalla.
            </p>
          )}
          {estado === 'no_disponible' && (
            <p className="chico" style={{ marginTop: 6 }}>
              {esIosSinInstalar()
                ? 'En iPhone, primero agrega Ovo Check a la pantalla de inicio (botón Compartir, Agregar a inicio) y ábrela desde ahí.'
                : 'Usa Chrome en Android o en el computador para recibir notificaciones.'}
            </p>
          )}
        </div>
        {estado === 'apagado' && (
          <button className="boton primario grande" disabled={Boolean(ocupado)} onClick={() => hacer('activar', activar)}>
            <Bell size={24} aria-hidden /> {ocupado === 'activar' ? 'Activando…' : 'Activar notificaciones'}
          </button>
        )}
        {estado === 'activo' && (
          <>
            <button
              className="boton primario"
              disabled={Boolean(ocupado)}
              onClick={() =>
                hacer('probar', async () => {
                  await probarAviso();
                  avisar('Enviada. Debe aparecer en unos segundos.', 'ok');
                })
              }
            >
              {ocupado === 'probar' ? 'Enviando…' : 'Enviar una notificación de prueba'}
            </button>
            <button
              className="boton"
              disabled={Boolean(ocupado)}
              onClick={() =>
                hacer('apagar', async () => {
                  await desactivarAvisos();
                  avisar('Notificaciones desactivadas en este equipo', 'info');
                })
              }
            >
              <X size={20} aria-hidden /> Desactivar en este equipo
            </button>
          </>
        )}
        <BotonInstalar />
        <div className="tarjeta">
          <p className="fuerte" style={{ marginBottom: 8 }}>
            Qué se notifica
          </p>
          <div className="pila chico">
            <p>
              <b>Al supervisor, al instante:</b> cuando un operario informa un problema o marca "Hay un problema" en una revisión, y cuando una lectura de medidor es menor que la anterior.
            </p>
            <p>
              <b>Al supervisor y a los encargados:</b> las tareas que siguen sin registrar, una vez después del mediodía (las de la mañana) y otra en la noche (las de la tarde).
            </p>
            <p>
              <b>Al supervisor, los lunes:</b> un recordatorio para descargar las fotos que la nube borrará esa semana.
            </p>
            <p className="suave">Cada persona las activa en su propio teléfono. Conviene instalar la app en la pantalla de inicio para que lleguen aunque esté cerrada.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
