// Gestión: inventario de huevos e insumos, sanidad pendiente y lo registrado en las áreas (sala, bodega, despachos…).
// Lo que se registra aquí usa los mismos formularios que el personal de cada área.
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ClipboardList, Plus, RefreshCw, Settings2, Syringe } from 'lucide-react';
import { traerSaldos } from '../lib/app';
import { ir, useEstado } from '../lib/estado';
import {
  AREAS_INFO, BODEGA_INSUMOS, POZO_MERMA, activos, areasDisponibles, calibresDe, enEnvases, envasesDe, modulosDe, nombreBodega, nombreCalibre,
  resumenGestion, tituloGestion,
} from '../lib/modulos';
import type { Area } from '../lib/tipos';
import { fechaCorta, fechaRelativa, hora, num, sumarDias } from '../lib/util';
import { ACCIONES_AREA, vacunasPendientes } from './areas';
import { useIndice } from './operario';

export function Gestion() {
  const config = useEstado((e) => e.config)!;
  const hoy = useEstado((e) => e.hoy);
  const saldos = useEstado((e) => e.saldos);
  const saldosHora = useEstado((e) => e.saldosHora);
  const indice = useIndice();
  const [cargando, setCargando] = useState(false);
  const m = modulosDe(config);
  const areas = areasDisponibles(config).filter((a): a is Exclude<Area, 'galpones'> => a !== 'galpones');
  const hayInventario = m.bodega || m.proceso || m.despachos || m.recuperacion;
  const traer = async () => {
    setCargando(true);
    try {
      await traerSaldos();
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => {
    if ((hayInventario || m.insumos) && (!saldosHora || Date.now() - saldosHora > 60000)) traer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pendientes = m.sanidad ? vacunasPendientes(config, indice.gestion, hoy, 7) : [];
  const recientes = useMemo(
    () =>
      indice.gestion
        .filter((r) => r.fecha >= sumarDias(hoy, -14) && indice.esVigente(r))
        .sort((a, b) => (b.capturado ?? b.capturado_dispositivo).localeCompare(a.capturado ?? a.capturado_dispositivo))
        .slice(0, 25),
    [indice, hoy],
  );

  if (!areas.length) {
    return (
      <div className="gestion">
        <h2 className="titulo">Gestión</h2>
        <div className="tarjeta pila">
          <p className="fuerte">Activa lo que usa tu plantel</p>
          <p className="suave">
            Sala de proceso, bodega de huevos, despachos, recuperación, insumos y sanidad son módulos. Préndelos según tu plantel (por ejemplo, una
            avícola de reproductoras no usa sala de proceso) y aparecen aquí y para las personas a cargo.
          </p>
          <button className="boton primario" onClick={() => ir({ p: 'ajuste', cual: 'modulos' })}>
            <Settings2 size={20} aria-hidden /> Elegir módulos
          </button>
        </div>
      </div>
    );
  }

  const envases = envasesDe(config);
  const huevos = (saldos ?? []).filter((s) => s.b !== BODEGA_INSUMOS);
  const bodegas = [...new Set(huevos.map((s) => s.b))];
  const insumos = activos(config.insumos ?? []);
  const stock = (id: string) => (saldos ?? []).find((s) => s.b === BODEGA_INSUMOS && s.k === id);

  return (
    <div className="gestion">
      <header className="linea-h entre envolver">
        <h2 className="titulo">Gestión</h2>
        <button className="boton chico" onClick={() => ir({ p: 'ajuste', cual: 'modulos' })}>
          <Settings2 size={18} aria-hidden /> Módulos
        </button>
      </header>

      <section>
        <h3 className="seccion">Registrar</h3>
        <div className="gestion-acciones">
          {areas.map((a) => (
            <div key={a} className="tarjeta gestion-area">
              <button className="gestion-area-titulo" onClick={() => ir({ p: 'area', area: a })}>
                {AREAS_INFO.find((x) => x.id === a)?.nombre}
                <ChevronRight size={18} aria-hidden />
              </button>
              {ACCIONES_AREA[a].map((x) => (
                <button key={x.nombre} className="boton chico" onClick={() => ir({ p: 'form', tipo: x.tipo, sub: x.sub })}>
                  <Plus size={18} aria-hidden /> {x.nombre}
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      {pendientes.length > 0 && (
        <section className="tarjeta aviso-atencion">
          <p className="fuerte linea-h">
            <Syringe size={20} aria-hidden /> Plan sanitario: {pendientes.length} {pendientes.length === 1 ? 'vacuna pendiente' : 'vacunas pendientes'}
          </p>
          {pendientes.map((p) => (
            <p key={`${p.plan_id}-${p.lote_id}`} className="chico">
              {p.producto} ({p.via}), {p.lote}: {p.atrasada ? `atrasada desde el ${fechaCorta(p.fecha)}` : `toca el ${fechaCorta(p.fecha)}`}
            </p>
          ))}
          <button className="boton chico" onClick={() => ir({ p: 'form', tipo: 'sanidad', sub: 'vacuna' })}>
            Registrar vacunación
          </button>
        </section>
      )}

      {hayInventario && (
        <section>
          <div className="linea-h entre">
            <h3 className="seccion">Inventario de huevos</h3>
            <button className="enlace" onClick={traer} disabled={cargando}>
              <RefreshCw size={16} aria-hidden /> {cargando ? 'Actualizando…' : saldosHora ? `Actualizado a las ${hora(new Date(saldosHora).toISOString())}` : 'Actualizar'}
            </button>
          </div>
          {saldos === null ? (
            <p className="suave">Se calcula en el servidor al conectarse.</p>
          ) : !huevos.length ? (
            <p className="suave">Todavía no hay movimientos de huevos.</p>
          ) : (
            <div className="tabla-wrap">
              <table className="datos">
                <thead>
                  <tr>
                    <th scope="col">Calibre</th>
                    {bodegas.map((b) => (
                      <th key={b} scope="col">
                        {b === POZO_MERMA ? 'Merma por recuperar' : nombreBodega(config, b)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(huevos.map((s) => s.k))]
                    .sort((a, b) => calibresDe(config).findIndex((c) => c.id === a) - calibresDe(config).findIndex((c) => c.id === b))
                    .map((k) => (
                      <tr key={k}>
                        <th scope="row">{nombreCalibre(config, k)}</th>
                        {bodegas.map((b) => {
                          const s = huevos.find((x) => x.b === b && x.k === k);
                          return (
                            <td key={b} className={s && s.q < 0 ? 'mal' : undefined} title={s?.diferencia ? `Último conteo: diferencia de ${num(s.diferencia)} huevos` : undefined}>
                              {s ? enEnvases(s.q, envases) : '–'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          {huevos.some((s) => s.q < 0) && <p className="chico error-texto">Hay saldos negativos: falta registrar una entrada o un conteo.</p>}
        </section>
      )}

      {m.insumos && insumos.length > 0 && (
        <section>
          <h3 className="seccion">Insumos</h3>
          <div className="tabla-wrap">
            <table className="datos">
              <thead>
                <tr>
                  <th scope="col">Insumo</th>
                  <th scope="col">Stock</th>
                  <th scope="col">Mínimo</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {insumos.map((x) => {
                  const s = stock(x.id);
                  const bajo = s && x.minimo != null && s.q <= x.minimo;
                  return (
                    <tr key={x.id}>
                      <th scope="row">{x.nombre}</th>
                      <td>{s ? `${num(s.q, 1)} ${x.unidad}` : '–'}</td>
                      <td>{x.minimo != null ? `${num(x.minimo)} ${x.unidad}` : '–'}</td>
                      <td className={bajo ? 'mal' : undefined}>{!s ? 'Sin movimientos' : bajo ? 'Bajo el mínimo' : 'Bien'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h3 className="seccion">Últimos 14 días</h3>
        {recientes.length ? (
          <div className="lista">
            {recientes.map((r) => (
              <button key={r.id} className="fila" onClick={() => ir({ p: 'registro', id: r.id })}>
                <span className={`medallon ${r.flags.includes('ilogico') ? 'mal' : 'hecho'}`}>
                  <ClipboardList size={22} />
                </span>
                <span className="fila-cuerpo">
                  <span className="fila-titulo" style={{ display: 'block' }}>
                    {tituloGestion(config, r)}
                  </span>
                  <span className="fila-detalle" style={{ display: 'block' }}>
                    {resumenGestion(config, r)}. {fechaRelativa(r.fecha)}, {r.usuario_nombre}
                  </span>
                </span>
                <ChevronRight className="flecha" aria-hidden />
              </button>
            ))}
          </div>
        ) : (
          <p className="suave">Nada registrado en estas dos semanas.</p>
        )}
      </section>
    </div>
  );
}
