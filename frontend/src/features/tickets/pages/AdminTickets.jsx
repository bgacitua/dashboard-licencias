import React, { useEffect, useMemo, useState } from 'react';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.css';

import { crearModelo } from '../../../components/form-builder/tema';
import AdminMarco from '../components/AdminMarco';
import Conversacion from '../components/Conversacion';
import { Estado } from './PortalInicio';
import {
    ESTADOS, cambiarEstado, comentarAdmin, fechaCorta, fechaHora, listarTickets, listarTipos, verTicket,
} from '../services/tickets';

const control = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

/** Enunciado de cada campo según la definición, para mostrar el cambio con nombre humano. */
const titulos = (definicion) => {
    const salida = {};
    for (const p of definicion?.pages || []) for (const e of p.elements || []) salida[e.name] = e.title || e.name;
    return salida;
};

const mostrar = (v) => {
    if (v === undefined || v === null || v === '') return '—';
    if (Array.isArray(v)) return v.join(', ');
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
};

/** Campos que cambiaron entre dos versiones (la fecha del servicio incluida). */
export const diferencias = (actual, anterior) => {
    if (!anterior) return [];
    const salida = [];
    if (actual.fecha_servicio !== anterior.fecha_servicio) {
        salida.push({ campo: '__fecha', antes: anterior.fecha_servicio, ahora: actual.fecha_servicio });
    }
    const claves = new Set([...Object.keys(actual.datos || {}), ...Object.keys(anterior.datos || {})]);
    for (const k of claves) {
        if (JSON.stringify(actual.datos?.[k]) !== JSON.stringify(anterior.datos?.[k])) {
            salida.push({ campo: k, antes: anterior.datos?.[k], ahora: actual.datos?.[k] });
        }
    }
    return salida;
};

