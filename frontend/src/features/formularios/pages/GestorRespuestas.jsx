import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { listarFormularios, listarRespuestas } from '../services/formularios';

const fechaHora = (valor) =>
    valor
        ? new Date(valor).toLocaleString('es-CL', {
              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })
        : '—';

/** {name: title} de la definición, para mostrar la pregunta y no su nombre interno. */
const titulos = (definicion) => {
    const mapa = {};
    (definicion?.pages || []).forEach((p) =>
        (p.elements || []).forEach((e) => { mapa[e.name] = e.title || e.name; })
    );
    return mapa;
};

/** Una respuesta puede ser texto, número, array (selección múltiple) u objeto. */
const valor = (v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object') return JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    return String(v);
};

export default function GestorRespuestas() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [formularios, setFormularios] = useState([]);
    const [respuestas, setRespuestas] = useState([]);
    const [abierta, setAbierta] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState('');

    const seleccionado = params.get('id') || '';

    useEffect(() => {
        listarFormularios().then(setFormularios).catch((e) => setError(e.message));
    }, []);

    useEffect(() => {
        if (!seleccionado) {
            setRespuestas([]);
            return;
        }
        setCargando(true);
        setAbierta(null);
        listarRespuestas(seleccionado)
            .then(setRespuestas)
            .catch((e) => setError(e.message))
            .finally(() => setCargando(false));
    }, [seleccionado]);

    const formulario = formularios.find((f) => String(f.id) === String(seleccionado)) || null;
    const mapaTitulos = useMemo(() => titulos(formulario?.definicion), [formulario]);

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="mx-auto max-w-6xl">
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold text-gray-900">Respuestas</h1>
                        <p className="text-sm text-gray-500">
                            {formulario
                                ? `${respuestas.length} respuesta(s) de "${formulario.titulo}".`
                                : 'Elige un formulario para ver sus respuestas.'}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={seleccionado}
                            onChange={(e) => setParams(e.target.value ? { id: e.target.value } : {})}
                        >
                            <option value="">— Selecciona un formulario —</option>
                            {formularios.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.titulo} ({f.respuestas})
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={() => navigate('/formularios/gestor')}
                            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                            Volver al gestor
                        </button>
                    </div>
                </header>

                {error && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {seleccionado && (
                    <div className="mt-5 overflow-hidden rounded-xl border border-gray-200 bg-white">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">Trabajador</th>
                                        <th className="px-4 py-3 font-medium">RUT</th>
                                        <th className="px-4 py-3 font-medium">Enviado</th>
                                        <th className="px-4 py-3 font-medium">Respondido</th>
                                        <th className="px-4 py-3 font-medium">n8n</th>
                                        <th className="px-4 py-3 text-right font-medium"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {respuestas.map((r) => (
                                        <React.Fragment key={r.id}>
                                            <tr className="hover:bg-gray-50">
                                                <td className="px-4 py-3 font-medium text-gray-900">{r.nombre || '—'}</td>
                                                <td className="px-4 py-3 text-gray-700">{r.rut || '—'}</td>
                                                <td className="px-4 py-3 text-gray-600">{fechaHora(r.fecha_envio)}</td>
                                                <td className="px-4 py-3 text-gray-600">
                                                    {fechaHora(r.fecha_respuesta || r.created_at)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {/* n8n_ok en null = respuesta anterior al envío al webhook. */}
                                                    <span
                                                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                                                            r.n8n_ok === true
                                                                ? 'bg-green-100 text-green-700'
                                                                : r.n8n_ok === false
                                                                ? 'bg-red-100 text-red-700'
                                                                : 'bg-gray-100 text-gray-600'
                                                        }`}
                                                    >
                                                        {r.n8n_ok === true ? 'Enviado' : r.n8n_ok === false ? 'Falló' : 'Sin dato'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => setAbierta(abierta === r.id ? null : r.id)}
                                                        className="text-blue-600 hover:underline"
                                                    >
                                                        {abierta === r.id ? 'Ocultar' : 'Ver detalle'}
                                                    </button>
                                                </td>
                                            </tr>
                                            {abierta === r.id && (
                                                <tr className="bg-gray-50">
                                                    <td colSpan={6} className="px-4 py-4">
                                                        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                                                            {Object.entries(r.datos || {}).map(([k, v]) => (
                                                                <div key={k}>
                                                                    <dt className="text-xs font-medium text-gray-500">
                                                                        {mapaTitulos[k] || k}
                                                                    </dt>
                                                                    <dd className="text-sm text-gray-900">{valor(v)}</dd>
                                                                </div>
                                                            ))}
                                                        </dl>
                                                        {!Object.keys(r.datos || {}).length && (
                                                            <p className="text-sm text-gray-500">Respuesta vacía.</p>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {!cargando && !respuestas.length && (
                            <p className="px-4 py-10 text-center text-sm text-gray-500">
                                Este formulario todavía no tiene respuestas.
                            </p>
                        )}
                        {cargando && <p className="px-4 py-10 text-center text-sm text-gray-500">Cargando…</p>}
                    </div>
                )}
            </div>
        </div>
    );
}
