import React, { useEffect, useMemo, useState } from 'react';

import AdminMarco from '../components/AdminMarco';
import Conversacion from '../components/Conversacion';
import { Estado } from './PortalInicio';
import { descargarHojas } from '../../asistencia/planilla';
import {
    columnas, detalleCosto, etiquetas, filasExport, money, mostrar, resumenCampos, titulos, totalDe,
} from '../respuestas';
import {
    ESTADOS, abrirEmergencia, bloque, cambiarEstado, comentarAdmin, fechaCorta, fechaHora, listarTickets,
    listarTipos, resolverPropuesta, tramoDe, tramoYSala, verTicket,
} from '../services/tickets';

const control = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-700';

/** Fecha, tramo pedido y sala de una versión en una línea, para comparar y
 *  mostrar. Van juntos porque salen de la misma reserva: cambiar de reunión los
 *  mueve a los tres de una vez y como tres líneas de diff se leería peor. */
const bloqueDe = (v) =>
    [fechaCorta(v.fecha_servicio), tramoYSala(v), v.reserva_asunto].filter(Boolean).join(' · ');

/** Campos que cambiaron entre dos versiones (la reserva del servicio incluida). */
export const diferencias = (actual, anterior) => {
    if (!anterior) return [];
    const salida = [];
    if (bloqueDe(actual) !== bloqueDe(anterior)) {
        salida.push({ campo: '__fecha', antes: bloqueDe(anterior), ahora: bloqueDe(actual) });
    }
    const claves = new Set([...Object.keys(actual.datos || {}), ...Object.keys(anterior.datos || {})]);
    for (const k of claves) {
        if (JSON.stringify(actual.datos?.[k]) !== JSON.stringify(anterior.datos?.[k])) {
            salida.push({ campo: k, antes: anterior.datos?.[k], ahora: actual.datos?.[k] });
        }
    }
    return salida;
};

/** Fecha del servicio partida en día / mes, para el bloque de la tarjeta. */
const diaMes = (iso) => {
    if (!iso) return { dia: '—', mes: '', semana: '' };
    const d = new Date(`${iso}`.length === 10 ? `${iso}T12:00:00` : iso);
    return {
        semana: d.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', ''),
        dia: d.toLocaleDateString('es-CL', { day: '2-digit' }),
        mes: d.toLocaleDateString('es-CL', { month: 'short' }).replace('.', ''),
    };
};

/** Primer título visible de la tarjeta: el servicio y dónde se presta. */
const encabezadoDe = (t) => [t.tipo, t.reserva_sala].filter(Boolean).join(' · ');

/** La acción principal que toca según en qué estado está la solicitud.
 *  Sin estado siguiente (rechazado, cerrado) se ofrece reabrir.
 *
 *  'en_revision' no está: lo que toca ahí es resolver la solicitud de cambio,
 *  y ese botón vive en su propia tarjeta. 'cancelado' tampoco: se bajó el
 *  solicitante, y reabrirlo por él sería decidir en su nombre. */
const SIGUIENTE = {
    pendiente: { estado: 'en_curso', label: 'Iniciar atención' },
    en_curso: { estado: 'cerrado', label: 'Cerrar solicitud' },
    cerrado: { estado: 'en_curso', label: 'Reabrir' },
    rechazado: { estado: 'en_curso', label: 'Reabrir' },
};

/** La marca de que una cancelación cayó dentro de la ventana que el casino
 *  cobra igual. Solo existe en el panel: la política de cancelación no es
 *  pública para el usuario final, y el portal nunca recibe este campo. */
function CancelacionTardia({ ticket }) {
    if (!ticket?.cancelacion_tardia) return null;
    return (
        <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-900"
            title="Canceló con menos de 24 horas: el casino lo cobra igual.">
            Cancelación tardía · se cobra
        </span>
    );
}

/** Dato de la ficha del encabezado: rótulo arriba, valor abajo. */
function Campo({ rotulo, children }) {
    return (
        <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{rotulo}</dt>
            <dd className="mt-0.5 text-sm text-gray-900">{children}</dd>
        </div>
    );
}