function Detalle({ id, tipos, onCambio }) {
    const [t, setT] = useState(null);
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
    const cambios = version ? diferencias(version, anterior) : [];

    const model = useMemo(() => {
        if (!tipo || !version) return null;
        // Sin banda ni fondo: en el panel importa lo respondido, no la portada.
        const tema = { ...tipo.tema, encabezado: 'simple', fondoImagen: '' };
        const m = crearModelo(tipo.definicion, tema, { titulo: '', descripcion: '' });
        m.data = version.datos;
        m.mode = 'display';
        return m;
    }, [tipo, version]);

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

    if (!t) return <p className="p-6 text-sm text-gray-500">{error || 'Cargando…'}</p>;

    return (
        <div className="space-y-5">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-lg font-semibold">#{t.id}</span>
                    <Estado estado={t.estado} />
                    <span className="text-sm text-gray-600">{t.tipo} · {fechaCorta(t.fecha_servicio)}</span>
                </div>
                <p className="mt-2 text-sm text-gray-600">
                    {t.usuario} · {t.email}
                    <br />
                    Creado {fechaHora(t.created_at)} · Plazo del usuario {fechaHora(t.plazo)}
                </p>

                <div className="mt-4 border-t border-gray-100 pt-4">
                    <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="tk-coment-estado">
                        Comentario para el usuario (opcional, va con el cambio de estado)
                    </label>
                    <textarea id="tk-coment-estado" rows={2} className={`${control} w-full`} value={comentario}
                        onChange={(e) => setComentario(e.target.value)} maxLength={2000} />
                    <div className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(ESTADOS).filter(([k]) => k !== t.estado).map(([k, e]) => (
                            <button key={k} onClick={() => mover(k)}
                                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${e.clase} hover:opacity-80`}>
                                Pasar a {e.label.toLowerCase()}
                            </button>
                        ))}
                    </div>
                    {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">Versiones</h3>
                    <div className="flex flex-wrap gap-1">
                        {t.versiones.map((v) => (
                            <button key={v.version} onClick={() => setVerVersion(v.version)}
                                title={fechaHora(v.created_at)}
                                className={`rounded-md px-2.5 py-1 text-xs ${
                                    v.version === verVersion ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-700'
                                }`}>
                                v{v.version}
                            </button>
                        ))}
                    </div>
                </div>
                {version && (
                    <p className="mt-1 text-xs text-gray-500">
                        v{version.version} enviada el {fechaHora(version.created_at)} · servicio {fechaCorta(version.fecha_servicio)}
                    </p>
                )}
                {cambios.length > 0 && (
                    <div className="mt-3 rounded-lg bg-amber-50 p-3">
                        <p className="text-xs font-semibold text-amber-900">Cambios respecto de v{verVersion - 1}</p>
                        <ul className="mt-1 space-y-1 text-sm text-amber-900">
                            {cambios.map((c) => (
                                <li key={c.campo}>
                                    <span className="font-medium">{c.campo === '__fecha' ? 'Fecha del servicio' : nombres[c.campo] || c.campo}:</span>{' '}
                                    <span className="line-through opacity-60">{mostrar(c.antes)}</span> → {mostrar(c.ahora)}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {model ? (
                    <div className="mt-4 overflow-hidden rounded-lg border border-gray-100"
                        style={{ ...model.themeVariables, background: 'var(--sjs2-color-utility-body)' }}>
                        <Survey model={model} />
                    </div>
                ) : (
                    <pre className="mt-4 overflow-x-auto rounded-lg bg-gray-50 p-3 text-xs">{JSON.stringify(version?.datos, null, 2)}</pre>
                )}
            </div>

            <Conversacion
                lado="admin"
                eventos={t.eventos}
                onEnviar={async (texto) => { await comentarAdmin(id, texto); setRecarga((n) => n + 1); }}
            />
        </div>
    );
}

export default function AdminTickets() {
    const [tickets, setTickets] = useState([]);
    const [tipos, setTipos] = useState([]);
    const [filtros, setFiltros] = useState({ estado: 'pendiente', tipo_id: '', q: '' });
    const [abierto, setAbierto] = useState(null);
    const [error, setError] = useState('');

    const recargar = () => listarTickets(filtros).then(setTickets).catch((e) => setError(e.message));

    useEffect(() => { listarTipos().then(setTipos).catch((e) => setError(e.message)); }, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { recargar(); }, [filtros.estado, filtros.tipo_id]);

    const modificados = tickets.filter((t) => t.modificado).length;

    return (
        <AdminMarco>
            <div className="flex flex-wrap items-center gap-2">
                <select className={control} value={filtros.estado} aria-label="Estado"
                    onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}>
                    <option value="">Todos los estados</option>
                    {Object.entries(ESTADOS).map(([k, e]) => <option key={k} value={k}>{e.label}</option>)}
                </select>
                <select className={control} value={filtros.tipo_id} aria-label="Tipo"
                    onChange={(e) => setFiltros({ ...filtros, tipo_id: e.target.value })}>
                    <option value="">Todos los tipos</option>
                    {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
                <form onSubmit={(e) => { e.preventDefault(); recargar(); }} className="flex gap-2">
                    <input type="search" className={control} placeholder="N° de ticket, nombre o correo…"
                        value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} />
                    <button className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-100">Buscar</button>
                </form>
                {modificados > 0 && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                        {modificados} modificado{modificados > 1 ? 's' : ''} sin revisar
                    </span>
                )}
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <ul className="h-fit divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
                    {tickets.map((t) => (
                        <li key={t.id}>
                            <button onClick={() => setAbierto(t.id)}
                                className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-gray-50 ${
                                    abierto === t.id ? 'bg-blue-50' : ''
                                }`}>
                                <span className="w-12 font-mono text-sm text-gray-500">#{t.id}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-gray-900">{t.usuario || t.email}</span>
                                    <span className="text-xs text-gray-500">{t.tipo} · {fechaCorta(t.fecha_servicio)}</span>
                                </span>
                                {t.modificado && (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                        v{t.version_actual} nueva
                                    </span>
                                )}
                                <Estado estado={t.estado} />
                            </button>
                        </li>
                    ))}
                    {tickets.length === 0 && <li className="px-4 py-8 text-center text-sm text-gray-500">Sin solicitudes con esos filtros.</li>}
                </ul>

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
        </AdminMarco>
    );
}
