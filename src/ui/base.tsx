import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Bird, Bug, Camera, Check, ChevronLeft, CircleHelp, ClipboardList, CloudOff, CloudUpload, Delete, Droplet, Droplets,
  Egg, Fan, FlaskConical, Layers, Lightbulb, RefreshCw, Scale, ShieldCheck, SprayCan, Thermometer, TriangleAlert,
  Utensils, Warehouse, Wheat, Wrench, X, CircleCheck, ImageOff, Shovel, Download,
} from 'lucide-react';
import * as idb from '../lib/idb';
import { sincronizar } from '../lib/app';
import { avisar, interceptarAtras, useEstado, volver } from '../lib/estado';
import { descargarBlob, obtenerFoto } from '../lib/fotos';
import { urlFoto } from '../lib/nube';
import type { FotoLocal } from '../lib/tipos';
import { haceCuanto } from '../lib/util';

// ------------------------------------------------------------------ íconos de tareas
export const ICONOS: Record<string, { nombre: string; C: typeof Bird }> = {
  termometro: { nombre: 'Temperatura', C: Thermometer },
  agua: { nombre: 'Agua', C: Droplets },
  ave: { nombre: 'Aves', C: Bird },
  bebedero: { nombre: 'Bebederos', C: Droplet },
  comedero: { nombre: 'Comederos', C: Utensils },
  bioseguridad: { nombre: 'Bioseguridad', C: ShieldCheck },
  huevo: { nombre: 'Huevos', C: Egg },
  alimento: { nombre: 'Alimento', C: Wheat },
  nido: { nombre: 'Nidos', C: Layers },
  balanza: { nombre: 'Pesaje', C: Scale },
  ventilacion: { nombre: 'Ventilación', C: Fan },
  luz: { nombre: 'Luz', C: Lightbulb },
  limpieza: { nombre: 'Limpieza', C: SprayCan },
  roedor: { nombre: 'Plagas', C: Bug },
  cama: { nombre: 'Cama o guano', C: Shovel },
  cloro: { nombre: 'Análisis', C: FlaskConical },
  equipo: { nombre: 'Equipos', C: Wrench },
  galpon: { nombre: 'Galpón', C: Warehouse },
  general: { nombre: 'General', C: ClipboardList },
};

export function IconoTarea({ nombre, size = 26 }: { nombre: string; size?: number }) {
  const C = (ICONOS[nombre] ?? ICONOS.general).C;
  return <C size={size} strokeWidth={2} aria-hidden />;
}

// ------------------------------------------------------------------ botón atrás
/** Mientras esté activo, el botón "atrás" del teléfono ejecuta f en lugar de salir de la pantalla. */
export function useAtras(f: () => void, activo = true) {
  const ref = useRef(f);
  ref.current = f;
  useEffect(() => {
    if (!activo) return;
    return interceptarAtras(() => ref.current());
  }, [activo]);
}

export function Barra(p: { titulo: string; sub?: string; atras?: (() => void) | false; derecha?: ReactNode }) {
  return (
    <header className={`barra${p.atras === false ? ' sin-atras' : ''}`}>
      {p.atras !== false && (
        <button className="icono-boton" onClick={p.atras ?? volver} aria-label="Volver">
          <ChevronLeft size={30} />
        </button>
      )}
      <div className="barra-titulo">
        <h1>{p.titulo}</h1>
        {p.sub && <p>{p.sub}</p>}
      </div>
      {p.derecha}
    </header>
  );
}

// ------------------------------------------------------------------ hoja inferior
export function Hoja(p: { titulo: string; cerrar: () => void; children: ReactNode }) {
  useAtras(p.cerrar);
  return (
    <div className="velo" onClick={(e) => e.target === e.currentTarget && p.cerrar()}>
      <div className="hoja" role="dialog" aria-modal="true" aria-label={p.titulo}>
        <div className="hoja-titulo">
          <h2>{p.titulo}</h2>
          <button className="icono-boton" onClick={p.cerrar} aria-label="Cerrar">
            <X size={26} />
          </button>
        </div>
        {p.children}
      </div>
    </div>
  );
}

export function Confirmar(p: {
  titulo: string;
  texto?: string;
  accion: string;
  peligro?: boolean;
  ocupado?: boolean;
  alConfirmar: () => void;
  cerrar: () => void;
}) {
  return (
    <Hoja titulo={p.titulo} cerrar={p.cerrar}>
      {p.texto && <p className="suave">{p.texto}</p>}
      <button className={`boton ${p.peligro ? 'peligro' : 'primario'}`} onClick={p.alConfirmar} disabled={p.ocupado}>
        {p.ocupado ? 'Guardando…' : p.accion}
      </button>
      <button className="boton" onClick={p.cerrar}>
        Cancelar
      </button>
    </Hoja>
  );
}

