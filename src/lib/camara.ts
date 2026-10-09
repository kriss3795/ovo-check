// Cámara dentro de la app: la foto se toma en el momento, sin acceso a la galería,
// y lleva quemados fecha, hora, galpón, tarea y operario.

export async function abrirCamara(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este equipo no permite usar la cámara desde la app');
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  } catch (e: any) {
    if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
      throw new Error('La app no tiene permiso para usar la cámara. Actívalo en los ajustes del teléfono.');
    }
    if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') throw new Error('No se encontró una cámara en este equipo');
    if (e?.name === 'NotReadableError') throw new Error('Otra app está usando la cámara. Ciérrala e inténtalo de nuevo.');
    throw new Error('No se pudo abrir la cámara');
  }
}

export function cerrarCamara(s: MediaStream | null) {
  s?.getTracks().forEach((t) => t.stop());
}

export function tieneLinterna(s: MediaStream): boolean {
  const pista = s.getVideoTracks()[0];
  const cap = (pista?.getCapabilities?.() ?? {}) as any;
  return Boolean(cap.torch);
}

export async function linterna(s: MediaStream, encendida: boolean) {
  try {
    await s.getVideoTracks()[0]?.applyConstraints({ advanced: [{ torch: encendida } as any] });
  } catch {
    /* sin linterna */
  }
}

const LADO_MAX = 1152;
const PESO_MAX = 150_000;

/** Toma el cuadro actual del video, le quema la marca y lo comprime a un JPEG liviano. */
export async function capturar(video: HTMLVideoElement, lineas: string[]): Promise<Blob> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error('La cámara aún no está lista');
  const esc = Math.min(1, LADO_MAX / Math.max(vw, vh));
  const w = Math.round(vw * esc);
  const h = Math.round(vh * esc);
  const lienzo = document.createElement('canvas');
  lienzo.width = w;
  lienzo.height = h;
  const c = lienzo.getContext('2d')!;
  c.drawImage(video, 0, 0, w, h);

  const letra = Math.max(15, Math.round(Math.min(w, h) * 0.034));
  const margen = Math.round(letra * 0.7);
  const alto = Math.round(letra * 1.32 * lineas.length + margen * 1.4);
  c.fillStyle = 'rgba(0, 0, 0, 0.62)';
  c.fillRect(0, h - alto, w, alto);
  c.fillStyle = '#ffffff';
  c.textBaseline = 'top';
  lineas.forEach((t, i) => {
    c.font = `${i === 0 ? '700' : '500'} ${letra}px "Public Sans Variable", system-ui, sans-serif`;
    c.fillText(t, margen, h - alto + margen * 0.8 + i * letra * 1.32, w - margen * 2);
  });

  let calidad = 0.62;
  let blob = await aBlob(lienzo, calidad);
  while (blob.size > PESO_MAX && calidad > 0.3) {
    calidad -= 0.1;
    blob = await aBlob(lienzo, calidad);
  }
  return blob;
}

function aBlob(lienzo: HTMLCanvasElement, calidad: number): Promise<Blob> {
  return new Promise((ok, mal) =>
    lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo guardar la foto'))), 'image/jpeg', calidad),
  );
}

/** Mantiene la pantalla encendida mientras la cámara está abierta. */
export async function mantenerPantalla(): Promise<() => void> {
  try {
    const candado = await (navigator as any).wakeLock?.request('screen');
    return () => candado?.release?.().catch(() => {});
  } catch {
    return () => {};
  }
}
