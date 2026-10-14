import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import PortalLayout, { useSesionPortal } from '../components/PortalLayout';
import { useDialogo } from '../../../components/Dialogos';
import {
    ESTADOS, ESTADOS_ABIERTOS, cuandoOcurre, diaMes, encabezadoDe, misTickets, tiposPortal, tramoDe,
} from '../services/tickets';

const reglaPlazo = (t) =>
    t.dias_anticipacion === 0
        ? `Pide hasta el mismo día a las ${String(t.hora_limite).slice(0, 5)}`
        : `Pide hasta ${t.dias_anticipacion} día${t.dias_anticipacion > 1 ? 's' : ''} antes, ${String(t.hora_limite).slice(0, 5)}`;

// La tarjeta reusa la imagen del encabezado del formulario, para no subir dos
// veces lo mismo. `portada_url` sigue mandando si el admin quiere otra.
const portada = (t) => t.portada_url || t.tema?.encabezadoImagen || '';

export function Estado({ estado }) {
    const e = ESTADOS[estado] || { label: estado, clase: 'bg-gray-100 text-gray-700' };
    return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${e.clase}`}>{e.label}</span>;
}

/** Una gestión en la lista, con el mismo formato que la del panel: el bloque de
 *  fecha a la izquierda y, al lado, número + servicio + sala, horario y estado.
 *  Acá no va el solicitante, que en el portal es siempre quien está mirando. */
function Gestion({ ticket }) {
    const f = diaMes(ticket.fecha_servicio);
    return (
        <li>
            <Link to={`/tickets/t/${ticket.id}`}
                className="flex items-start gap-3 px-3 py-3 transition-colors hover:bg-slate-50">
                <span className="flex w-12 shrink-0 flex-col items-center rounded-lg border border-slate-200 py-1 leading-tight">
                    <span className="text-[10px] uppercase text-slate-500">{f.semana}</span>
                    <span className="text-lg font-semibold text-slate-900">{f.dia}</span>
                    <span className="text-[10px] text-slate-500">{f.mes}</span>
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">
                            <span className="font-mono text-slate-500">#{ticket.id}</span> · {encabezadoDe(ticket)}
                        </span>
                        {/* La columna es angosta: sin esto "En revisión" se parte en dos. */}
                        <span className="shrink-0 whitespace-nowrap">
                            <Estado estado={ticket.estado} />
                        </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {tramoDe(ticket) || '—'}
                    </span>
                </span>
            </Link>
        </li>
    );
}

export default function PortalInicio() {
    const { confirmar } = useDialogo();
    const manejar = useSesionPortal();
    const navigate = useNavigate();
    const [tipos, setTipos] = useState([]);
    const [tickets, setTickets] = useState([]);
    const [verHistorial, setVerHistorial] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        Promise.all([tiposPortal(), misTickets()])
            .then(([tp, tk]) => { setTipos(tp); setTickets(tk); })
            .catch((e) => setError(manejar(e)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // El corte es abierta / terminada, no una lista de estados: así un estado
    // nuevo cae solo del lado que le toca en vez de desaparecer de las dos.
    //
    // Lo abierto va de lo más cercano a lo más lejano, que es el orden en que
    // hay que ocuparse: lo de mañana antes que lo del mes que viene. El
    // historial al revés, porque ahí lo último es lo que se busca. El servidor
    // ordena por última actualización, así que el orden se arma acá.
    const [proximas, historial] = useMemo(() => {
        const abiertas = tickets.filter((t) => ESTADOS_ABIERTOS.includes(t.estado));
        const cerradas = tickets.filter((t) => !ESTADOS_ABIERTOS.includes(t.estado));
        return [
            [...abiertas].sort((a, b) => cuandoOcurre(a).localeCompare(cuandoOcurre(b))),
            [...cerradas].sort((a, b) => cuandoOcurre(b).localeCompare(cuandoOcurre(a))),
        ];
    }, [tickets]);

    // Una tarjeta siempre crea una solicitud nueva. Si ya hay una en curso del
    // mismo tipo se pregunta; responder que no deja al usuario donde estaba,
    // que es la salida que antes faltaba (las dos opciones navegaban).
    const abrirTipo = async (e, tipo) => {
        const abierta = proximas.find((t) => t.tipo_id === tipo.id);
        if (!abierta) return;
        e.preventDefault();
        const otra = await confirmar({
            titulo: 'Tienes una solicitud en curso',
            mensaje: `La solicitud #${abierta.id} para ${tipo.nombre} sigue abierta. ¿Quieres crear una nueva?`,
            textoConfirmar: 'Sí',
            textoCancelar: 'No',
        });
        if (otra) navigate(`/tickets/nueva/${tipo.id}`);
    };

    return (
        <PortalLayout ancho="max-w-6xl">
            {/* El encabezado va ancho y, debajo, dos columnas: las tarjetas a la
                izquierda y las gestiones a la derecha, arrancando a la altura de
                la primera fila de tarjetas. En pantalla chica la columna cae
                debajo, que es donde se la espera al hacer scroll. */}
            <section>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Nueva solicitud</h1>
                <p className="mt-1 text-sm text-slate-500">Elige qué necesitas pedir.</p>
                {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

                <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
                    <div className="grid gap-4 sm:grid-cols-2">
                        {tipos.map((t) => (
                            <Link
                                key={t.id}
                                to={`/tickets/nueva/${t.id}`}
                                onClick={(e) => abrirTipo(e, t)}
                                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                            >
                                <div
                                    className="h-36 bg-cover bg-center"
                                    style={portada(t)
                                        ? { backgroundImage: `url("${encodeURI(portada(t))}")` }
                                        : { background: `linear-gradient(135deg, ${t.tema?.color || '#2563eb'}, #0f172a)` }}
                                />
                                <div className="p-4">
                                    <h2 className="font-semibold text-slate-900 group-hover:text-blue-700">{t.nombre}</h2>
                                    {t.descripcion && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{t.descripcion}</p>}
                                    <p className="mt-3 flex items-center gap-1 text-xs text-slate-500">
                                        <span className="material-symbols-outlined text-sm">schedule</span>
                                        {reglaPlazo(t)}
                                    </p>
                                </div>
                            </Link>
                        ))}
                        {tipos.length === 0 && !error && (
                            <p className="text-sm text-slate-500">Todavía no hay tipos de solicitud disponibles.</p>
                        )}
                    </div>

                    {/* Pegada al hacer scroll: la lista de tarjetas puede ser larga
                        y lo que uno ya tiene pedido conviene tenerlo a la vista. */}
                    <aside className="lg:sticky lg:top-20">
                        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                            Tus próximas gestiones
                        </h2>
                        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            <ul className="divide-y divide-slate-100">
                                {proximas.map((t) => <Gestion key={t.id} ticket={t} />)}
                                {proximas.length === 0 && (
                                    <li className="px-4 py-8 text-center text-sm text-slate-500">
                                        No tienes gestiones pendientes.
                                    </li>
                                )}
                            </ul>

                            {/* El historial no desaparece, pero tampoco compite: lo
                                que importa acá es lo que todavía va a pasar. */}
                            {historial.length > 0 && (
                                <div className="border-t border-slate-100">
                                    <button type="button" onClick={() => setVerHistorial((v) => !v)}
                                        aria-expanded={verHistorial}
                                        className="flex w-full items-center justify-between px-4 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-50">
                                        <span>{verHistorial ? 'Ocultar historial' : `Ver historial (${historial.length})`}</span>
                                        <span aria-hidden className="material-symbols-outlined text-lg">
                                            {verHistorial ? 'expand_less' : 'expand_more'}
                                        </span>
                                    </button>
                                    {verHistorial && (
                                        <ul className="animate-entra max-h-96 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100">
                                            {historial.map((t) => <Gestion key={t.id} ticket={t} />)}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    </aside>
                </div>
            </section>
        </PortalLayout>
    );
}
