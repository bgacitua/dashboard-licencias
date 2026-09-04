import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
    duplicarFormulario,
    eliminarFormulario,
    listarFormularios,
} from '../services/formularios';

const fecha = (valor) =>
    valor ? new Date(valor).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export default function GestorFormularios() {
    const navigate = useNavigate();
    const [formularios, setFormularios] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    const recargar = () => {
        setCargando(true);
        return listarFormularios()
            .then(setFormularios)
            .catch((e) => setError(e.message))
            .finally(() => setCargando(false));
    };

    useEffect(() => { recargar(); }, []);

    // El filtro corre sobre título y código: son los dos campos por los que
    // alguien busca un formulario que creó hace un mes.
    const visibles = useMemo(() => {
        const t = busqueda.trim().toLowerCase();
        if (!t) return formularios;
        return formularios.filter(
            (f) => f.titulo.toLowerCase().includes(t) || f.slug.toLowerCase().includes(t)
        );
    }, [formularios, busqueda]);

    const duplicar = async (f) => {
        setError('');
        try {
            const copia = await duplicarFormulario(f.id);
            await recargar();
            // La copia nace inactiva: se abre en el editor para que se revise
            // antes de publicarla.
            navigate(`/formularios/admin?id=${copia.id}`);
        } catch (e) {
            setError(e.message);
        }
    };

    const borrar = async (f) => {
        const aviso = f.respuestas
            ? `Se eliminará "${f.titulo}" y sus ${f.respuestas} respuesta(s). Esto no se puede deshacer. ¿Continuar?`
            : `Se eliminará "${f.titulo}". ¿Continuar?`;
        if (!window.confirm(aviso)) return;
        setError('');
        try {
            await eliminarFormulario(f.id);
            recargar();
        } catch (e) {
            setError(e.message);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="mx-auto max-w-6xl">
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold text-gray-900">Formularios</h1>
                        <p className="text-sm text-gray-500">
                            {formularios.length} formulario(s) creado(s).
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            type="search"
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Buscar por título o código…"
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                        />
                        <button
                            onClick={() => navigate('/formularios/enviar')}
                            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                            Enviar formulario
                        </button>
                        <button
                            onClick={() => navigate('/formularios/respuestas')}
                            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                            Ver respuestas
                        </button>
                        <button
                            onClick={() => navigate('/formularios/admin')}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                        >
                            Nuevo formulario
                        </button>
                    </div>
                </header>

                {error && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                <div className="mt-5 overflow-hidden rounded-xl border border-gray-200 bg-white">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Formulario</th>
                                    <th className="px-4 py-3 font-medium">Código</th>
                                    <th className="px-4 py-3 font-medium">Estado</th>
                                    <th className="px-4 py-3 text-right font-medium">Respuestas</th>
                                    <th className="px-4 py-3 font-medium">Modificado</th>
                                    <th className="px-4 py-3 text-right font-medium">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {visibles.map((f) => (
                                    <tr key={f.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900">{f.titulo}</div>
                                            {f.creado_por && (
                                                <div className="text-xs text-gray-500">Creado por {f.creado_por}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <code className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">{f.slug}</code>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`rounded-full px-2 py-1 text-xs font-medium ${
                                                    f.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                                }`}
                                            >
                                                {f.activo ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">{f.respuestas}</td>
                                        <td className="px-4 py-3 text-gray-600">{fecha(f.updated_at)}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end gap-3 whitespace-nowrap">
                                                <button
                                                    onClick={() => navigate(`/formularios/admin?id=${f.id}`)}
                                                    className="text-blue-600 hover:underline"
                                                >
                                                    Editar
                                                </button>
                                                {f.activo && (
                                                    <button
                                                        onClick={() => navigate(`/formularios/enviar?id=${f.id}`)}
                                                        className="text-gray-600 hover:underline"
                                                    >
                                                        Enviar
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => navigate(`/formularios/respuestas?id=${f.id}`)}
                                                    className="text-gray-600 hover:underline"
                                                >
                                                    Respuestas
                                                </button>
                                                <button onClick={() => duplicar(f)} className="text-gray-600 hover:underline">
                                                    Duplicar
                                                </button>
                                                <button onClick={() => borrar(f)} className="text-red-600 hover:underline">
                                                    Eliminar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {!cargando && !visibles.length && (
                        <p className="px-4 py-10 text-center text-sm text-gray-500">
                            {formularios.length
                                ? 'Ningún formulario coincide con la búsqueda.'
                                : 'Todavía no hay formularios. Crea el primero.'}
                        </p>
                    )}
                    {cargando && <p className="px-4 py-10 text-center text-sm text-gray-500">Cargando…</p>}
                </div>
            </div>
        </div>
    );
}