// ------------------------------------------------------------------ teclado numérico
export function Teclado(p: { valor: string; alCambiar: (v: string) => void; decimales?: number; largo?: number }) {
  const dec = p.decimales ?? 0;
  const largo = p.largo ?? 9;
  const poner = (t: string) => {
    let v = p.valor;
    if (t === 'borrar') v = v.slice(0, -1);
    else if (t === ',') {
      if (!v.includes(',')) v = (v || '0') + ',';
    } else {
      const [ent, frac] = v.split(',');
      if (frac !== undefined) {
        if (frac.length >= dec) return;
      } else if (ent.replace('-', '').length >= largo) return;
      v = v === '0' ? t : v + t;
    }
    p.alCambiar(v);
    try {
      navigator.vibrate?.(8);
    } catch {
      /* sin vibración */
    }
  };
  return (
    <div className="teclado">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
        <button key={n} type="button" onClick={() => poner(n)}>
          {n}
        </button>
      ))}
      {dec > 0 ? (
        <button type="button" className="accion" onClick={() => poner(',')} aria-label="Coma decimal">
          ,
        </button>
      ) : (
        <span />
      )}
      <button type="button" onClick={() => poner('0')}>
        0
      </button>
      <button type="button" className="accion" onClick={() => poner('borrar')} aria-label="Borrar" disabled={!p.valor}>
        <Delete size={28} />
      </button>
    </div>
  );
}

