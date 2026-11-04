// Registros de gestión: sala de proceso, bodega, despachos, recuperación, insumos y sanidad.
// Son formularios simples, que funcionan sin señal igual que las tareas de los galpones. Al operario no se le
// muestran saldos ni cálculos: anota lo que ve y la app le avisa al supervisor lo que no calza.
import { useMemo, useState, type ReactNode } from 'react';
import { Camera, ChevronRight, ClipboardList, Plus, Trash2 } from 'lucide-react';
import { ahora, guardarRegistro, registroGestion, type FotoNueva } from '../lib/app';
import { avisar, cerrarPantalla, ir, useEstado } from '../lib/estado';
import {
  AREAS_INFO, BODEGA_INSUMOS, POZO_MERMA, activos, areasDe, bodegasDe, calibresDe, enEnvases, envasesDe, lotesDe, mermasDe, nombreBodega,
  semanaDeEdad, sumaHuevos, tituloGestion, resumenGestion, lotesEfectivos, loteIdDe } from '../lib/modulos';
import type { Area, Config, Envases, ItemHuevos, Mov, Registro, RegistroLocal } from '../lib/tipos';
import { fechaHora, fechaLocal, hora, num, sumarDias, uid } from '../lib/util';
import { leerNumero } from '../lib/util';
import { Barra, Confirmado, Envio, FotoBlob, Hoja, useAtras } from './base';
import { Camara } from './captura';
import { Falta, useIndice } from './operario';

// ------------------------------------------------------------------ piezas comunes
const entero = (t: string): number | null => {
  const s = t.replace(/[^\d]/g, '');
  return s === '' ? null : Number(s);
};
const decimal = (t: string): number | null => {
  const n = leerNumero(t);
  return n != null && n >= 0 ? n : null;
};
const texto = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

/** Cantidad de huevos en cajas, bandejas y huevos sueltos. Devuelve el total en huevos (null = no anotó nada). */
export function CantidadHuevos(p: { etiqueta: string; valor: number | null; alCambiar: (n: number | null) => void; envases: Envases; nota?: ReactNode }) {
  const porCaja = p.envases.huevos_bandeja * p.envases.bandejas_caja;
  const inicial = () => {
    if (p.valor == null) return { c: '', b: '', h: '' };
    let n = p.valor;
    const c = Math.floor(n / porCaja);
    n -= c * porCaja;
    const b = Math.floor(n / p.envases.huevos_bandeja);
    n -= b * p.envases.huevos_bandeja;
    return { c: c ? String(c) : '', b: b ? String(b) : '', h: n ? String(n) : c || b ? '' : '0' };
  };
  const [v, setV] = useState(inicial);
  const cambiar = (campo: 'c' | 'b' | 'h', t: string) => {
    const nv = { ...v, [campo]: t.replace(/[^\d]/g, '').slice(0, 7) };
    setV(nv);
    const vacio = nv.c === '' && nv.b === '' && nv.h === '';
    p.alCambiar(vacio ? null : (entero(nv.c) ?? 0) * porCaja + (entero(nv.b) ?? 0) * p.envases.huevos_bandeja + (entero(nv.h) ?? 0));
  };
  const caja = (campo: 'c' | 'b' | 'h', rotulo: string) => (
    <label className="cantidad-parte">
      <input className="entrada" inputMode="numeric" value={v[campo]} onChange={(e) => cambiar(campo, e.target.value)} aria-label={`${p.etiqueta}: ${rotulo}`} />
      <span>{rotulo}</span>
    </label>
  );
  return (
    <div className="cantidad">
      <p className="fuerte">{p.etiqueta}</p>
      <div className="cantidad-partes">
        {caja('c', 'cajas')}
        {caja('b', 'bandejas')}
        {caja('h', 'huevos')}
      </div>
      {p.nota}
    </div>
  );
}

/** Número simple con su unidad. */
function CampoNumero(p: { etiqueta: string; valor: number | null; alCambiar: (n: number | null) => void; unidad?: string; decimales?: boolean; ayuda?: string }) {
  const [t, setT] = useState(texto(p.valor));
  return (
    <label className="campo">
      <span>{p.etiqueta}</span>
      <div className="con-unidad">
        <input
          className="entrada"
          inputMode={p.decimales ? 'decimal' : 'numeric'}
          value={t}
          onChange={(e) => {
            const s = e.target.value.slice(0, 12);
            setT(s);
            p.alCambiar(p.decimales ? decimal(s) : entero(s));
          }}
        />
        {p.unidad && <span className="suave">{p.unidad}</span>}
      </div>
      {p.ayuda && <small>{p.ayuda}</small>}
    </label>
  );
}

