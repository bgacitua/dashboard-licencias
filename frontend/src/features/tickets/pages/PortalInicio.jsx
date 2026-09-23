import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import PortalLayout, { useSesionPortal } from '../components/PortalLayout';
import { ESTADOS, fechaCorta, fechaHora, misTickets, tiposPortal } from '../services/tickets';

const reglaPlazo = (t) =>
    t.dias_anticipacion === 0
        ? `Pide hasta el mismo día a las ${String(t.hora_limite).slice(0, 5)}`
        : `Pide hasta ${t.dias_anticipacion} día${t.dias_anticipacion > 1 ? 's' : ''} antes, ${String(t.hora_limite).slice(0, 5)}`;

export function Estado({ estado }) {
    const e = ESTADOS[estado] || { label: estado, clase: 'bg-gray-100 text-gray-700' };
    return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${e.clase}`}>{e.label}</span>;
}

export default function PortalInicio() {
    const manejar = useSesionPortal();
    const [tipos, setTipos] = useState([]);
    const [tickets, setTickets] = useState([]);
    const [vista, setVista] = useState('curso'); // curso | historial
    const [error, setError] = useState('');

    useEffect(() => {
        Promise.all([tiposPortal(), misTickets()])
            .then(([tp, tk]) => { setTipos(tp); setTickets(tk); })
            .catch((e) => setError(manejar(e)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [enCurso, historial] = useMemo(() => [
        tickets.filter((t) => t.estado === 'pendiente' || t.estado === 'en_curso'),
        tickets.filter((t) => t.estado === 'rechazado' || t.estado === 'cerrado'),
    ], [tickets]);
    const lista = vista === 'curso' ? enCurso : historial;

    return (
        <PortalLayout>
            <section>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Nueva solicitud</h1>
                <p className="mt-1 text-sm text-slate-500">Elige qué necesitas pedir.</p>
                {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {tipos.map((t) => (
                        <Link
                            key={t.id}
                            to={`/tickets/nueva/${t.id}`}
                            className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                        >
                            <div
                                className="h-36 bg-cover bg-center"
                                style={t.portada_url
                                    ? { backgroundImage: `url("${encodeURI(t.portada_url)}")` }
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
            </section>

            <section className="mt-12">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <h2 className="text-xl font-semibold tracking-tight text-slate-900">Mis solicitudes</h2>
                    <div className="flex gap-1 rounded-xl bg-slate-200/60 p-1 text-sm">
                        {[['curso', `En curso (${enCurso.length})`], ['historial', `Historial (${historial.length})`]].map(([k, l]) => (
                            <button key={k} onClick={() => setVista(k)}
                                className={`rounded-lg px-3 py-1.5 ${vista === k ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'}`}>
                                {l}
                            </button>
                        ))}
                    </div>
                </div>

                <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    {lista.map((t) => (
                        <li key={t.id}>
                            <Link to={`/tickets/t/${t.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50">
                                <span className="w-14 font-mono text-sm text-slate-500">#{t.id}</span>
                                <span className="min-w-32 flex-1 font-medium text-slate-900">{t.tipo}</span>
                                <span className="text-sm text-slate-600">{fechaCorta(t.fecha_servicio)}</span>
                                <Estado estado={t.estado} />
                                <span className="w-full text-xs text-slate-500 sm:w-48 sm:text-right">
                                    {t.editable ? `Editable hasta ${fechaHora(t.plazo)}` : t.version_actual > 1 ? `Versión ${t.version_actual}` : ''}
                                </span>
                            </Link>
                        </li>
                    ))}
                    {lista.length === 0 && (
                        <li className="px-4 py-8 text-center text-sm text-slate-500">
                            {vista === 'curso' ? 'No tienes solicitudes en curso.' : 'Aún no hay solicitudes cerradas.'}
                        </li>
                    )}
                </ul>
            </section>
        </PortalLayout>
    );
}
