// Ajustes de gestión: qué módulos usa el plantel y sus listas (bodegas, clientes, proveedores, insumos, plan sanitario).
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { guardarConfig } from '../lib/app';
import { avisar, ir, useEstado, volver } from '../lib/estado';
import { MODULOS_INFO, PERFILES, bodegasDe, modulosDe } from '../lib/modulos';
import { mensajeError } from '../lib/nube';
import type { Catalogo, CategoriaInsumo, Config, Contacto, Insumo, Modulos, PlanSanitario } from '../lib/tipos';
import { leerNumero, uid } from '../lib/util';
import { Barra, Interruptor } from './base';

async function guardar(cambio: (c: Config) => void, listo: string) {
  try {
    await guardarConfig(cambio);
    avisar(listo, 'ok');
    return true;
  } catch (e) {
    avisar(mensajeError(e), 'mal');
    return false;
  }
}

export function AjusteModulos() {
  const config = useEstado((e) => e.config)!;
  const [m, setM] = useState<Modulos>(() => modulosDe(config));
  const [informe, setInforme] = useState(config.informe?.activo ?? true);
  const [correos, setCorreos] = useState((config.informe?.correos ?? []).join(', '));
  const [ocupado, setOcupado] = useState(false);
  const enviar = async () => {
    setOcupado(true);
    const lista = correos.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const malos = lista.filter((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    if (malos.length) {
      setOcupado(false);
      return avisar(`Revisa este correo: ${malos[0]}`, 'mal');
    }
    if (await guardar((c) => {
      c.modulos = m;
      c.informe = { activo: informe, correos: lista.slice(0, 10) };
    }, 'Guardado')) volver();
    setOcupado(false);
  };
  return (
    <div className="pantalla">
      <Barra titulo="Módulos e informes" sub="Lo que usa este plantel" />
      <div className="contenido">
        <p className="seccion">Para empezar rápido</p>
        <div className="opciones">
          {PERFILES.map((p) => (
            <button key={p.id} type="button" className="opcion" aria-pressed={JSON.stringify(p.modulos) === JSON.stringify(m)} onClick={() => setM(p.modulos)} title={p.detalle}>
              {p.nombre}
            </button>
          ))}
        </div>
        <p className="seccion">Cada módulo</p>
        <div className="tarjeta pila">
          {MODULOS_INFO.map((x) => (
            <Interruptor key={x.id} activo={m[x.id]} alCambiar={(v) => setM((y) => ({ ...y, [x.id]: v }))}>
              <b>{x.nombre}</b>
              <br />
              <span className="chico suave">{x.detalle}</span>
            </Interruptor>
          ))}
        </div>
        <p className="seccion">Informe diario por correo</p>
        <div className="tarjeta pila">
          <Interruptor activo={informe} alCambiar={setInforme}>
            <b>Enviar el informe del día</b>
            <br />
            <span className="chico suave">Cada noche, una tabla por galpón con aves, huevos, postura, mortalidad, agua, alimento y alertas. Llega a los supervisores.</span>
          </Interruptor>
          {informe && (
            <label className="campo">
              <span>También enviarlo a (opcional)</span>
              <input className="entrada" type="email" multiple value={correos} onChange={(e) => setCorreos(e.target.value)} placeholder="gerencia@empresa.cl, dueño@empresa.cl" autoCapitalize="none" />
              <small>Separa los correos con una coma. Hasta 10.</small>
            </label>
          )}
        </div>
        <p className="chico suave">
          Apagar un módulo no borra nada: sus registros quedan en el historial y vuelven a verse al prenderlo. Las personas a cargo de cada área se eligen en
          Ajustes, Personas.
        </p>
        <div className="pila">
          {[
            ['bodegas', 'Bodegas de huevos'],
            ['clientes', 'Clientes'],
            ['proveedores', 'Proveedores'],
            ['insumos', 'Insumos'],
            ['plan', 'Plan sanitario (vacunas por edad)'],
          ].map(([id, nombre]) => (
            <button key={id} className="boton" onClick={() => ir({ p: 'ajuste', cual: 'lista', id })}>
              {nombre}
            </button>
          ))}
        </div>
      </div>
      <div className="pie">
        <button className="boton primario grande" disabled={ocupado} onClick={enviar}>
          {ocupado ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

type Cual = 'bodegas' | 'clientes' | 'proveedores' | 'insumos' | 'plan';
const TITULOS: Record<Cual, string> = { bodegas: 'Bodegas de huevos', clientes: 'Clientes', proveedores: 'Proveedores', insumos: 'Insumos', plan: 'Plan sanitario' };
const CATEGORIAS: { id: CategoriaInsumo; nombre: string }[] = [
  { id: 'alimento', nombre: 'Alimento' },
  { id: 'vacuna', nombre: 'Vacuna' },
  { id: 'medicamento', nombre: 'Medicamento' },
  { id: 'desinfectante', nombre: 'Desinfectante' },
  { id: 'envase', nombre: 'Envase' },
  { id: 'otro', nombre: 'Otro' },
];
const VIAS = ['Agua de bebida', 'Spray', 'Ocular', 'Nasal', 'Inyectable', 'Punción en el ala', 'Alimento', 'Otra'];

/** Editor de una lista del plantel. Lo que se quita queda inactivo (los registros antiguos siguen mostrando su nombre). */
export function AjusteLista({ cual }: { cual: Cual }) {
  const config = useEstado((e) => e.config)!;
  const inicial = (): any[] =>
    cual === 'bodegas' ? bodegasDe(config) : cual === 'plan' ? (config.plan_sanitario ?? []) : ((config as any)[cual] ?? []);
  const [items, setItems] = useState<any[]>(() => structuredClone(inicial()));
  const [ocupado, setOcupado] = useState(false);
  const set = (i: number, c: Record<string, unknown>) => setItems((xs) => xs.map((x, k) => (k === i ? { ...x, ...c } : x)));
  const nuevo = (): any =>
    cual === 'bodegas'
      ? ({ id: uid(), nombre: '', activo: true } satisfies Catalogo)
      : cual === 'insumos'
        ? ({ id: uid(), nombre: '', categoria: 'alimento', unidad: 'kg', minimo: null, activo: true } satisfies Insumo)
        : cual === 'plan'
          ? ({ id: uid(), producto: '', semana: 1, via: VIAS[0] } as PlanSanitario)
          : ({ id: uid(), nombre: '', rut: '', telefono: '', correo: '', direccion: '', notas: '', activo: true } satisfies Contacto);
  const enviar = async () => {
    const limpios = items
      .map((x) => (cual === 'plan' ? { ...x, producto: String(x.producto).trim() } : { ...x, nombre: String(x.nombre).trim() }))
      .filter((x) => (cual === 'plan' ? x.producto : x.nombre));
    setOcupado(true);
    const ok = await guardar((c) => {
      if (cual === 'plan') c.plan_sanitario = limpios;
      else (c as any)[cual] = limpios;
    }, 'Lista guardada');
    setOcupado(false);
    if (ok) volver();
  };
  const visibles = items.map((x, i) => ({ x, i })).filter(({ x }) => cual === 'plan' || x.activo !== false);
  return (
    <div className="pantalla">
      <Barra titulo={TITULOS[cual]} />
      <div className="contenido">
        {cual === 'plan' && (
          <p className="suave">
            Cada vacuna con la semana de vida en que corresponde. La app avisa una semana antes en Gestión y en el área de Sanidad, para cada galpón con su
            fecha de nacimiento.
          </p>
        )}
        {visibles.length === 0 && <p className="suave">Todavía no hay ninguno.</p>}
        {visibles.map(({ x, i }) => (
          <div key={x.id} className="tarjeta pila">
            {cual === 'plan' ? (
              <>
                <label className="campo">
                  <span>Vacuna o producto</span>
                  <input className="entrada" value={x.producto} onChange={(e) => set(i, { producto: e.target.value })} maxLength={60} />
                </label>
                <div className="linea-h envolver">
                  <label className="campo crece">
                    <span>Semana de vida</span>
                    <input className="entrada" inputMode="numeric" value={x.semana ?? ''} onChange={(e) => set(i, { semana: Math.max(1, Math.min(120, Number(e.target.value.replace(/\D/g, '')) || 1)) })} />
                  </label>
                  <label className="campo crece">
                    <span>Vía</span>
                    <select className="entrada" value={x.via} onChange={(e) => set(i, { via: e.target.value })}>
                      {VIAS.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            ) : (
              <>
                <label className="campo">
                  <span>Nombre</span>
                  <input className="entrada" value={x.nombre} onChange={(e) => set(i, { nombre: e.target.value })} maxLength={60} />
                </label>
                {cual === 'insumos' && (
                  <div className="linea-h envolver">
                    <label className="campo crece">
                      <span>Tipo</span>
                      <select className="entrada" value={x.categoria} onChange={(e) => set(i, { categoria: e.target.value })}>
                        {CATEGORIAS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="campo crece">
                      <span>Unidad</span>
                      <input className="entrada" value={x.unidad} onChange={(e) => set(i, { unidad: e.target.value })} maxLength={12} placeholder="kg, dosis, L" />
                    </label>
                    <label className="campo crece">
                      <span>Avisar bajo</span>
                      <input className="entrada" inputMode="decimal" defaultValue={x.minimo ?? ''} onChange={(e) => set(i, { minimo: leerNumero(e.target.value) })} />
                    </label>
                  </div>
                )}
                {(cual === 'clientes' || cual === 'proveedores') && (
                  <div className="linea-h envolver">
                    <label className="campo crece">
                      <span>RUT</span>
                      <input className="entrada" value={x.rut} onChange={(e) => set(i, { rut: e.target.value })} maxLength={14} />
                    </label>
                    <label className="campo crece">
                      <span>Teléfono</span>
                      <input className="entrada" inputMode="tel" value={x.telefono} onChange={(e) => set(i, { telefono: e.target.value })} maxLength={20} />
                    </label>
                  </div>
                )}
              </>
            )}
            <button
              className="boton chico peligro-suave"
              onClick={() => setItems((xs) => (cual === 'plan' || !x.nombre ? xs.filter((_, k) => k !== i) : xs.map((y, k) => (k === i ? { ...y, activo: false } : y))))}
            >
              <Trash2 size={18} aria-hidden /> Quitar
            </button>
          </div>
        ))}
        <button className="boton" onClick={() => setItems((xs) => [...xs, nuevo()])}>
          <Plus size={20} aria-hidden /> Agregar
        </button>
      </div>
      <div className="pie">
        <button className="boton primario grande" disabled={ocupado} onClick={enviar}>
          {ocupado ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
