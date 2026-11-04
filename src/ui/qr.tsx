// Códigos QR: dibujarlos (para que otro equipo los escanee) y leerlos con la cámara de la app.
import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { X } from 'lucide-react';
import { abrirCamara, cerrarCamara } from '../lib/camara';

/** Dirección de la app que va dentro del QR: la cámara del teléfono la abre directo. */
export const direccionApp = () => window.location.origin;
export const enlaceUnirse = (codigo: string) => `${direccionApp()}/?unir=${codigo}`;
export const enlaceAprobar = (codigo: string) => `${direccionApp()}/?aprobar=${codigo}`;

/** Lo que trae un QR de Ovo Check: un código para sumarse al plantel o para aprobar la entrada de otro equipo. */
export function leerQR(texto: string): { tipo: 'unir' | 'aprobar'; codigo: string } | null {
  const t = texto.trim();
  try {
    const u = new URL(t);
    const unir = u.searchParams.get('unir');
    const aprobar = u.searchParams.get('aprobar');
    if (unir && /^[A-Z0-9]{8,16}$/i.test(unir)) return { tipo: 'unir', codigo: unir.toUpperCase() };
    if (aprobar && /^[A-Z0-9]{8,16}$/i.test(aprobar)) return { tipo: 'aprobar', codigo: aprobar.toUpperCase() };
    return null;
  } catch {
    const c = t.replace(/[\s-]/g, '').toUpperCase();
    if (/^[A-Z0-9]{12}$/.test(c)) return { tipo: 'unir', codigo: c };
    if (/^[A-Z0-9]{10}$/.test(c)) return { tipo: 'aprobar', codigo: c };
    return null;
  }
}

/** Código en grupos de cuatro, para dictarlo o escribirlo si la cámara no lo lee. */
export const codigoLegible = (c: string) => c.replace(/(.{4})(?=.)/g, '$1 ');

/** Dibuja un QR nítido a cualquier tamaño (vectorial). */
export function CodigoQR({ texto, tam = 220, titulo }: { texto: string; tam?: number; titulo: string }) {
  const { celdas, n } = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(texto);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) if (q.isDark(f, c)) d += `M${c} ${f}h1v1h-1z`;
    return { celdas: d, n };
  }, [texto]);
  const borde = 3;
  return (
    <svg className="qr" role="img" aria-label={titulo} width={tam} height={tam} viewBox={`${-borde} ${-borde} ${n + 2 * borde} ${n + 2 * borde}`} shapeRendering="crispEdges">
      <rect x={-borde} y={-borde} width={n + 2 * borde} height={n + 2 * borde} fill="#fff" />
      <path d={celdas} fill="#14231b" />
    </svg>
  );
}

type Detector = { detect: (v: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** Cámara a pantalla completa que lee un QR. Usa el lector del teléfono si existe; si no, uno propio. */
export function EscanerQR({ alLeer, cerrar, ayuda }: { alLeer: (texto: string) => void; cerrar: () => void; ayuda: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const listo = useRef(false);

  useEffect(() => {
    let flujo: MediaStream | null = null;
    let vivo = true;
    let temporizador = 0;
    const lienzo = document.createElement('canvas');
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    let detector: Detector | null = null;
    let jsQR: ((d: Uint8ClampedArray, w: number, h: number) => { data: string } | null) | null = null;

    const leer = async () => {
      if (!vivo || listo.current) return;
      const v = video.current;
      if (v && v.readyState >= 2 && v.videoWidth) {
        try {
          let texto = '';
          if (detector) {
            texto = (await detector.detect(v))[0]?.rawValue ?? '';
          } else if (jsQR && ctx) {
            const escala = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
            lienzo.width = Math.round(v.videoWidth * escala);
            lienzo.height = Math.round(v.videoHeight * escala);
            ctx.drawImage(v, 0, 0, lienzo.width, lienzo.height);
            texto = jsQR(ctx.getImageData(0, 0, lienzo.width, lienzo.height).data, lienzo.width, lienzo.height)?.data ?? '';
          }
          if (texto && !listo.current) {
            listo.current = true;
            navigator.vibrate?.(60);
            alLeer(texto);
            return;
          }
        } catch {
          /* cuadro ilegible: se prueba con el siguiente */
        }
      }
      temporizador = window.setTimeout(leer, 180);
    };

    (async () => {
      try {
        const BD = (window as any).BarcodeDetector;
        if (BD && (await BD.getSupportedFormats?.())?.includes('qr_code')) detector = new BD({ formats: ['qr_code'] });
        else jsQR = (await import('jsqr')).default as any;
        flujo = await abrirCamara();
        if (!vivo) return cerrarCamara(flujo);
        if (video.current) {
          video.current.srcObject = flujo;
          await video.current.play().catch(() => {});
        }
        leer();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo abrir la cámara');
      }
    })();
    return () => {
      vivo = false;
      clearTimeout(temporizador);
      cerrarCamara(flujo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="escaner" role="dialog" aria-label="Escanear código QR">
      <video ref={video} playsInline muted />
      <div className="escaner-marco" aria-hidden />
      <div className="escaner-pie">
        <p>{error || ayuda}</p>
      </div>
      <button className="escaner-cerrar" onClick={cerrar} aria-label="Cerrar la cámara">
        <X size={28} />
      </button>
    </div>
  );
}