function Detalle({ id, tipos, onCambio }) {
    const [t, setT] = useState(null);
    const [pestaña, setPestaña] = useState('detalle');
    const [verVersion, setVerVersion] = useState(null);
    const [comentario, setComentario] = useState('');
    const [error, setError] = useState('');
    const [recarga, setRecarga] = useState(0);

    useEffect(() => {
        verTicket(id).then((d) => { setT(d); setVerVersion(d.version_actual); onCambio(); }).catch((e) => setError(e.message));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, recarga]);

    const tipo = tipos.find((x) => x.id === t?.tipo_id);
    const version = t?.versiones.find((v) => v.version === verVersion);
    const anterior = t?.versiones.find((v) => v.version === verVersion - 1);
    const nombres = useMemo(() => titulos(tipo?.definicion), [tipo]);
    const etqs = useMemo(() => etiquetas(tipo?.definicion), [tipo]);
    const cambios = version ? diferencias(version, anterior) : [];
    // El diff de la propuesta va contra la vigente, no contra la anterior:
    // es lo que cambiaría si el admin aprueba.
    const vigente = t?.versiones.find((v) => v.version === t.version_actual);
    const propuestos = t?.propuesta ? diferencias(t.propuesta, vigente) : [];

    // El panel lee, no llena: un formulario en modo display igual se dibuja con
    // inputs y cuesta leerlo de un vistazo. Acá va pregunta y respuesta, nada más.
    const resumen = useMemo(
        () => (version ? resumenCampos(tipo?.definicion, version.datos) : []),
        [tipo, version],
    );
    // El costo es el congelado de la versión que se está mirando, no el del
    // ticket: si no, una versión antigua se muestra con el precio de la vigente.
    // Los tickets anteriores a que se guardara por versión solo lo tienen arriba.
    const costo = version?.costo ?? (verVersion === t?.version_actual ? t?.costo : null);

    const resolver = async (aprobar) => {
        setError('');
        try {
            await resolverPropuesta(id, aprobar);
            setRecarga((n) => n + 1);
        } catch (e) { setError(e.message); }
    };

    const habilitarEmergencia = async () => {
        setError('');
        const hasta = window.prompt(
            'Hasta cuándo se podrá pedir cambios en esta solicitud.\nFormato: AAAA-MM-DD HH:MM',
            new Date(Date.now() + 864e5).toISOString().slice(0, 16).replace('T', ' '),
        );
        if (!hasta) return;
        const motivo = window.prompt('Motivo (queda visible para el usuario):', '') || '';
        try {
            // Sin zona: el navegador la interpreta local, que es como la piensa
            // quien la escribe, y viaja en ISO con offset.
            const cuando = new Date(hasta.replace(' ', 'T'));
            if (Number.isNaN(cuando.getTime())) throw new Error('Fecha y hora no válidas.');
            await abrirEmergencia(id, cuando.toISOString(), motivo);
            setRecarga((n) => n + 1);
        } catch (e) { setError(e.message); }
    };

    const mover = async (estado) => {
        setError('');
        try {
            await cambiarEstado(id, estado, comentario);
            setComentario('');
            setRecarga((n) => n + 1);
        } catch (e) {
            setError(e.message);
        }
    };

    const soloComentar = async () => {
        setError('');
        if (!comentario.trim()) { setError('Escribe un comentario antes de enviarlo.'); return; }
        try {
            await comentarAdmin(id, comentario.trim());
            setComentario('');
            setRecarga((n) => n + 1);
        } catch (e) { setError(e.message); }
    };

    const rechazar = () => {
        // El motivo es lo único que el usuario va a leer del rechazo.
        if (!comentario.trim()) { setError('Para rechazar hay que dejarle un comentario al solicitante.'); return; }
        return mover('rechazado');
    };

    if (!t) {
        return (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
                {error || 'Cargando…'}
            </div>
        );
    }

    const siguiente = SIGUIENTE[t.estado];
    const PESTAÑAS = [['detalle', 'Detalle'], ['seguimiento', 'Seguimiento'], ['versiones', 'Versiones']];

    return (
        <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-xl font-semibold text-gray-900">
                            <span className="font-mono text-gray-500">#{t.id}</span> · {t.tipo}
                        </h2>
                        <Estado estado={t.estado} />
                        <CancelacionTardia ticket={t} />
                        {t.modificado && (
                            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                v{t.version_actual} nueva
                            </span>
                        )}
                    </div>
                    <span className="text-xs text-gray-500">Creado {fechaHora(t.created_at)}</span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl bg-gray-50 p-4 lg:grid-cols-4">
                    <Campo rotulo="Servicio">
                        {fechaCorta(t.fecha_servicio)} · {tramoDe(t) || '—'}
                        {/* El tramo pedido puede ser más corto que la reunión: quien
                            atiende necesita ver los dos para saber si cabe. */}
                        {bloque(t) && bloque(t) !== tramoDe(t) && (
                            <span className="block text-xs text-gray-500">reserva {bloque(t)}</span>
                        )}
                    </Campo>
                    <Campo rotulo="Lugar">{t.reserva_sala || '—'}</Campo>
                    <Campo rotulo="Reunión">{t.reserva_asunto || '—'}</Campo>
                    <Campo rotulo="Solicitante">
                        {t.usuario || '—'}
                        <a className="block text-xs text-red-800 underline" href={`mailto:${t.email}`}>{t.email}</a>
                    </Campo>
                    <div className="col-span-2 lg:col-span-4">
                        <Campo rotulo="Plazo para editar">
                            {fechaHora(t.plazo_efectivo || t.plazo)}
                            {t.plazo_emergencia && (
                                <span className="ml-2 text-xs text-amber-700">plazo de emergencia abierto</span>
                            )}
                            {(t.estado === 'pendiente' || t.estado === 'en_curso') && (
                                <button type="button" onClick={habilitarEmergencia}
                                    className="ml-3 text-xs text-red-800 underline">
                                    {t.plazo_emergencia ? 'Cambiar plazo de emergencia' : 'Extender plazo'}
                                </button>
                            )}
                        </Campo>
                    </div>
                </dl>

                {t.propuesta && (
                    <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                        <h3 className="text-sm font-semibold text-amber-900">
                            Solicitud de cambio esperando respuesta
                        </h3>
                        <p className="mt-1 text-xs text-amber-800">
                            Enviada el {fechaHora(t.propuesta.created_at)} · versión {t.propuesta.version}.
                            Hasta que la apruebes rige la v{t.version_actual}.
                        </p>
                        {propuestos.length > 0 ? (
                            <ul className="mt-3 space-y-1 text-sm text-amber-900">
                                {propuestos.map((c) => (
                                    <li key={c.campo}>
                                        <span className="font-medium">
                                            {c.campo === '__fecha' ? 'Reserva del servicio' : nombres[c.campo] || c.campo}:
                                        </span>{' '}
                                        <span className="line-through opacity-60">{mostrar(c.antes, etqs)}</span>
                                        {' → '}{mostrar(c.ahora, etqs)}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="mt-3 text-sm text-amber-900">Sin diferencias con la versión vigente.</p>
                        )}
                        <div className="mt-4 flex gap-2">
                            <button type="button" onClick={() => resolver(true)}
                                className="rounded-lg bg-green-700 px-3 py-2 text-sm text-white hover:bg-green-800">
                                Aprobar el cambio
                            </button>
                            <button type="button" onClick={() => resolver(false)}
                                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-100">
                                Rechazar
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex gap-1 border-b border-gray-200 px-5">
                {PESTAÑAS.map(([clave, label]) => (
                    <button key={clave} type="button" onClick={() => setPestaña(clave)}
                        aria-pressed={pestaña === clave}
                        className={`bg-transparent px-4 py-2.5 text-sm ${
                            pestaña === clave
                                ? 'font-bold text-red-800'
                                : 'font-medium text-gray-500 hover:text-gray-800'
                        }`}>
                        {label}
                    </button>
                ))}
            </div>

            <div className="min-h-[18rem] p-5">
                {pestaña === 'detalle' && (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold text-gray-900">Respuestas del formulario</h3>
                            <span className="rounded-md bg-gray-900 px-2.5 py-1 text-xs text-white">
                                v{verVersion}{verVersion === t.version_actual ? ' · vigente' : ''}
                            </span>
                        </div>
                        <dl className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
                            {resumen.map((c) => (
                                <div key={c.name} className="grid grid-cols-1 gap-x-6 py-2.5 sm:grid-cols-[14rem_minmax(0,1fr)]">
                                    <dt className="text-sm text-gray-600">
                                        {c.title}
                                        {c.fueraDelFormulario && (
                                            <span className="ml-1 text-xs text-gray-400">(ya no se pregunta)</span>
                                        )}
                                    </dt>
                                    <dd className="whitespace-pre-wrap text-sm text-gray-900">
                                        {mostrar(version?.datos?.[c.name], etqs)}
                                    </dd>
                                </div>
                            ))}
                            {resumen.length === 0 && (
                                <p className="py-4 text-sm text-gray-500">Esta versión no tiene respuestas guardadas.</p>
                            )}
                        </dl>

                        {/* El costo va aparte: no sale del formulario sino del
                            catálogo al momento de guardar, y es lo congelado. */}
                        {costo?.lineas?.length > 0 && (
                            <div className="mt-5 rounded-xl border border-gray-200 p-4">
                                <h4 className="text-sm font-semibold text-gray-900">Costo</h4>
                                <ul className="mt-2 divide-y divide-gray-100 text-sm">
                                    {costo.lineas.map((l, i) => (
                                        <li key={i} className="flex justify-between gap-4 py-1.5">
                                            <span className="text-gray-600">
                                                {l.nombre}{l.cantidad > 1 && <span className="text-gray-400"> × {l.cantidad}</span>}
                                            </span>
                                            <span className="tabular-nums text-gray-900">{money(l.subtotal ?? l.valor_unitario)}</span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="mt-2 flex justify-between gap-4 border-t border-gray-200 pt-2 text-sm font-semibold">
                                    <span>Total</span>
                                    <span className="tabular-nums">{money(costo.total)}</span>
                                </p>
                            </div>
                        )}
                    </>
                )}

                {pestaña === 'seguimiento' && (
                    <Conversacion
                        lado="admin"
                        eventos={t.eventos}
                        onEnviar={async (texto) => { await comentarAdmin(id, texto); setRecarga((n) => n + 1); }}
                    />
                )}

                {pestaña === 'versiones' && (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold text-gray-900">Versiones</h3>
                            <div className="flex flex-wrap gap-1">
                                {t.versiones.map((v) => (
                                    <button key={v.version} onClick={() => setVerVersion(v.version)}
                                        title={`${fechaHora(v.created_at)}${v.estado !== 'vigente' ? ` · ${v.estado}` : ''}`}
                                        className={`rounded-md px-2.5 py-1 text-xs ${
                                            v.version === verVersion
                                                ? 'bg-gray-900 text-white'
                                                : v.estado === 'propuesta'
                                                    ? 'border border-amber-400 bg-amber-50 text-amber-800'
                                                    : v.estado === 'rechazada'
                                                        ? 'border border-gray-200 text-gray-400 line-through'
                                                        : 'border border-gray-300 text-gray-700'
                                        }`}>
                                        v{v.version}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {version && (
                            <p className="mt-2 text-xs text-gray-500">
                                v{version.version} enviada el {fechaHora(version.created_at)} · servicio {bloqueDe(version)}
                            </p>
                        )}
                        {cambios.length > 0 ? (
                            <div className="mt-3 rounded-lg bg-amber-50 p-3">
                                <p className="text-xs font-semibold text-amber-900">Cambios respecto de v{verVersion - 1}</p>
                                <ul className="mt-1 space-y-1 text-sm text-amber-900">
                                    {cambios.map((c) => (
                                        <li key={c.campo}>
                                            <span className="font-medium">{c.campo === '__fecha' ? 'Reserva del servicio' : nombres[c.campo] || c.campo}:</span>{' '}
                                            <span className="line-through opacity-60">{mostrar(c.antes, etqs)}</span> → {mostrar(c.ahora, etqs)}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="mt-3 text-sm text-gray-500">
                                {verVersion > 1 ? 'Sin diferencias con la versión anterior.' : 'Es la versión original.'}
                            </p>
                        )}
                        <p className="mt-3 text-xs text-gray-500">
                            Las respuestas de la versión elegida se ven en la pestaña Detalle.
                        </p>
                    </>
                )}
            </div>

            <div className="border-t border-gray-200 bg-gray-50 p-5">
                <label className="mb-1 block text-sm font-medium text-gray-900" htmlFor="tk-coment-estado">
                    Comentario al solicitante <span className="font-normal text-gray-500">(obligatorio para rechazar)</span>
                </label>
                <textarea id="tk-coment-estado" rows={2} className={`${control} w-full bg-white`} value={comentario}
                    onChange={(e) => setComentario(e.target.value)} maxLength={2000} />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {siguiente && (
                        <button type="button" onClick={() => mover(siguiente.estado)}
                            className="rounded-lg bg-red-800 px-4 py-2 text-sm font-medium text-white hover:bg-red-900">
                            {siguiente.label}
                        </button>
                    )}
                    <button type="button" onClick={soloComentar}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-100">
                        Solo comentar
                    </button>
                    {t.estado !== 'rechazado' && t.estado !== 'cancelado' && (
                        <button type="button" onClick={rechazar}
                            className="ml-auto rounded-lg border border-red-300 bg-white px-4 py-2 text-sm text-red-800 hover:bg-red-50">
                            Rechazar
                        </button>
                    )}
                </div>
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </div>
        </div>
    );
}

export default function AdminTickets() {
    const [tickets, setTickets] = useState([]);
    const [tipos, setTipos] = useState([]);
    const [filtros, setFiltros] = useState({ estado: '', tipo_id: '', q: '', desde: '', hasta: '' });
    const [abierto, setAbierto] = useState(null);
    const [error, setError] = useState('');
    // La tabla necesita las respuestas de cada ticket; el listado no, así que
    // solo se piden cuando toca mostrarlas.
    const [tabla, setTabla] = useState(false);

    const recargar = () => listarTickets({ ...filtros, incluir_datos: tabla || undefined })
        .then(setTickets).catch((e) => setError(e.message));

    useEffect(() => { listarTipos().then(setTipos).catch((e) => setError(e.message)); }, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { recargar(); }, [filtros.estado, filtros.tipo_id, filtros.desde, filtros.hasta, tabla]);

    const modificados = tickets.filter((t) => t.modificado).length;
    const tipoElegido = tipos.find((t) => String(t.id) === String(filtros.tipo_id));
    const cols = useMemo(() => columnas(tipoElegido?.definicion), [tipoElegido]);
    // Las respuestas guardan el `value`; el texto de la opción sale de la definición.
    const etqs = useMemo(() => etiquetas(tipoElegido?.definicion), [tipoElegido]);
    // Suma de lo congelado en cada ticket, no un recálculo: es lo que de
    // verdad costó. null si ninguno tiene costo, para no mostrar un $0 falso.
    const totalPeriodo = useMemo(() => {
        const conCosto = tickets.map(totalDe).filter((v) => v !== null);
        return conCosto.length ? conCosto.reduce((a, b) => a + b, 0) : null;
    }, [tickets]);
    // Sin un tipo elegido no hay un juego de columnas común que mostrar.
    const enTabla = tabla && !!tipoElegido;

    const descargar = () => {
        const { columns, rows } = filasExport(tickets, cols, etqs);
        const hoja = (tipoElegido.nombre || 'Solicitudes').trim() || 'Solicitudes';
        const fecha = new Date().toISOString().slice(0, 10);
        descargarHojas([{ nombre: hoja, rows, columns }], `tickets_${hoja}_${fecha}.xlsx`);
    };

    return (
        <AdminMarco>
            {/* Los filtros van en una sola tarjeta: estado arriba, porque es el
                corte que más se cambia, y la búsqueda fina abajo. */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                    {[['', 'Todas'], ...Object.entries(ESTADOS).map(([k, e]) => [k, e.label])].map(([valor, label]) => (
                        <button key={valor || 'todas'} type="button"
                            onClick={() => setFiltros({ ...filtros, estado: valor })}
                            aria-pressed={filtros.estado === valor}
                            className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                                filtros.estado === valor
                                    ? 'border-gray-900 bg-gray-900 text-white'
                                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                            }`}>
                            {label}
                        </button>
                    ))}
                    {modificados > 0 && (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                            {modificados} modificado{modificados > 1 ? 's' : ''} sin revisar
                        </span>
                    )}
                    <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-gray-300">
                        {[['Lista', false], ['Tabla', true]].map(([etiqueta, valor]) => (
                            <button key={etiqueta} type="button" onClick={() => setTabla(valor)}
                                aria-pressed={tabla === valor}
                                className={`px-4 py-1.5 text-sm ${tabla === valor ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'}`}>
                                {etiqueta}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <form onSubmit={(e) => { e.preventDefault(); recargar(); }} className="flex min-w-[16rem] flex-1 gap-2">
                        <input type="search" className={`${control} flex-1`} placeholder="Buscar por N°, solicitante o correo"
                            value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} />
                        <button className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-100">Buscar</button>
                    </form>
                    <select className={control} value={filtros.tipo_id} aria-label="Tipo"
                        onChange={(e) => setFiltros({ ...filtros, tipo_id: e.target.value })}>
                        <option value="">Todos los tipos</option>
                        {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                    {/* El rango va sobre la fecha de envío: responde "cuántos
                        servicios hubo en este período", no cuándo se prestan. */}
                    <label className="flex items-center gap-1 text-sm text-gray-600">
                        Enviadas desde
                        <input type="date" className={control} value={filtros.desde} max={filtros.hasta || undefined}
                            onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} />
                    </label>
                    <label className="flex items-center gap-1 text-sm text-gray-600">
                        hasta
                        <input type="date" className={control} value={filtros.hasta} min={filtros.desde || undefined}
                            onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} />
                    </label>
                    {(filtros.desde || filtros.hasta) && (
                        <button type="button" onClick={() => setFiltros({ ...filtros, desde: '', hasta: '' })}
                            className="text-xs text-red-800 underline">
                            Limpiar fechas
                        </button>
                    )}
                    {tabla && !tipoElegido && (
                        <span className="text-xs text-gray-500">Elige un tipo de solicitud para ver la tabla</span>
                    )}
                    {enTabla && totalPeriodo !== null && (
                        <span className="text-sm text-gray-600">
                            Total: <strong className="tabular-nums">{money(totalPeriodo)}</strong>
                        </span>
                    )}
                    {enTabla && (
                        <button type="button" onClick={descargar} disabled={tickets.length === 0}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-100 disabled:opacity-50">
                            Descargar Excel
                        </button>
                    )}
                </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            {enTabla ? (
                <div className="mt-4 overflow-auto rounded-xl border border-gray-200 bg-white">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                            <tr>
                                <th className="px-3 py-2 font-medium">N°</th>
                                <th className="px-3 py-2 font-medium">Solicitante</th>
                                <th className="px-3 py-2 font-medium">Estado</th>
                                <th className="px-3 py-2 font-medium">Reserva</th>
                                <th className="px-3 py-2 text-right font-medium">Costo</th>
                                {cols.map((c) => (
                                    <th key={c.name} className="px-3 py-2 font-medium">{c.title}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {tickets.map((t) => (
                                // Abrir una fila lleva al detalle de siempre: la tabla cambia
                                // cómo se listan las respuestas, no cómo se atienden.
                                <tr key={t.id} onClick={() => { setTabla(false); setAbierto(t.id); }}
                                    className="cursor-pointer align-top hover:bg-gray-50">
                                    <td className="px-3 py-2 font-mono text-gray-500">#{t.id}</td>
                                    <td className="px-3 py-2">{t.usuario || t.email}</td>
                                    <td className="px-3 py-2">
                                        <Estado estado={t.estado} />
                                        <CancelacionTardia ticket={t} />
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap">{bloqueDe(t)}</td>
                                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums"
                                        title={detalleCosto(t)}>
                                        {money(totalDe(t))}
                                    </td>
                                    {cols.map((c) => {
                                        const texto = mostrar(t.datos?.[c.name], etqs);
                                        return (
                                            <td key={c.name} className="max-w-[16rem] truncate px-3 py-2" title={texto}>
                                                {texto}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                            {tickets.length === 0 && (
                                <tr>
                                    <td colSpan={5 + cols.length} className="px-4 py-8 text-center text-sm text-gray-500">
                                        Sin solicitudes con esos filtros.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
            /* Izquierda: el listado, pegado y con scroll propio, para que la
               página no crezca con cientos de solicitudes. Derecha: el detalle. */
            <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white lg:sticky lg:top-4">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 text-xs text-gray-500">
                        <span>{tickets.length} solicitud{tickets.length === 1 ? '' : 'es'}</span>
                        <span>Orden: el del servidor</span>
                    </div>
                    <ul className="max-h-[50vh] divide-y divide-gray-100 overflow-y-auto lg:max-h-[calc(100vh-10rem)]">
                        {tickets.map((t) => {
                            const f = diaMes(t.fecha_servicio);
                            return (
                                <li key={t.id}>
                                    <button onClick={() => setAbierto(t.id)}
                                        className={`flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-gray-50 ${
                                            abierto === t.id ? 'border-l-4 border-red-800 bg-red-50 pl-2' : 'border-l-4 border-transparent pl-2'
                                        }`}>
                                        <span className="flex w-12 shrink-0 flex-col items-center rounded-lg border border-gray-200 py-1 leading-tight">
                                            <span className="text-[10px] uppercase text-gray-500">{f.semana}</span>
                                            <span className="text-lg font-semibold text-gray-900">{f.dia}</span>
                                            <span className="text-[10px] text-gray-500">{f.mes}</span>
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-start justify-between gap-2">
                                                {/* Número, servicio y sala juntos: es con lo que se
                                                    identifica una solicitud al buscarla en la lista. */}
                                                <span className="truncate text-sm font-medium text-gray-900">
                                                    <span className="font-mono text-gray-500">#{t.id}</span> · {encabezadoDe(t)}
                                                </span>
                                                {/* La columna es angosta: sin esto "En curso" se parte
                                                    en dos líneas y la tarjeta queda más alta. */}
                                                <span className="shrink-0 whitespace-nowrap">
                                                    <Estado estado={t.estado} />
                                                </span>
                                            </span>
                                            {/* Solicitante y horario en una línea cada uno: compartiendo
                                                una sola, un nombre largo se comía el horario. */}
                                            <span className="mt-0.5 block truncate text-xs text-gray-500">
                                                {t.usuario || t.email}
                                            </span>
                                            <span className="mt-0.5 block truncate text-xs text-gray-500">
                                                {tramoDe(t) || '—'}
                                            </span>
                                            {t.modificado && (
                                                <span className="mt-1 block text-xs font-medium text-amber-700">
                                                    v{t.version_actual} nueva sin revisar
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                        {tickets.length === 0 && <li className="px-4 py-8 text-center text-sm text-gray-500">Sin solicitudes con esos filtros.</li>}
                    </ul>
                </div>

                <div>
                    {abierto ? (
                        <Detalle key={abierto} id={abierto} tipos={tipos} onCambio={recargar} />
                    ) : (
                        <p className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">
                            Selecciona una solicitud para ver su detalle, versiones y seguimiento.
                        </p>
                    )}
                </div>
            </div>
            )}
        </AdminMarco>
    );
}
