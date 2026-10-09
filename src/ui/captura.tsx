import { useEffect, useRef, useState } from 'react';
import { Camera, Flashlight, FlashlightOff, X } from 'lucide-react';
import { abrirCamara, capturar, cerrarCamara, linterna, mantenerPantalla, tieneLinterna } from '../lib/camara';
import { vibrar } from '../lib/util';
import { useAtras } from './base';

function useCamara() {
  const video = useRef<HTMLVideoElement>(null);
  const flujo = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<'abriendo' | 'lista' | 'error'>('abriendo');
  const [error, setError] = useState('');
  const [luz, setLuz] = useState<boolean | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    let soltar = () => {};
    setEstado('abriendo');
    mantenerPantalla().then((f) => (vivo ? (soltar = f) : f()));
    abrirCamara()
      .then(async (s) => {
        if (!vivo) return cerrarCamara(s);
        flujo.current = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play().catch(() => {});
        if (!vivo) return;
        setLuz(tieneLinterna(s) ? false : null);
        setEstado('lista');
      })
      .catch((e) => {
        if (!vivo) return;
        setError(e.message);
        setEstado('error');
      });
    return () => {
      vivo = false;
      soltar();
      cerrarCamara(flujo.current);
      flujo.current = null;
    };
  }, [intento]);

  const alternarLuz = () => {
    if (luz === null || !flujo.current) return;
    linterna(flujo.current, !luz);
    setLuz(!luz);
  };
  return { video, estado, error, luz, alternarLuz, reintentar: () => setIntento((n) => n + 1) };
}

function BotonLuz({ luz, alternar }: { luz: boolean | null; alternar: () => void }) {
  if (luz === null) return null;
  return (
    <button className="icono-boton" onClick={alternar} aria-label={luz ? 'Apagar linterna' : 'Encender linterna'} aria-pressed={luz}>
      {luz ? <Flashlight size={26} color="#ffc422" /> : <FlashlightOff size={26} />}
    </button>
  );
}

/** Cámara de la app. La foto se toma en el momento: no hay forma de elegir una de la galería. */
export function Camara(p: {
  titulo: string;
  sub?: string;
  /** Texto que se quema sobre la foto (se calcula al disparar, con la hora de ese instante). */
  marca: () => string[];
  alCapturar: (blob: Blob) => void;
  alCancelar: () => void;
  /** Si se entrega, cuando la cámara no funciona se ofrece continuar sin foto. */
  sinFoto?: () => void;
  textoSinFoto?: string;
  /** Foto opcional: muestra siempre un botón para continuar sin ella. */
  opcional?: boolean;
}) {
  const cam = useCamara();
  const [toma, setToma] = useState<{ blob: Blob; url: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [destello, setDestello] = useState(0);
  useAtras(() => (toma ? descartar() : p.alCancelar()));

  const descartar = () => {
    if (toma) URL.revokeObjectURL(toma.url);
    setToma(null);
  };
  const disparar = async () => {
    if (ocupado || cam.estado !== 'lista' || !cam.video.current) return;
    setOcupado(true);
    try {
      const blob = await capturar(cam.video.current, p.marca());
      vibrar(30);
      setDestello((n) => n + 1);
      setToma({ blob, url: URL.createObjectURL(blob) });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setOcupado(false);
    }
  };
  const usar = () => {
    if (!toma) return;
    const b = toma.blob;
    URL.revokeObjectURL(toma.url);
    p.alCapturar(b);
  };

  return (
    <div className="camara" role="dialog" aria-label={p.titulo}>
      <div className="camara-tope">
        <button className="icono-boton" onClick={() => (toma ? descartar() : p.alCancelar())} aria-label="Cancelar">
          <X size={28} />
        </button>
        <h2>
          {p.titulo}
          {p.sub && <p>{p.sub}</p>}
        </h2>
        {!toma && <BotonLuz luz={cam.luz} alternar={cam.alternarLuz} />}
      </div>
      <div className="camara-visor">
        <video ref={cam.video} playsInline muted autoPlay style={{ display: toma || cam.estado === 'error' ? 'none' : 'block' }} />
        {toma && <img src={toma.url} alt="Foto tomada" />}
        {destello > 0 && !toma && <span className="destello" key={destello} />}
        {cam.estado === 'error' && (
          <div className="mensaje">
            <Camera size={44} aria-hidden />
            <p style={{ fontSize: 19, fontWeight: 700 }}>{cam.error}</p>
            <button className="boton" onClick={cam.reintentar}>
              Intentar de nuevo
            </button>
            {p.sinFoto && (
              <button className="boton" onClick={p.sinFoto}>
                {p.textoSinFoto ?? 'Seguir sin foto'}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="camara-pie">
        {toma ? (
          <>
            <button className="boton" onClick={descartar}>
              Repetir
            </button>
            <button className="boton primario" onClick={usar}>
              Usar foto
            </button>
          </>
        ) : (
          cam.estado !== 'error' && (
            <>
              {p.opcional && p.sinFoto && <span style={{ flex: 1 }} />}
              <button className="disparador" onClick={disparar} disabled={cam.estado !== 'lista' || ocupado} aria-label="Tomar foto" />
              {p.opcional && p.sinFoto && (
                <span style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="boton chico" onClick={p.sinFoto}>
                    {p.textoSinFoto ?? 'Sin foto'}
                  </button>
                </span>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
