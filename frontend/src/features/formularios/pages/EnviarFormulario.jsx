import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { buscarPersonas, enviarFormulario, listarFormularios } from '../services/formularios';

const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function EnviarFormulario() {
    const navigate = useNavigate();
    const [params] = useSearchParams();

    const [busqueda, setBusqueda] = useState('');
    const [personas, setPersonas] = useState([]);
    const [buscando, setBuscando] = useState(false);
    const [persona, setPersona] = useState(null);

    const [formularios, setFormularios] = useState([]);
    const [formularioId, setFormularioId] = useState(params.get('id') || '');

    const [enviando, setEnviando] = useState(false);
    const [resultado, setResultado] = useState(null);
    const [error, setError] = useState('');

    // Solo los activos: enviar uno inactivo lo rechaza el backend, así que no
    // tiene sentido ofrecerlo acá.
    useEffect(() => {
        listarFormularios()
            .then((lista) => setFormularios(lista.filter((f) => f.activo)))
            .catch((e) => setError(e.message));
    }, []);

    // Debounce de 300 ms: sin esto cada tecla es una consulta a la nómina.
    const timer = useRef(null);
    useEffect(() => {
        clearTimeout(timer.current);
        const q = busqueda.trim();
        if (q.length < 3) {
            setPersonas([]);
            return;
        }
        setBuscando(true);
        timer.current = setTimeout(() => {
            buscarPersonas(q)
                .then(setPersonas)
                .catch((e) => setError(e.message))
                .finally(() => setBuscando(false));
        }, 300);
        return () => clearTimeout(timer.current);
    }, [busqueda]);

    const enviar = async () => {
        setError('');
        setResultado(null);
        setEnviando(true);
        try {
            const r = await enviarFormulario(formularioId, persona.rut);
            setResultado(r);
        } catch (e) {
            setError(e.message);
        } finally {
            setEnviando(false);
        }
    };

    const formulario = formularios.find((f) => String(f.id) === String(formularioId)) || null;
    const listo = persona && formulario && persona.email;

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="mx-auto max-w-3xl">
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold text-gray-900">Enviar formulario</h1>
                        <p className="text-sm text-gray-500">
                            El enlace llega al correo que el trabajador tiene en la nómina.
                        </p>
                    </div>
                    <button
                        onClick={() => navigate('/formularios/gestor')}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                        Volver al gestor
                    </button>
                </header>

                {error && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {/* 1. Trabajador */}
                <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
                    <h2 className="text-sm font-semibold text-gray-900">1. Trabajador</h2>

                    {persona ? (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-blue-50 px-4 py-3">
                            <div>
                                <div className="text-sm font-medium text-gray-900">{persona.nombre}</div>
                                <div className="text-xs text-gray-600">
                                    {persona.rut}
                                    {persona.email ? ` · ${persona.email}` : ' · sin correo en la nómina'}
                                </div>
                            </div>
                            <button
                                onClick={() => { setPersona(null); setBusqueda(''); setResultado(null); }}
                                className="text-sm text-blue-700 hover:underline"
                            >
                                Cambiar
                            </button>
                        </div>
                    ) : (
                        <>
                            <input
                                type="search"
                                className={`${input} mt-3`}
                                placeholder="Buscar por nombre o RUT (mínimo 3 caracteres)…"
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                            />
                            {buscando && <p className="mt-2 text-xs text-gray-500">Buscando…</p>}
                            {!!personas.length && (
                                <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
                                    {personas.map((p) => (
                                        <li key={p.rut}>
                                            <button
                                                onClick={() => setPersona(p)}
                                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                                            >
                                                <span>
                                                    <span className="block text-sm font-medium text-gray-900">{p.nombre}</span>
                                                    <span className="block text-xs text-gray-500">{p.rut}</span>
                                                </span>
                                                <span className="text-xs text-gray-500">
                                                    {p.email || 'sin correo'}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {!buscando && busqueda.trim().length >= 3 && !personas.length && (
                                <p className="mt-2 text-sm text-gray-500">Nadie activo coincide con esa búsqueda.</p>
                            )}
                        </>
                    )}
                </section>

                {/* 2. Formulario */}
                <section className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
                    <h2 className="text-sm font-semibold text-gray-900">2. Formulario</h2>
                    <select
                        className={`${input} mt-3`}
                        value={formularioId}
                        onChange={(e) => { setFormularioId(e.target.value); setResultado(null); }}
                    >
                        <option value="">— Selecciona un formulario —</option>
                        {formularios.map((f) => (
                            <option key={f.id} value={f.id}>{f.titulo}</option>
                        ))}
                    </select>
                    {!formularios.length && (
                        <p className="mt-2 text-sm text-gray-500">
                            No hay formularios activos. Activa uno desde el gestor para poder enviarlo.
                        </p>
                    )}
                </section>

                {/* 3. Envío */}
                <section className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
                    <h2 className="text-sm font-semibold text-gray-900">3. Enviar</h2>
                    {persona && !persona.email && (
                        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            {persona.nombre} no tiene correo en la nómina, así que no hay dónde mandar el enlace.
                            Hay que cargarlo en BUK primero.
                        </p>
                    )}
                    <p className="mt-3 text-sm text-gray-600">
                        {listo
                            ? `Se enviará "${formulario.titulo}" a ${persona.email}.`
                            : 'Elige un trabajador y un formulario.'}
                    </p>
                    <button
                        onClick={enviar}
                        disabled={!listo || enviando}
                        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {enviando ? 'Enviando…' : 'Enviar formulario'}
                    </button>

                    {resultado && (
                        <div
                            className={`mt-4 rounded-lg px-4 py-3 text-sm ${
                                resultado.ok
                                    ? 'border border-green-200 bg-green-50 text-green-800'
                                    : 'border border-red-200 bg-red-50 text-red-700'
                            }`}
                        >
                            {resultado.mensaje}
                            {resultado.ok && (
                                <button
                                    onClick={() => navigate(`/formularios/respuestas?id=${formularioId}`)}
                                    className="ml-2 underline"
                                >
                                    Ver respuestas
                                </button>
                            )}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