function CampoTexto(p: { etiqueta: string; valor: string; alCambiar: (t: string) => void; largo?: number; placeholder?: string; area?: boolean; lista?: string[] }) {
  const id = useMemo(() => `l${uid().slice(0, 8)}`, []);
  return (
    <label className="campo">
      <span>{p.etiqueta}</span>
      {p.area ? (
        <textarea className="entrada" value={p.valor} onChange={(e) => p.alCambiar(e.target.value)} maxLength={p.largo ?? 300} placeholder={p.placeholder} />
      ) : (
        <input className="entrada" value={p.valor} onChange={(e) => p.alCambiar(e.target.value)} maxLength={p.largo ?? 80} placeholder={p.placeholder} list={p.lista ? id : undefined} />
      )}
      {p.lista && (
        <datalist id={id}>
          {p.lista.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      )}
    </label>
  );
}

function Elegir<T extends string>(p: { etiqueta: string; valor: T; opciones: { id: T; nombre: string }[]; alCambiar: (v: T) => void; ayuda?: string }) {
  if (p.opciones.length <= 3) {
    return (
      <div className="campo">
        <span className="rotulo">{p.etiqueta}</span>
        <div className="segmentos">
          {p.opciones.map((o) => (
            <button key={o.id} type="button" aria-pressed={p.valor === o.id} onClick={() => p.alCambiar(o.id)}>
              {o.nombre}
            </button>
          ))}
        </div>
        {p.ayuda && <small>{p.ayuda}</small>}
      </div>
    );
  }
  return (
    <label className="campo">
      <span>{p.etiqueta}</span>
      <select className="entrada" value={p.valor} onChange={(e) => p.alCambiar(e.target.value as T)}>
        {p.opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
      </select>
      {p.ayuda && <small>{p.ayuda}</small>}
    </label>
  );
}

/** Fotos de respaldo tomadas en el momento (guía de despacho, frasco de la vacuna, hallazgo). */
function useFotos(titulo: string, lugar: string, regId: string) {
  const usuario = useEstado((e) => e.usuario)!;
  const [fotos, setFotos] = useState<FotoNueva[]>([]);
  const [camara, setCamara] = useState<string | null>(null);
  const vista = camara ? (
    <Camara
      titulo={`Foto: ${camara}`}
      sub={titulo}
      opcional
      marca={() => [`${lugar} | ${titulo}`, `${fechaHora(ahora())} | ${usuario.nombre}`, `${camara} | Reg. ${regId.slice(0, 8).toUpperCase()}`]}
      alCapturar={(blob) => {
        setFotos((f) => [...f, { id: uid(), etiqueta: camara, blob }]);
        setCamara(null);
      }}
      alCancelar={() => setCamara(null)}
      sinFoto={() => setCamara(null)}
      textoSinFoto="Sin foto"
    />
  ) : null;
  const bloque = (etiqueta: string) => (
    <div className="pila" style={{ gap: 8 }}>
      {fotos.length > 0 && (
        <div className="fotos-chicas">
          {fotos.map((f) => (
            <div key={f.id} className="foto-chica">
              <FotoBlob blob={f.blob} etiqueta={f.etiqueta} />
              <button className="icono-boton" onClick={() => setFotos((l) => l.filter((x) => x.id !== f.id))} aria-label="Quitar foto">
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="boton" onClick={() => setCamara(etiqueta)}>
        <Camera size={20} aria-hidden /> {fotos.length ? 'Otra foto' : `Foto: ${etiqueta.toLowerCase()} (opcional)`}
      </button>
    </div>
  );
  return { fotos, vista, bloque };
}

/** Armazón de un formulario: barra, contenido, botón de guardar y la confirmación. */
function Formulario(p: {
  titulo: string;
  sub?: string;
  children: ReactNode;
  listo: boolean;
  faltaTexto?: string;
  guardar: () => Promise<void>;
  textoGuardar?: string;
  superpuesto?: ReactNode;
}) {
  const [hecho, setHecho] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  useAtras(cerrarPantalla, !hecho && !p.superpuesto);
  if (p.superpuesto) return <>{p.superpuesto}</>;
  if (hecho) return <Confirmado texto="Guardado" detalle={navigator.onLine ? 'Enviando' : 'Se enviará cuando haya señal'} />;
  const enviar = async () => {
    if (ocupado) return;
    setOcupado(true);
    try {
      await p.guardar();
      setHecho(true);
      setTimeout(cerrarPantalla, 900);
    } catch (e: any) {
      console.error(e);
      avisar(e?.message || 'No se pudo guardar en el teléfono. Revisa que tenga espacio libre.', 'mal');
      setOcupado(false);
    }
  };
  return (
    <div className="pantalla">
      <Barra titulo={p.titulo} sub={p.sub} atras={cerrarPantalla} derecha={<Envio />} />
      <div className="contenido">{p.children}</div>
      <div className="pie">
        {!p.listo && p.faltaTexto && <p className="chico suave centro">{p.faltaTexto}</p>}
        <button className="boton primario grande" disabled={!p.listo || ocupado} onClick={enviar}>
          {ocupado ? 'Guardando…' : (p.textoGuardar ?? 'Guardar')}
        </button>
      </div>
    </div>
  );
}

/** Valores de un registro original, para corregirlo. */
const deItems = (items: ItemHuevos[] | undefined): Record<string, number | null> => Object.fromEntries((items ?? []).map((x) => [x.k, x.huevos]));
const aItems = (m: Record<string, number | null>): ItemHuevos[] =>
  Object.entries(m)
    .filter(([, v]) => v != null && v > 0)
    .map(([k, v]) => ({ k, huevos: v! }));

function diferenciaTexto(esperado: number, anotado: number, e: Envases): string {
  const d = anotado - esperado;
  return d < 0 ? `faltan ${enEnvases(-d, e)}` : `sobran ${enEnvases(d, e)}`;
}

async function guardarGestion(reg: Registro, fotos: FotoNueva[]) {
  await guardarRegistro(reg, fotos);
}

// ------------------------------------------------------------------ pantalla de un formulario según la ruta
export function FormGestion(p: { tipo: string; sub?: string; corrige?: string; anular?: boolean }) {
  const indice = useIndice();
  const original = p.corrige ? indice.porId.get(p.corrige) : undefined;
  if (p.corrige && !original) return <Falta />;
  if (p.anular && original) return <AnularGestion original={original} />;
  const sub = p.sub ?? original?.detalle?.sub;
  switch (p.tipo) {
    case 'proceso':
      return <FormProceso original={original} />;
    case 'bodega':
      return <FormBodega sub={sub ?? 'conteo'} original={original} />;
    case 'despacho':
      return <FormDespacho original={original} />;
    case 'recuperacion':
      return <FormRecuperacion original={original} />;
    case 'insumo':
      return <FormInsumo sub={sub ?? 'recepcion'} original={original} />;
    case 'sanidad':
      return <FormSanidad sub={sub ?? 'vacuna'} original={original} />;
    default:
      return <Falta />;
  }
}

/** Anular un registro de gestión: queda a la vista con su motivo y deja de contar en el inventario. Solo el supervisor. */
function AnularGestion({ original }: { original: RegistroLocal }) {
  const config = useEstado((e) => e.config)!;
  const [motivo, setMotivo] = useState('');
  const opciones = ['Registro duplicado', 'Dato equivocado', 'No ocurrió'];
  return (
    <Formulario
      titulo="Anular registro"
      sub={tituloGestion(config, original)}
      listo={motivo.trim().length >= 3}
      faltaTexto="Elige o escribe el motivo"
      textoGuardar="Anular registro"
      guardar={() =>
        guardarGestion(
          registroGestion({ tipo: original.tipo, lugar: original.galpon_id, lugarNombre: original.galpon_nombre, detalle: { ...original.detalle }, corrige: original, motivo: motivo.trim(), anulado: true }),
          [],
        )
      }
    >
      <div className="tarjeta">
        <p className="fuerte">{tituloGestion(config, original)}</p>
        <p className="chico">{resumenGestion(config, original)}</p>
      </div>
      <p className="suave">El registro queda en el historial marcado como anulado, con su motivo, y deja de contar en el inventario.</p>
      <div className="opciones">
        {opciones.map((o) => (
          <button key={o} type="button" className="opcion" aria-pressed={motivo === o} onClick={() => setMotivo(o)}>
            {o}
          </button>
        ))}
      </div>
      <CampoTexto etiqueta="Otro motivo" valor={opciones.includes(motivo) ? '' : motivo} alCambiar={setMotivo} largo={120} />
    </Formulario>
  );
}

const motivoCorreccion = (original: RegistroLocal | undefined) => (original ? 'Corrección' : '');

// ------------------------------------------------------------------ sala de proceso
function FormProceso({ original }: { original?: RegistroLocal }) {
  const config = useEstado((e) => e.config)!;
  const e = envasesDe(config);
  const d = original?.detalle ?? {};
  const galpones = config.galpones.filter((g) => g.activo && (g.tipo ?? 'produccion') === 'produccion');
  const calibres = activos(calibresDe(config));
  const mermas = activos(mermasDe(config));
  const bodegas = activos(bodegasDe(config));
  const [origen, setOrigen] = useState<Record<string, number | null>>(() => Object.fromEntries((d.origen ?? []).map((o: any) => [o.galpon_id, o.huevos])));
  const [clasif, setClasif] = useState<Record<string, number | null>>(() => deItems(d.clasificados));
  const [merma, setMerma] = useState<Record<string, number | null>>(() => deItems(d.merma));
  const [bodega, setBodega] = useState<string>(d.bodega ?? bodegas[0]?.id ?? 'principal');
  const [nota, setNota] = useState(original?.nota ?? '');
  const clasificados = aItems(clasif);
  const mermaItems = aItems(merma);
  const recibidos = Object.values(origen).reduce<number>((s, v) => s + (v ?? 0), 0);
  const listo = clasificados.length + mermaItems.length > 0;

  const guardar = async () => {
    const totalClasif = sumaHuevos(clasificados);
    const totalMerma = sumaHuevos(mermaItems);
    const avisos: string[] = [];
    if (recibidos > 0 && recibidos !== totalClasif + totalMerma) {
      avisos.push(`Recibidos ${enEnvases(recibidos, e)}; clasificados más merma ${enEnvases(totalClasif + totalMerma, e)}: ${diferenciaTexto(recibidos, totalClasif + totalMerma, e)}`);
    }
    const mov: Mov[] = clasificados.map((x) => ({ b: bodega, k: x.k, q: x.huevos }));
    if (totalMerma) mov.push({ b: POZO_MERMA, k: 'merma', q: totalMerma });
    const reg = registroGestion({
      tipo: 'proceso',
      lugar: 'area:proceso',
      lugarNombre: 'Sala de proceso',
      detalle: {
        origen: galpones.filter((g) => (origen[g.id] ?? 0) > 0).map((g) => ({ galpon_id: g.id, nombre: g.nombre, lote_id: g.lote_id ?? null, huevos: origen[g.id] })),
        recibidos,
        clasificados,
        merma: mermaItems,
        bodega,
      },
      mov,
      nota,
      avisos,
      corrige: original,
      motivo: motivoCorreccion(original),
    });
    await guardarGestion(reg, []);
  };

  return (
    <Formulario titulo="Sala de proceso" sub={original ? 'Corrección' : 'Clasificación del día'} listo={listo} faltaTexto="Anota al menos un calibre o la merma" guardar={guardar}>
      {galpones.length > 0 && (
        <section className="tarjeta pila">
          <h2 className="subtitulo">Huevos recibidos de cada galpón</h2>
          <p className="chico suave">Si no sabes de qué galpón vienen, déjalo en blanco.</p>
          {galpones.map((g) => (
            <CantidadHuevos key={g.id} etiqueta={g.nombre} envases={e} valor={origen[g.id] ?? null} alCambiar={(n) => setOrigen((o) => ({ ...o, [g.id]: n }))} />
          ))}
        </section>
      )}
      <section className="tarjeta pila">
        <h2 className="subtitulo">Clasificados por calibre</h2>
        {calibres.map((c) => (
          <CantidadHuevos key={c.id} etiqueta={c.nombre} envases={e} valor={clasif[c.id] ?? null} alCambiar={(n) => setClasif((o) => ({ ...o, [c.id]: n }))} />
        ))}
      </section>
      <section className="tarjeta pila">
        <h2 className="subtitulo">Merma</h2>
        <p className="chico suave">En huevos. Pasan a la sala de recuperación.</p>
        <div className="rejilla-numeros">
          {mermas.map((m) => (
            <CampoNumero key={m.id} etiqueta={m.nombre} unidad="huevos" valor={merma[m.id] ?? null} alCambiar={(n) => setMerma((o) => ({ ...o, [m.id]: n }))} />
          ))}
        </div>
      </section>
      {bodegas.length > 1 && <Elegir etiqueta="Bodega donde quedan" valor={bodega} opciones={bodegas} alCambiar={setBodega} />}
      <CampoTexto etiqueta="Observaciones (opcional)" valor={nota} alCambiar={setNota} area />
    </Formulario>
  );
}

// ------------------------------------------------------------------ bodega de huevos
function FormBodega({ sub, original }: { sub: string; original?: RegistroLocal }) {
  const config = useEstado((e) => e.config)!;
  const e = envasesDe(config);
  const d = original?.detalle ?? {};
  const calibres = activos(calibresDe(config));
  const bodegas = activos(bodegasDe(config));
  const [bodega, setBodega] = useState<string>(d.bodega ?? bodegas[0]?.id ?? 'principal');
  const [destino, setDestino] = useState<string>(d.destino ?? bodegas.find((b) => b.id !== (d.bodega ?? bodegas[0]?.id))?.id ?? '');
  const [items, setItems] = useState<Record<string, number | null>>(() => deItems(d.items));
  const [signo, setSigno] = useState<'entrada' | 'salida'>(d.signo ?? 'salida');
  const [motivo, setMotivo] = useState<string>(d.motivo ?? '');
  const [nota, setNota] = useState(original?.nota ?? '');
  // En el conteo físico un calibre en cero cuenta: lo que se deja en blanco es lo que no se contó.
  const lineas =
    sub === 'conteo'
      ? Object.entries(items)
          .filter(([, v]) => v != null)
          .map(([k, v]) => ({ k, huevos: v! }))
      : aItems(items);
  const titulo = sub === 'conteo' ? 'Conteo físico' : sub === 'traspaso' ? 'Traspaso entre bodegas' : 'Ajuste de bodega';
  const listo = lineas.length > 0 && (sub !== 'traspaso' || (destino && destino !== bodega)) && (sub !== 'ajuste' || motivo.trim().length >= 3);

  const guardar = async () => {
    let mov: Mov[];
    if (sub === 'conteo') mov = lineas.map((x) => ({ b: bodega, k: x.k, q: x.huevos, set: true }));
    else if (sub === 'traspaso') mov = lineas.flatMap((x) => [{ b: bodega, k: x.k, q: -x.huevos }, { b: destino, k: x.k, q: x.huevos }]);
    else mov = lineas.map((x) => ({ b: bodega, k: x.k, q: signo === 'entrada' ? x.huevos : -x.huevos }));
    const reg = registroGestion({
      tipo: 'bodega',
      lugar: `bodega:${bodega}`,
      lugarNombre: nombreBodega(config, bodega),
      detalle: { sub, bodega, ...(sub === 'traspaso' ? { destino } : {}), ...(sub === 'ajuste' ? { signo, motivo: motivo.trim() } : {}), items: lineas },
      mov,
      nota,
      corrige: original,
      motivo: motivoCorreccion(original),
    });
    await guardarGestion(reg, []);
  };

  return (
    <Formulario titulo={titulo} sub={original ? 'Corrección' : undefined} listo={Boolean(listo)} faltaTexto={sub === 'ajuste' ? 'Anota cantidades y el motivo' : 'Anota al menos un calibre'} guardar={guardar}>
      {sub === 'conteo' && <p className="suave">Cuenta lo que hay físicamente en la bodega. Anota 0 si un calibre no tiene huevos; deja en blanco el que no contaste.</p>}
      {bodegas.length > 1 && <Elegir etiqueta={sub === 'traspaso' ? 'Desde la bodega' : 'Bodega'} valor={bodega} opciones={bodegas} alCambiar={setBodega} />}
      {sub === 'traspaso' &&
        (bodegas.length > 1 ? (
          <Elegir etiqueta="Hacia la bodega" valor={destino} opciones={bodegas.filter((b) => b.id !== bodega)} alCambiar={setDestino} />
        ) : (
          <div className="tarjeta aviso-atencion chico">Hay una sola bodega. El supervisor agrega otras en Ajustes, Bodegas y calibres.</div>
        ))}
      {sub === 'ajuste' && (
        <Elegir
          etiqueta="Tipo de ajuste"
          valor={signo}
          opciones={[
            { id: 'salida', nombre: 'Sale de la bodega' },
            { id: 'entrada', nombre: 'Entra a la bodega' },
          ]}
          alCambiar={setSigno}
        />
      )}
      <section className="tarjeta pila">
        {calibres.map((c) => (
          <CantidadHuevos key={c.id} etiqueta={c.nombre} envases={e} valor={items[c.id] ?? null} alCambiar={(n) => setItems((o) => ({ ...o, [c.id]: n }))} />
        ))}
      </section>
      {sub === 'ajuste' && <CampoTexto etiqueta="Motivo" valor={motivo} alCambiar={setMotivo} lista={['Venta directa', 'Consumo interno', 'Huevos dañados en bodega', 'Devolución de cliente', 'Muestra']} />}
      <CampoTexto etiqueta="Observaciones (opcional)" valor={nota} alCambiar={setNota} area />
    </Formulario>
  );
}

// ------------------------------------------------------------------ despachos
function FormDespacho({ original }: { original?: RegistroLocal }) {
  const config = useEstado((e) => e.config)!;
  const e = envasesDe(config);
  const d = original?.detalle ?? {};
  const calibres = activos(calibresDe(config));
  const bodegas = activos(bodegasDe(config));
  const clientes = activos(config.clientes ?? []);
  const regId = useMemo(() => uid(), []);
  const [clienteId, setClienteId] = useState<string>(d.cliente_id ?? (clientes[0]?.id || 'otro'));
  const [clienteTexto, setClienteTexto] = useState<string>(d.cliente_id ? '' : (d.cliente ?? ''));
  const [guia, setGuia] = useState<string>(d.guia ?? '');
  const [bodega, setBodega] = useState<string>(d.bodega ?? bodegas[0]?.id ?? 'principal');
  const [items, setItems] = useState<Record<string, number | null>>(() => deItems(d.items));
  const [precios, setPrecios] = useState<Record<string, number | null>>(() => Object.fromEntries((d.items ?? []).map((x: ItemHuevos) => [x.k, x.precio ?? null])));
  const [conPrecio, setConPrecio] = useState<boolean>((d.items ?? []).some((x: ItemHuevos) => x.precio != null));
  const [nota, setNota] = useState(original?.nota ?? '');
  const fotos = useFotos('Despacho', 'Despachos', regId);
  const cliente = clienteId === 'otro' ? clienteTexto.trim() : (clientes.find((c) => c.id === clienteId)?.nombre ?? '');
  const lineas = aItems(items).map((x) => ({ ...x, ...(conPrecio && precios[x.k] != null ? { precio: precios[x.k] } : {}) }));
  const porCaja = e.huevos_bandeja * e.bandejas_caja;
  const total = lineas.reduce((s, x) => s + (x.precio != null ? (x.huevos / porCaja) * x.precio : 0), 0);
  const listo = cliente.length >= 2 && lineas.length > 0;

  const guardar = async () => {
    const reg = registroGestion({
      tipo: 'despacho',
      lugar: `bodega:${bodega}`,
      lugarNombre: nombreBodega(config, bodega),
      detalle: { cliente_id: clienteId === 'otro' ? null : clienteId, cliente, guia: guia.trim(), bodega, items: lineas, ...(conPrecio ? { total: Math.round(total) } : {}) },
      mov: lineas.map((x) => ({ b: bodega, k: x.k, q: -x.huevos })),
      nota,
      fotos: fotos.fotos.length ? fotos.fotos.map((f) => ({ id: f.id, etiqueta: f.etiqueta })) : (original?.fotos ?? []),
      corrige: original,
      motivo: motivoCorreccion(original),
    });
    await guardarGestion(reg, fotos.fotos);
  };

  return (
    <Formulario titulo="Despacho" sub={original ? 'Corrección' : undefined} listo={listo} faltaTexto="Falta el cliente o las cantidades" guardar={guardar} superpuesto={fotos.vista}>
      {clientes.length > 0 ? (
        <Elegir etiqueta="Cliente" valor={clienteId} opciones={[...clientes.map((c) => ({ id: c.id, nombre: c.nombre })), { id: 'otro', nombre: 'Otro cliente' }]} alCambiar={setClienteId} />
      ) : null}
      {(clienteId === 'otro' || clientes.length === 0) && <CampoTexto etiqueta={clientes.length ? 'Nombre del cliente' : 'Cliente'} valor={clienteTexto} alCambiar={setClienteTexto} />}
      <CampoTexto etiqueta="Número de guía o factura (opcional)" valor={guia} alCambiar={setGuia} largo={30} />
      {bodegas.length > 1 && <Elegir etiqueta="Sale de la bodega" valor={bodega} opciones={bodegas} alCambiar={setBodega} />}
      <section className="tarjeta pila">
        <h2 className="subtitulo">Lo que sale</h2>
        {calibres.map((c) => (
          <CantidadHuevos
            key={c.id}
            etiqueta={c.nombre}
            envases={e}
            valor={items[c.id] ?? null}
            alCambiar={(n) => setItems((o) => ({ ...o, [c.id]: n }))}
            nota={
              conPrecio && (items[c.id] ?? 0) > 0 ? (
                <CampoNumero etiqueta="Precio por caja" unidad="$" valor={precios[c.id] ?? null} alCambiar={(n) => setPrecios((o) => ({ ...o, [c.id]: n }))} />
              ) : undefined
            }
          />
        ))}
        <button type="button" className="enlace" onClick={() => setConPrecio(!conPrecio)}>
          {conPrecio ? 'No anotar precios' : 'Anotar precios'}
        </button>
        {conPrecio && total > 0 && <p className="fuerte">Total: ${num(Math.round(total))}</p>}
      </section>
      {fotos.bloque('Guía de despacho')}
      <CampoTexto etiqueta="Observaciones (opcional)" valor={nota} alCambiar={setNota} area />
    </Formulario>
  );
}

// ------------------------------------------------------------------ sala de recuperación
function FormRecuperacion({ original }: { original?: RegistroLocal }) {
  const config = useEstado((e) => e.config)!;
  const e = envasesDe(config);
  const d = original?.detalle ?? {};
  const calibres = activos(calibresDe(config));
  const bodegas = activos(bodegasDe(config));
  const [entrada, setEntrada] = useState<number | null>(d.entrada ?? null);
  const [recup, setRecup] = useState<Record<string, number | null>>(() => deItems(d.recuperados));
  const [industria, setIndustria] = useState<number | null>(d.industria ?? null);
  const [descarte, setDescarte] = useState<number | null>(d.descarte ?? null);
  const [bodega, setBodega] = useState<string>(d.bodega ?? bodegas[0]?.id ?? 'principal');
  const [nota, setNota] = useState(original?.nota ?? '');
  const recuperados = aItems(recup);
  const listo = (entrada ?? 0) > 0;

  const guardar = async () => {
    const salida = sumaHuevos(recuperados) + (industria ?? 0) + (descarte ?? 0);
    const avisos = salida !== entrada ? [`Entraron ${num(entrada)} huevos y salieron ${num(salida)} (recuperados, industria y descarte): ${diferenciaTexto(entrada!, salida, e)}`] : [];
    const mov: Mov[] = [{ b: POZO_MERMA, k: 'merma', q: -(entrada ?? 0) }, ...recuperados.map((x) => ({ b: bodega, k: x.k, q: x.huevos }))];
    const reg = registroGestion({
      tipo: 'recuperacion',
      lugar: 'area:recuperacion',
      lugarNombre: 'Sala de recuperación',
      detalle: { entrada, recuperados, industria: industria ?? 0, descarte: descarte ?? 0, bodega },
      mov,
      nota,
      avisos,
      corrige: original,
      motivo: motivoCorreccion(original),
    });
    await guardarGestion(reg, []);
  };

  return (
    <Formulario titulo="Sala de recuperación" sub={original ? 'Corrección' : undefined} listo={listo} faltaTexto="Anota cuántos huevos entraron" guardar={guardar}>
      <CampoNumero etiqueta="Huevos de merma que entraron" unidad="huevos" valor={entrada} alCambiar={setEntrada} />
      <section className="tarjeta pila">
        <h2 className="subtitulo">Recuperados, por calibre</h2>
        {calibres.map((c) => (
          <CantidadHuevos key={c.id} etiqueta={c.nombre} envases={e} valor={recup[c.id] ?? null} alCambiar={(n) => setRecup((o) => ({ ...o, [c.id]: n }))} />
        ))}
      </section>
      <div className="rejilla-numeros">
        <CampoNumero etiqueta="A industria (líquido)" unidad="huevos" valor={industria} alCambiar={setIndustria} />
        <CampoNumero etiqueta="Descartados" unidad="huevos" valor={descarte} alCambiar={setDescarte} />
      </div>
      {bodegas.length > 1 && <Elegir etiqueta="Los recuperados van a" valor={bodega} opciones={bodegas} alCambiar={setBodega} />}
      <CampoTexto etiqueta="Observaciones (opcional)" valor={nota} alCambiar={setNota} area />
    </Formulario>
  );
}

// ------------------------------------------------------------------ insumos
function FormInsumo({ sub, original }: { sub: string; original?: RegistroLocal }) {
  const config = useEstado((e) => e.config)!;
  const d = original?.detalle ?? {};
  const insumos = activos(config.insumos ?? []);
  const proveedores = activos(config.proveedores ?? []);
  const galpones = config.galpones.filter((g) => g.activo);
  const regId = useMemo(() => uid(), []);
  const [insumoId, setInsumoId] = useState<string>(d.insumo_id ?? insumos[0]?.id ?? '');
  const [cantidad, setCantidad] = useState<number | null>(d.cantidad ?? null);
  const [proveedor, setProveedor] = useState<string>(d.proveedor ?? '');
  const [guia, setGuia] = useState<string>(d.guia ?? '');
  const [loteProd, setLoteProd] = useState<string>(d.lote_producto ?? '');
  const [vence, setVence] = useState<string>(d.vence ?? '');
  const [costo, setCosto] = useState<number | null>(d.costo ?? null);
  const [galpon, setGalpon] = useState<string>(d.galpon_id ?? '');
  const [nota, setNota] = useState(original?.nota ?? '');
  const fotos = useFotos('Recepción de insumos', 'Insumos', regId);
  const insumo = insumos.find((x) => x.id === insumoId) ?? (config.insumos ?? []).find((x) => x.id === insumoId);
  const titulo = sub === 'recepcion' ? 'Recepción de insumos' : sub === 'consumo' ? 'Consumo de insumos' : 'Conteo de insumos';
  if (!insumos.length && !original) {
    return (
      <div className="pantalla">
        <Barra titulo={titulo} atras={cerrarPantalla} />
        <div className="contenido">
          <div className="tarjeta aviso-atencion">Todavía no hay insumos en la lista. El supervisor los agrega en Gestión, Insumos.</div>
        </div>
      </div>
    );
  }
  const listo = Boolean(insumo) && cantidad != null && (sub === 'conteo' || cantidad > 0);
  const guardar = async () => {
    const g = galpones.find((x) => x.id === galpon);
    const reg = registroGestion({
      tipo: 'insumo',
      lugar: 'area:insumos',
      lugarNombre: 'Insumos',
      detalle: {
        sub,
        insumo_id: insumo!.id,
        nombre: insumo!.nombre,
        unidad: insumo!.unidad,
        categoria: insumo!.categoria,
        cantidad,
        ...(sub === 'recepcion' ? { proveedor: proveedor.trim(), guia: guia.trim(), lote_producto: loteProd.trim(), vence: vence || null, costo } : {}),
        ...(sub === 'consumo' && g ? { galpon_id: g.id, galpon_nombre: g.nombre } : {}),
      },
      mov: [{ b: BODEGA_INSUMOS, k: insumo!.id, q: sub === 'consumo' ? -(cantidad ?? 0) : (cantidad ?? 0), ...(sub === 'conteo' ? { set: true } : {}) }],
      nota,
      fotos: fotos.fotos.length ? fotos.fotos.map((f) => ({ id: f.id, etiqueta: f.etiqueta })) : (original?.fotos ?? []),
      corrige: original,
      motivo: motivoCorreccion(original),
    });
    await guardarGestion(reg, fotos.fotos);
  };
  return (
    <Formulario titulo={titulo} sub={original ? 'Corrección' : undefined} listo={listo} faltaTexto="Elige el insumo y anota la cantidad" guardar={guardar} superpuesto={fotos.vista}>
      <Elegir etiqueta="Insumo" valor={insumoId} opciones={(insumos.length ? insumos : insumo ? [insumo] : []).map((x) => ({ id: x.id, nombre: `${x.nombre} (${x.unidad})` }))} alCambiar={setInsumoId} />
      <CampoNumero
        etiqueta={sub === 'conteo' ? 'Cantidad que hay físicamente' : sub === 'recepcion' ? 'Cantidad recibida' : 'Cantidad usada'}
        unidad={insumo?.unidad}
        decimales
        valor={cantidad}
        alCambiar={setCantidad}
      />
      {sub === 'recepcion' && (
        <>
          <CampoTexto etiqueta="Proveedor" valor={proveedor} alCambiar={setProveedor} lista={proveedores.map((x) => x.nombre)} />
          <CampoTexto etiqueta="Número de guía o factura (opcional)" valor={guia} alCambiar={setGuia} largo={30} />
          <div className="rejilla-numeros">
            <CampoTexto etiqueta="Lote o serie del producto (opcional)" valor={loteProd} alCambiar={setLoteProd} largo={40} />
            <label className="campo">
              <span>Vence (opcional)</span>
              <input className="entrada" type="date" value={vence} onChange={(ev) => setVence(ev.target.value)} />
            </label>
          </div>
          <CampoNumero etiqueta="Costo total (opcional)" unidad="$" valor={costo} alCambiar={setCosto} />
          {fotos.bloque('Guía o factura')}
        </>
      )}
      {sub === 'consumo' && (
        <Elegir etiqueta="Para qué galpón (opcional)" valor={galpon} opciones={[{ id: '', nombre: 'Plantel en general' }, ...galpones.map((g) => ({ id: g.id, nombre: g.nombre }))]} alCambiar={setGalpon} />
      )}
      <CampoTexto etiqueta="Observaciones (opcional)" valor={nota} alCambiar={setNota} area />
    </Formulario>
  );
}

// ------------------------------------------------------------------ sanidad
const VIAS = ['Agua de bebida', 'Spray', 'Ocular', 'Nasal', 'Inyectable', 'Punción en el ala', 'Alimento', 'Otra'];

/** Vacunas del plan sanitario que tocan o están atrasadas para los lotes activos, sin registro de aplicación. */
export function vacunasPendientes(config: Config, gestion: RegistroLocal[], hoy: string, diasAntes = 7) {
  const out: { plan_id: string; producto: string; via: string; lote_id: string; lote: string; galpon_id: string | null; fecha: string; atrasada: boolean }[] = [];
  for (const l of lotesEfectivos(config)) {
    if (l.estado !== 'activo' || !l.nacimiento) continue;
    for (const pl of config.plan_sanitario ?? []) {
      if (pl.etapa && pl.etapa !== l.etapa) continue;
      const fecha = sumarDias(l.nacimiento, (pl.semana - 1) * 7);
      if (fecha > sumarDias(hoy, diasAntes)) continue;
      // Solo lo de las últimas 8 semanas: lo más antiguo se da por cumplido antes de usar la app.
      if (fecha < sumarDias(hoy, -56) || (l.ingreso && fecha < l.ingreso)) continue;
      const hecha = gestion.some((r) => r.tipo === 'sanidad' && r.detalle?.plan_id === pl.id && (r.detalle?.lote_ids ?? []).includes(l.id));
      if (!hecha) out.push({ plan_id: pl.id, producto: pl.producto, via: pl.via, lote_id: l.id, lote: l.nombre, galpon_id: l.galpon_id, fecha, atrasada: fecha < hoy });
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function FormSanidad({ sub, original }: { sub: string; original?: RegistroLocal }) {
  const config = useEstado((e) => e.config)!;
  const hoy = useEstado((e) => e.hoy);
  const indice = useIndice();
  const d = original?.detalle ?? {};
  const galponesTodos = config.galpones.filter((g) => g.activo);
  const insumos = activos(config.insumos ?? []).filter((x) => ['vacuna', 'medicamento', 'desinfectante', 'otro'].includes(x.categoria));
  const pendientes = sub === 'vacuna' && !original ? vacunasPendientes(config, indice.gestion, hoy) : [];
  const regId = useMemo(() => uid(), []);
  const [planId, setPlanId] = useState<string>(d.plan_id ?? '');
  const [producto, setProducto] = useState<string>(d.producto ?? '');
  const [galpones, setGalpones] = useState<string[]>(d.galpones ?? galponesTodos.map((g) => g.id));
  const [via, setVia] = useState<string>(d.via ?? VIAS[0]);
  const [dosis, setDosis] = useState<string>(d.dosis ?? '');
  const [loteProd, setLoteProd] = useState<string>(d.lote_producto ?? '');
  const [insumoId, setInsumoId] = useState<string>(d.insumo_id ?? '');
  const [usado, setUsado] = useState<number | null>(d.cantidad_insumo ?? null);
  const [desde, setDesde] = useState<string>(d.desde ?? hoy);
  const [hasta, setHasta] = useState<string>(d.hasta ?? hoy);
  const [resguardo, setResguardo] = useState<number | null>(d.resguardo_dias ?? null);
  const [diagnostico, setDiagnostico] = useState<string>(d.diagnostico ?? '');
  const [hallazgos, setHallazgos] = useState<string>(d.hallazgos ?? '');
  const [nota, setNota] = useState(original?.nota ?? '');
  const etiquetaFoto = sub === 'visita' ? 'Hallazgo' : 'Frasco y lote';
  const fotos = useFotos(sub === 'vacuna' ? 'Vacunación' : sub === 'tratamiento' ? 'Tratamiento' : 'Visita veterinaria', 'Sanidad', regId);
  const titulo = sub === 'vacuna' ? 'Vacunación' : sub === 'tratamiento' ? 'Tratamiento' : 'Visita veterinaria';
  const elegirPendiente = (p: (typeof pendientes)[number]) => {
    setPlanId(p.plan_id);
    setProducto(p.producto);
    setVia(VIAS.includes(p.via) ? p.via : 'Otra');
    const delLote = galponesTodos.filter((g) => loteIdDe(g) === p.lote_id).map((g) => g.id);
    if (delLote.length) setGalpones(delLote);
  };
  const listo = galpones.length > 0 && (sub === 'visita' ? hallazgos.trim().length >= 3 : producto.trim().length >= 2) && (sub !== 'tratamiento' || hasta >= desde);
  const insumo = insumos.find((x) => x.id === insumoId);

  const guardar = async () => {
    const elegidos = galponesTodos.filter((g) => galpones.includes(g.id));
    const reg = registroGestion({
      tipo: 'sanidad',
      lugar: elegidos.length === 1 ? elegidos[0].id : 'area:sanidad',
      lugarNombre: elegidos.length === 1 ? elegidos[0].nombre : 'Sanidad',
      detalle: {
        sub,
        producto: producto.trim(),
        galpones,
        galpones_nombres: elegidos.map((g) => g.nombre).join(', '),
        lote_ids: [...new Set(elegidos.map((g) => loteIdDe(g)))],
        ...(sub !== 'visita' ? { via, dosis: dosis.trim(), lote_producto: loteProd.trim(), plan_id: planId || null } : {}),
        ...(insumo && usado ? { insumo_id: insumo.id, insumo_nombre: insumo.nombre, cantidad_insumo: usado, unidad: insumo.unidad } : {}),
        ...(sub === 'tratamiento' ? { desde, hasta, resguardo_dias: resguardo ?? 0, diagnostico: diagnostico.trim() } : {}),
        ...(sub === 'visita' ? { hallazgos: hallazgos.trim(), diagnostico: diagnostico.trim() } : {}),
      },
      mov: insumo && usado ? [{ b: BODEGA_INSUMOS, k: insumo.id, q: -usado }] : [],
      nota,
      fotos: fotos.fotos.length ? fotos.fotos.map((f) => ({ id: f.id, etiqueta: f.etiqueta })) : (original?.fotos ?? []),
      corrige: original,
      motivo: motivoCorreccion(original),
    });
    await guardarGestion(reg, fotos.fotos);
  };

  return (
    <Formulario titulo={titulo} sub={original ? 'Corrección' : undefined} listo={listo} faltaTexto={sub === 'visita' ? 'Escribe lo que se encontró' : 'Falta el producto o los galpones'} guardar={guardar} superpuesto={fotos.vista}>
      {pendientes.length > 0 && (
        <section className="tarjeta pila">
          <h2 className="subtitulo">Del plan sanitario</h2>
          {pendientes.map((p) => (
            <button key={`${p.plan_id}-${p.lote_id}`} type="button" className="opcion" style={{ textAlign: 'left' }} aria-pressed={planId === p.plan_id} onClick={() => elegirPendiente(p)}>
              <b>{p.producto}</b> · {p.lote}, {p.atrasada ? `atrasada desde el ${p.fecha}` : p.fecha === hoy ? 'hoy' : `el ${p.fecha}`}
            </button>
          ))}
        </section>
      )}
      {sub !== 'visita' && <CampoTexto etiqueta={sub === 'vacuna' ? 'Vacuna' : 'Producto'} valor={producto} alCambiar={setProducto} lista={[...insumos.map((x) => x.nombre), ...(config.plan_sanitario ?? []).map((x) => x.producto)]} />}
      <div className="campo">
        <span className="rotulo">Galpones</span>
        <div className="opciones">
          {galponesTodos.map((g) => {
            const marcado = galpones.includes(g.id);
            return (
              <button key={g.id} type="button" className="opcion" aria-pressed={marcado} onClick={() => setGalpones(marcado ? galpones.filter((x) => x !== g.id) : [...galpones, g.id])}>
                {g.nombre}
              </button>
            );
          })}
        </div>
      </div>
      {sub !== 'visita' && (
        <>
          <Elegir etiqueta="Vía" valor={via} opciones={VIAS.map((v) => ({ id: v, nombre: v }))} alCambiar={setVia} />
          <div className="rejilla-numeros">
            <CampoTexto etiqueta="Dosis (opcional)" valor={dosis} alCambiar={setDosis} largo={40} />
            <CampoTexto etiqueta="Serie o lote del producto (opcional)" valor={loteProd} alCambiar={setLoteProd} largo={40} />
          </div>
        </>
      )}
      {sub === 'tratamiento' && (
        <>
          <CampoTexto etiqueta="Diagnóstico o motivo" valor={diagnostico} alCambiar={setDiagnostico} largo={120} />
          <div className="rejilla-numeros">
            <label className="campo">
              <span>Desde</span>
              <input className="entrada" type="date" value={desde} onChange={(ev) => setDesde(ev.target.value)} />
            </label>
            <label className="campo">
              <span>Hasta</span>
              <input className="entrada" type="date" value={hasta} onChange={(ev) => setHasta(ev.target.value)} />
            </label>
          </div>
          <CampoNumero etiqueta="Días de resguardo después del tratamiento" unidad="días" valor={resguardo} alCambiar={setResguardo} ayuda="Mientras dure, la app avisa que los huevos de esos galpones están en resguardo." />
        </>
      )}
      {sub === 'visita' && (
        <>
          <CampoTexto etiqueta="Lo que se encontró" valor={hallazgos} alCambiar={setHallazgos} area largo={600} />
          <CampoTexto etiqueta="Diagnóstico o recomendación (opcional)" valor={diagnostico} alCambiar={setDiagnostico} area largo={600} />
        </>
      )}
      {sub !== 'visita' && insumos.length > 0 && (
        <section className="tarjeta pila">
          <p className="fuerte">Descontar de insumos (opcional)</p>
          <Elegir etiqueta="Insumo usado" valor={insumoId} opciones={[{ id: '', nombre: 'No descontar' }, ...insumos.map((x) => ({ id: x.id, nombre: `${x.nombre} (${x.unidad})` }))]} alCambiar={setInsumoId} />
          {insumo && <CampoNumero etiqueta="Cantidad usada" unidad={insumo.unidad} decimales valor={usado} alCambiar={setUsado} />}
        </section>
      )}
      {fotos.bloque(etiquetaFoto)}
      <CampoTexto etiqueta="Observaciones (opcional)" valor={nota} alCambiar={setNota} area />
    </Formulario>
  );
}

// ------------------------------------------------------------------ inicio de un área (vista simple)
export const ACCIONES_AREA: Record<Exclude<Area, 'galpones'>, { tipo: string; sub?: string; nombre: string }[]> = {
  proceso: [{ tipo: 'proceso', nombre: 'Registrar clasificación' }],
  bodega: [
    { tipo: 'bodega', sub: 'conteo', nombre: 'Conteo físico' },
    { tipo: 'bodega', sub: 'traspaso', nombre: 'Traspaso entre bodegas' },
    { tipo: 'bodega', sub: 'ajuste', nombre: 'Ajuste (entrada o salida)' },
  ],
  despachos: [{ tipo: 'despacho', nombre: 'Nuevo despacho' }],
  recuperacion: [{ tipo: 'recuperacion', nombre: 'Registrar recuperación' }],
  insumos: [
    { tipo: 'insumo', sub: 'recepcion', nombre: 'Recepción' },
    { tipo: 'insumo', sub: 'consumo', nombre: 'Consumo' },
    { tipo: 'insumo', sub: 'conteo', nombre: 'Conteo físico' },
  ],
  sanidad: [
    { tipo: 'sanidad', sub: 'vacuna', nombre: 'Vacunación' },
    { tipo: 'sanidad', sub: 'tratamiento', nombre: 'Tratamiento' },
    { tipo: 'sanidad', sub: 'visita', nombre: 'Visita veterinaria' },
  ],
};

const TIPOS_AREA: Record<string, string> = { proceso: 'proceso', bodega: 'bodega', despachos: 'despacho', recuperacion: 'recuperacion', insumos: 'insumo', sanidad: 'sanidad' };

export function AreaInicio({ area }: { area: Exclude<Area, 'galpones'> }) {
  const config = useEstado((e) => e.config)!;
  const usuario = useEstado((e) => e.usuario)!;
  const hoy = useEstado((e) => e.hoy);
  const indice = useIndice();
  const info = AREAS_INFO.find((a) => a.id === area);
  if (!info || !areasDe(config, usuario).includes(area)) return <Falta />;
  const deHoy = indice.deTipo(TIPOS_AREA[area] as Registro['tipo'], hoy, hoy).filter((r) => usuario.rol === 'supervisor' || r.usuario_id === usuario.id);
  const pendientes = area === 'sanidad' ? vacunasPendientes(config, indice.gestion, hoy, 1) : [];
  return (
    <div className="pantalla">
      <Barra titulo={info.nombre} derecha={<Envio />} />
      <div className="contenido">
        {pendientes.length > 0 && (
          <div className="tarjeta aviso-atencion">
            <p className="fuerte">Vacunas del plan para hoy o atrasadas</p>
            {pendientes.map((p) => (
              <p key={`${p.plan_id}-${p.lote_id}`} className="chico">
                {p.producto}, {p.lote}
                {p.atrasada ? ` (desde el ${p.fecha})` : ''}
              </p>
            ))}
          </div>
        )}
        <div className="pila">
          {ACCIONES_AREA[area].map((a) => (
            <button key={a.nombre} className="boton grande" onClick={() => ir({ p: 'form', tipo: a.tipo, sub: a.sub })}>
              <Plus size={22} aria-hidden /> {a.nombre}
            </button>
          ))}
        </div>
        <p className="seccion">Registrado hoy</p>
        {deHoy.length ? (
          <div className="lista">
            {deHoy.map((r) => (
              <button key={r.id} className="fila" onClick={() => ir({ p: 'registro', id: r.id })}>
                <span className="medallon hecho">
                  <ClipboardList size={22} />
                </span>
                <span className="fila-cuerpo">
                  <span className="fila-titulo" style={{ display: 'block' }}>
                    {tituloGestion(config, r)}
                  </span>
                  <span className="fila-detalle" style={{ display: 'block' }}>
                    {resumenGestion(config, r)}, {hora(r.capturado ?? r.capturado_dispositivo)}
                    {r._pend ? ', por enviar' : ''}
                  </span>
                </span>
                <ChevronRight className="flecha" aria-hidden />
              </button>
            ))}
          </div>
        ) : (
          <div className="tarjeta suave">Nada todavía.</div>
        )}
      </div>
    </div>
  );
}

/** Mosaico de áreas en el inicio del operario (cuando registra algo más que galpones). */
export function MosaicoAreas({ areas }: { areas: Area[] }) {
  const otras = areas.filter((a): a is Exclude<Area, 'galpones'> => a !== 'galpones');
  if (!otras.length) return null;
  return (
    <div className="mosaico-areas">
      {otras.map((a) => (
        <button key={a} className="tarjeta-area" onClick={() => ir({ p: 'area', area: a })}>
          <b>{AREAS_INFO.find((x) => x.id === a)?.nombre}</b>
          <ChevronRight size={20} aria-hidden />
        </button>
      ))}
    </div>
  );
}