/** Convierte lo tecleado ("1.234,5" o "1234,5") a número. */
export function aNumero(texto: string): number | null {
  const t = texto.trim().replace(/\./g, '').replace(',', '.');
  if (t === '' || t === '.' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Muestra lo tecleado con separador de miles mientras se escribe. */
export function conMiles(texto: string): string {
  const [ent, frac] = texto.split(',');
  const e = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac !== undefined ? `${e},${frac}` : e;
}

export function PuntosPin({ largo, total = 4, mal }: { largo: number; total?: number; mal?: boolean }) {
  return (
    <div className={`puntos-pin${mal ? ' mal sacudir' : ''}`} aria-label={`${largo} de ${total} dígitos`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < largo ? 'lleno' : ''} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ huevo de avance
const HUEVO = 'M20 2.5C29.5 2.5 37 18 37 30.5 37 41 29.5 47.5 20 47.5S3 41 3 30.5C3 18 10.5 2.5 20 2.5Z';

/** Un huevo que se llena a medida que avanzan las tareas del galpón. */
export function Huevo(p: { fraccion: number; estado?: string; size?: number }) {
  const id = useId();
  const f = Math.max(0, Math.min(1, p.fraccion));
  const completo = f >= 1;
  const alerta = p.estado === 'alerta';
  const alto = 45 * f;
  const size = p.size ?? 52;
  return (
    <svg className="huevo" width={size * 0.8} height={size} viewBox="0 0 40 50" aria-hidden>
      <defs>
        <clipPath id={id}>
          <path d={HUEVO} />
        </clipPath>
      </defs>
      <path d={HUEVO} fill={completo ? 'var(--verde-vivo)' : '#fff'} />
      {!completo && <rect x="0" y={47.5 - alto} width="40" height={alto + 3} fill="var(--yema)" clipPath={`url(#${id})`} />}
      <path
        d={HUEVO}
        fill="none"
        stroke={alerta ? 'var(--mal)' : completo ? 'var(--verde)' : '#c9920a'}
        strokeWidth={alerta ? 3 : 2}
      />
      {completo && <path d="M11.5 29.5l6 6L29 23" fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

// ------------------------------------------------------------------ datos que solo están en este teléfono
/** Aviso cuando hay datos esperando hace horas: mientras no se envíen, solo existen en este teléfono. */
export function AvisoSinEnviar() {
  const s = useEstado((e) => e.sync);
  useEstado((e) => e.tic);
  const total = s.pendientes + s.fotosPendientes;
  if (!total || !s.masAntiguo || Date.now() - s.masAntiguo < 6 * 3600000 || s.freno) return null;
  // Si solo esperan fotos porque el servidor no tiene espacio, ya hay otro aviso y no depende de este teléfono.
  if (s.cupo && !s.pendientes) return null;
  return (
    <div className="tarjeta aviso-mal">
      <p className="fuerte">
        {total} {total === 1 ? 'dato lleva' : 'datos llevan'} {haceCuanto(s.masAntiguo).replace(/^hace /, '')} sin enviarse
      </p>
      <p className="chico">
        Por ahora {total === 1 ? 'solo está guardado' : 'solo están guardados'} en este teléfono. Conéctalo a internet y deja la app abierta hasta
        que diga "Todo enviado". No borres la app ni los datos del navegador, y no entres a otro plantel: {total === 1 ? 'se perdería' : 'se perderían'}.
      </p>
      <button className="boton chico" style={{ marginTop: 8 }} onClick={() => sincronizar(true)}>
        Enviar ahora
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ servidor sin espacio
/** Aviso cuando el servidor no está recibiendo registros. Nada se pierde: todo espera en cada teléfono. */
export function AvisoServidor() {
  const freno = useEstado((e) => e.sync.freno);
  const pendientes = useEstado((e) => e.sync.pendientes);
  const lleno = useEstado((e) => e.servidorLleno);
  const esSup = useEstado((e) => e.usuario?.rol === 'supervisor');
  if (freno === 'tope' && pendientes > 0) {
    return (
      <div className="tarjeta aviso-atencion">
        <p className="fuerte">El plantel llegó al máximo de registros por día</p>
        <p className="chico">Lo que falta por enviar queda guardado en este teléfono y se enviará solo en unas horas. Puedes seguir trabajando normal.</p>
      </div>
    );
  }
  if (!lleno && !(freno === 'lleno' && pendientes > 0)) return null;
  return (
    <div className="tarjeta aviso-atencion">
      <p className="fuerte">El servidor está lleno</p>
      <p className="chico">
        {esSup
          ? 'Los registros nuevos quedan guardados en cada teléfono y llegarán solos cuando haya espacio. No se ha perdido nada. Quien administra Ovo Check ya fue avisado.'
          : 'Sigue trabajando normal: lo que anotes queda guardado en este teléfono y se enviará solo cuando haya espacio. No borres la app.'}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ estado de envío
export function Envio({ detalle = false }: { detalle?: boolean }) {
  const s = useEstado((e) => e.sync);
  useEstado((e) => e.tic);
  const total = s.pendientes + s.fotosPendientes;
  let clase = '';
  let texto = 'Todo enviado';
  let Icono = CircleCheck;
  if (!s.enLinea) {
    clase = total ? 'pendiente' : 'sin-senal';
    texto = total ? `Sin señal, ${total} por enviar` : 'Sin señal';
    Icono = CloudOff;
  } else if (s.pendientes && s.freno) {
    // El servidor no está recibiendo registros: quedan guardados en este teléfono.
    clase = 'pendiente';
    texto = `${s.pendientes} en espera`;
    Icono = CloudUpload;
  } else if (total && s.cupo && !s.pendientes) {
    // Los datos ya llegaron; solo esperan fotos porque el servidor no tiene espacio por ahora.
    clase = 'pendiente';
    texto = `${s.fotosPendientes} ${s.fotosPendientes === 1 ? 'foto en espera' : 'fotos en espera'}`;
    Icono = CloudUpload;
  } else if (total) {
    clase = 'pendiente';
    texto = s.ocupado ? `Enviando ${total}` : `${total} por enviar`;
    Icono = s.ocupado ? RefreshCw : CloudUpload;
  } else if (s.error) {
    clase = 'pendiente';
    texto = 'Error al enviar';
    Icono = TriangleAlert;
  }
  return (
    <button className={`envio ${clase}`} onClick={() => sincronizar(true)} aria-label={`${texto}. Tocar para enviar ahora`}>
      <Icono size={18} className={s.ocupado && total ? 'girar' : ''} aria-hidden />
      <span>{texto}</span>
      {detalle && s.ultima && !total && s.enLinea && <span style={{ fontWeight: 500 }}>{haceCuanto(s.ultima)}</span>}
    </button>
  );
}

// ------------------------------------------------------------------ fotos
const urlsLocales = new Map<string, string>();

function useUrlFoto(id: string): string | null {
  const granja = useEstado((e) => e.config?.granja.id ?? '');
  const [url, setUrl] = useState<string | null>(urlsLocales.get(id) ?? null);
  useEffect(() => {
    let vivo = true;
    if (urlsLocales.has(id)) {
      setUrl(urlsLocales.get(id)!);
      return;
    }
    idb
      .leer<FotoLocal>('fotos', id)
      .then((f) => {
        if (!vivo) return;
        if (f?.blob) {
          const u = URL.createObjectURL(f.blob);
          urlsLocales.set(id, u);
          setUrl(u);
        } else setUrl(urlFoto(granja, id));
      })
      .catch(() => vivo && setUrl(urlFoto(granja, id)));
    return () => {
      vivo = false;
    };
  }, [id, granja]);
  return url;
}

export function Foto(p: { id: string; etiqueta?: string; clase?: string; alTocar?: () => void; antigua?: boolean }) {
  const url = useUrlFoto(p.id);
  const [falla, setFalla] = useState(false);
  useEffect(() => setFalla(false), [url]);
  const cuerpo = (
    <>
      {url && !falla ? (
        <img src={url} alt={p.etiqueta ?? 'Foto'} loading="lazy" onError={() => setFalla(true)} />
      ) : (
        <span className="falta" title={falla ? (p.antigua ? 'Foto ya no guardada' : 'Foto aún no llega') : undefined}>
          {falla ? p.clase === 'chica' ? <ImageOff size={20} aria-label="Foto aún no llega" /> : p.antigua ? 'Foto ya no guardada' : 'La foto aún no llega desde el teléfono' : ''}
        </span>
      )}
      {p.etiqueta && p.clase !== 'chica' && <figcaption>{p.etiqueta}</figcaption>}
    </>
  );
  if (p.alTocar && !falla) {
    return (
      <button className={`miniatura ${p.clase ?? ''}`} onClick={p.alTocar} aria-label={`Ver foto ${p.etiqueta ?? ''}`}>
        {cuerpo}
      </button>
    );
  }
  return <figure className={`miniatura ${p.clase ?? ''}`} style={{ margin: 0 }}>{cuerpo}</figure>;
}

export function VisorFoto(p: { id: string; etiqueta?: string; nombre?: string; cerrar: () => void }) {
  const url = useUrlFoto(p.id);
  const granja = useEstado((e) => e.config?.granja.id ?? '');
  const [ampliada, setAmpliada] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  useAtras(p.cerrar);
  const guardar = async () => {
    setOcupado(true);
    const b = await obtenerFoto(granja, p.id);
    setOcupado(false);
    if (!b) return avisar('La foto ya no está disponible', 'mal');
    descargarBlob(b, p.nombre ?? `ovocheck-${p.id.slice(0, 8)}.jpg`);
    avisar('Foto guardada en Descargas', 'ok');
  };
  return (
    <div className="visor-foto">
      <div className="camara-tope" style={{ color: '#fff' }}>
        <button className="icono-boton" onClick={p.cerrar} aria-label="Cerrar foto">
          <X size={28} />
        </button>
        <h2>
          {p.etiqueta ?? 'Foto'}
          <p>{ampliada ? 'Toca para ver completa' : 'Toca la foto para ampliar'}</p>
        </h2>
      </div>
      <div className={`lienzo${ampliada ? ' ampliada' : ''}`} onClick={() => setAmpliada(!ampliada)}>
        {url && <img src={url} alt={p.etiqueta ?? 'Foto'} />}
      </div>
      <div className="camara-pie" style={{ minHeight: 0 }}>
        <button className="boton" style={{ color: '#fff', background: 'transparent', borderColor: 'rgba(255,255,255,.4)' }} onClick={guardar} disabled={ocupado}>
          <Download size={22} aria-hidden /> {ocupado ? 'Guardando…' : 'Guardar en este equipo'}
        </button>
      </div>
    </div>
  );
}

/** Muestra una foto recién tomada (aún no guardada). */
export function FotoBlob({ blob, etiqueta, alTocar }: { blob: Blob; etiqueta?: string; alTocar?: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return (
    <button className="miniatura" onClick={alTocar} type="button" aria-label={`Foto ${etiqueta ?? ''}`}>
      {url && <img src={url} alt={etiqueta ?? 'Foto'} />}
      {etiqueta && <figcaption>{etiqueta}</figcaption>}
    </button>
  );
}

// ------------------------------------------------------------------ varios
export function Aviso() {
  const a = useEstado((e) => e.aviso);
  if (!a) return null;
  return (
    <div className={`aviso ${a.tipo}`} role="status" key={a.id}>
      {a.texto}
    </div>
  );
}

export function Interruptor(p: { activo: boolean; alCambiar: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" className="interruptor" role="switch" aria-checked={p.activo} onClick={() => p.alCambiar(!p.activo)}>
      <span className="crece" style={{ textAlign: 'left' }}>
        {p.children}
      </span>
      <span className="pista" />
    </button>
  );
}

export function Vacio(p: { titulo: string; children?: ReactNode; icono?: ReactNode }) {
  return (
    <div className="vacio">
      {p.icono ?? <CircleHelp size={38} aria-hidden />}
      <strong>{p.titulo}</strong>
      {p.children}
    </div>
  );
}

export function Confirmado({ texto, detalle }: { texto: string; detalle?: string }) {
  return (
    <div className="confirmado" role="status">
      <div>
        <div className="circulo">
          <Check size={72} strokeWidth={3} />
        </div>
        <p>{texto}</p>
        {detalle && <small>{detalle}</small>}
      </div>
    </div>
  );
}

export { Camera as IconoCamara };
