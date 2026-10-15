import React, { useEffect, useMemo, useState } from 'react';

import AdminMarco from '../components/AdminMarco';
import Desglosado from '../components/Desglosado';
import Seguimiento from '../components/Seguimiento';
import { Estado } from './PortalInicio';
import {
    enTexto, etiquetas, money, resumenCampos, titulos, totalDe, valoresDe,
} from '../respuestas';
import {
    ESTADOS, abrirEmergencia, bloque, cambiarEstado, diaMes, encabezadoDe, fechaCorta,
    fechaHora, listarTickets, listarTipos, resolverPropuesta, tramoDe, tramoYSala, verTicket,
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
                                        <span className="line-through opacity-60">{enTexto(c.antes, etqs)}</span>
                                        {' → '}{enTexto(c.ahora, etqs)}
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
                        {/* Sin líneas divisorias: lo que separa una respuesta de la
                            siguiente es el realce al pasar por encima, que además
                            acompaña la lectura en un formulario largo. El -mx-2 con
                            px-2 deja que la banda respire sin mover la grilla. */}
                        <dl className="mt-4">
                            {resumen.map((c) => (
                                <div key={c.name}
                                    className="-mx-2 grid grid-cols-1 gap-x-6 rounded-lg px-2 py-2.5 transition-colors hover:bg-gray-50 sm:grid-cols-[14rem_minmax(0,1fr)]">
                                    <dt className="text-sm text-gray-600">
                                        {c.title}
                                        {c.fueraDelFormulario && (
                                            <span className="ml-1 text-xs text-gray-400">(ya no se pregunta)</span>
                                        )}
                                    </dt>
                                    <dd className="text-sm text-gray-900">
                                        <Desglosado valores={valoresDe(version?.datos?.[c.name], etqs)} />
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

                {pestaña === 'seguimiento' && <Seguimiento lado="admin" ticket={t} />}

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
                                            <span className="line-through opacity-60">{enTexto(c.antes, etqs)}</span> → {enTexto(c.ahora, etqs)}
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
                    Comentario al solicitante{' '}
                    <span className="font-normal text-gray-500">
                        (viaja con el cambio de estado; obligatorio para rechazar)
                    </span>
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

/** El orden que el admin le dio a las tarjetas dentro de cada columna. Vive en
 *  el navegador: es una comodidad visual personal, no un dato de la solicitud,
 *  así que no toca el backend. Mapa estado -> [ids en el orden elegido]. */
const CLAVE_ORDEN = 'tk_kanban_orden';
const leerOrden = () => {
    try { return JSON.parse(localStorage.getItem(CLAVE_ORDEN)) || {}; } catch { return {}; }
};
const guardarOrden = (o) => {
    try { localStorage.setItem(CLAVE_ORDEN, JSON.stringify(o)); } catch { /* sin storage: dura la sesión */ }
};

/** Ordena los tickets de una columna según los ids guardados. Los que no estén
 *  en la lista (recién llegados) caen al final conservando el orden del servidor,
 *  porque el sort es estable. */
const ordenarPorIds = (lista, ids) => {
    if (!ids?.length) return lista;
    const pos = new Map(ids.map((id, i) => [id, i]));
    return [...lista].sort((a, b) => (pos.get(a.id) ?? Infinity) - (pos.get(b.id) ?? Infinity));
};

/** Tarjeta de una solicitud en el tablero. Misma identidad que en la lista
 *  (fecha, #id · servicio, solicitante), sin la píldora de estado porque la
 *  columna ya lo dice. Se arrastra para reordenar y se hace clic para abrirla. */
function TarjetaKanban({ ticket, onAbrir, onArrastrar, onSoltar, soltando }) {
    const f = diaMes(ticket.fecha_servicio);
    const costo = totalDe(ticket);
    return (
        <li
            draggable
            onDragStart={() => onArrastrar(ticket.id)}
            onDragEnd={() => onArrastrar(null)}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onSoltar(ticket.id); }}
            className={`rounded-lg border bg-white ${soltando ? 'border-red-400' : 'border-gray-200'} ${
                ticket.modificado ? 'animate-respira shadow-[inset_0_0_0_1.5px_var(--color-amber-400)]' : ''
            }`}>
            <button type="button" onClick={() => onAbrir(ticket.id)}
                className="flex w-full cursor-grab items-start gap-2.5 px-2.5 py-2.5 text-left active:cursor-grabbing">
                <span className="flex w-11 shrink-0 flex-col items-center rounded-lg border border-gray-200 py-1 leading-tight">
                    <span className="text-[10px] uppercase text-gray-500">{f.semana}</span>
                    <span className="text-base font-semibold text-gray-900">{f.dia}</span>
                    <span className="text-[10px] text-gray-500">{f.mes}</span>
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">
                        <span className="font-mono text-gray-500">#{ticket.id}</span> · {encabezadoDe(ticket)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-gray-500">{ticket.usuario || ticket.email}</span>
                    <span className="mt-0.5 flex items-center justify-between gap-2 text-xs text-gray-500">
                        <span className="truncate">{tramoDe(ticket) || '—'}</span>
                        {costo !== null && <span className="shrink-0 tabular-nums">{money(costo)}</span>}
                    </span>
                    {ticket.modificado && (
                        <span className="mt-1 block text-xs font-medium text-amber-700">
                            v{ticket.version_actual} nueva sin revisar
                        </span>
                    )}
                </span>
            </button>
        </li>
    );
}

/** Tablero por estado. Una columna fija por cada estado; las solicitudes caen en
 *  la suya según el dato real. Arrastrar solo reordena dentro de la misma columna
 *  y guarda ese orden local: no cambia el estado del ticket (eso se hace en el
 *  detalle, con sus reglas). Por eso soltar en otra columna no hace nada. */
function Kanban({ tickets, onAbrir }) {
    const [orden, setOrden] = useState(leerOrden);
    // { id, estado } de la tarjeta que se está arrastrando, para saber a qué
    // columna pertenece y marcar dónde caería.
    const [arrastrando, setArrastrando] = useState(null);
    const [sobre, setSobre] = useState(null);

    const porEstado = useMemo(() => {
        const m = Object.fromEntries(Object.keys(ESTADOS).map((k) => [k, []]));
        for (const t of tickets) (m[t.estado] || (m[t.estado] = [])).push(t);
        return m;
    }, [tickets]);

    const columnas = useMemo(
        () => Object.entries(ESTADOS).map(([estado, def]) => ({
            estado, def, lista: ordenarPorIds(porEstado[estado] || [], orden[estado]),
        })),
        [porEstado, orden],
    );

    // Inserta la tarjeta arrastrada antes de `destinoId` (o al final si es null)
    // dentro de su propia columna. Fuera de ella, no hace nada.
    const soltar = (estado, destinoId) => {
        setSobre(null);
        if (!arrastrando || arrastrando.estado !== estado || arrastrando.id === destinoId) return;
        const ids = (columnas.find((c) => c.estado === estado)?.lista || []).map((t) => t.id);
        const sin = ids.filter((id) => id !== arrastrando.id);
        const i = destinoId == null ? sin.length : sin.indexOf(destinoId);
        sin.splice(i < 0 ? sin.length : i, 0, arrastrando.id);
        const nuevo = { ...orden, [estado]: sin };
        setOrden(nuevo);
        guardarOrden(nuevo);
    };

    return (
        <div className="mt-4 flex gap-4 overflow-x-auto pb-3">
            {columnas.map(({ estado, def, lista }) => (
                <section key={estado} className="flex w-72 shrink-0 flex-col rounded-xl border border-gray-200 bg-gray-50">
                    <header className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${def.clase}`}>{def.label}</span>
                        <span className="text-xs tabular-nums text-gray-500">{lista.length}</span>
                    </header>
                    <ul
                        onDragOver={(e) => { if (arrastrando?.estado === estado) { e.preventDefault(); setSobre(estado); } }}
                        onDrop={(e) => { e.preventDefault(); soltar(estado, null); }}
                        className={`flex min-h-[6rem] flex-1 flex-col gap-2 p-2 ${
                            arrastrando?.estado === estado && sobre === estado ? 'bg-red-50/60' : ''
                        }`}>
                        {lista.map((t) => (
                            <TarjetaKanban key={t.id} ticket={t} onAbrir={onAbrir}
                                onArrastrar={(id) => setArrastrando(id == null ? null : { id, estado })}
                                onSoltar={(destinoId) => soltar(estado, destinoId)}
                                soltando={false} />
                        ))}
                        {lista.length === 0 && (
                            <p className="px-2 py-6 text-center text-xs text-gray-400">Sin solicitudes</p>
                        )}
                    </ul>
                </section>
            ))}
        </div>
    );
}

export default function AdminTickets() {
    const [tickets, setTickets] = useState([]);
    const [tipos, setTipos] = useState([]);
    const [filtros, setFiltros] = useState({ estado: '', tipo_id: '', q: '', desde: '', hasta: '' });
    const [abierto, setAbierto] = useState(null);
    const [error, setError] = useState('');
    // La vista Kanban reordena tarjetas por estado; es una vista práctica, no
    // cambia cómo se atiende una solicitud (eso sigue en el detalle).
    const [kanban, setKanban] = useState(false);

    // El Kanban muestra el costo en cada tarjeta, y el costo congelado solo
    // viaja en el listado con incluir_datos; la Lista no lo usa, así que solo
    // se pide cuando el tablero está a la vista.
    const recargar = () => listarTickets({ ...filtros, incluir_datos: kanban || undefined })
        .then(setTickets).catch((e) => setError(e.message));

    useEffect(() => { listarTipos().then(setTipos).catch((e) => setError(e.message)); }, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { recargar(); }, [filtros.estado, filtros.tipo_id, filtros.desde, filtros.hasta, kanban]);

    const modificados = tickets.filter((t) => t.modificado).length;

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
                        {[['Lista', false], ['Kanban', true]].map(([etiqueta, valor]) => (
                            <button key={etiqueta} type="button" onClick={() => setKanban(valor)}
                                aria-pressed={kanban === valor}
                                className={`px-4 py-1.5 text-sm ${kanban === valor ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'}`}>
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
                </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            {kanban ? (
                // Abrir una tarjeta lleva al detalle de siempre, en la vista Lista:
                // el Kanban cambia cómo se ordenan, no cómo se atienden.
                <Kanban tickets={tickets} onAbrir={(id) => { setKanban(false); setAbierto(id); }} />
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
                                    {/* Dos marcas que conviven: el borde lateral rojo dice
                                        cuál está abierta, y un contorno ámbar que late rodea
                                        la tarjeta entera cuando tiene un cambio sin resolver.
                                        El contorno va en box-shadow, así que no desplaza nada
                                        y puede convivir con el borde de la selección. El
                                        shadow fijo es lo que queda cuando
                                        prefers-reduced-motion corta la animación. */}
                                    <button onClick={() => setAbierto(t.id)}
                                        className={`flex w-full items-start gap-3 border-l-4 px-3 py-3 pl-2 text-left hover:bg-gray-50 ${
                                            abierto === t.id ? 'border-red-800 bg-red-50' : 'border-transparent'
                                        } ${
                                            t.modificado
                                                ? 'animate-respira shadow-[inset_0_0_0_1.5px_var(--color-amber-400)]'
                                                : ''
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
