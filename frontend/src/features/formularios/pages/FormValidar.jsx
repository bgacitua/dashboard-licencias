import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { validarRut } from '../services/formularios';

/**
 * Gate: se llega acá desde el QR (/formularios/validar?f=<slug>). Valida el RUT
 * contra la nómina y redirige al formulario con un token de un solo uso.
 */
export default function FormValidar() {
    const [params] = useSearchParams();
    const slug = params.get('f') || '';
    const navigate = useNavigate();

    const [rut, setRut] = useState('');
    const [error, setError] = useState('');
    const [cargando, setCargando] = useState(false);

    const enviar = async (e) => {
        e.preventDefault();
        setError('');
        setCargando(true);
        try {
            const res = await validarRut(slug, rut);
            if (res.ok) {
                navigate(res.redirect);
            } else {
                setError(res.mensaje || 'No pudimos validar tus datos.');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setCargando(false);
        }
    };

    if (!slug) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <p className="text-gray-600">Enlace incompleto. Vuelve a escanear el código QR.</p>
            </main>
        );
    }

    return (
        <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <form onSubmit={enviar} className="w-full max-w-sm bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <h1 className="text-lg font-semibold text-gray-900">Validación</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Ingresa tu RUT para acceder al formulario.
                </p>

                <label htmlFor="rut" className="block mt-5 text-sm font-medium text-gray-700">
                    RUT
                </label>
                <input
                    id="rut"
                    name="rut"
                    value={rut}
                    onChange={(e) => setRut(e.target.value)}
                    placeholder="12.345.678-9"
                    autoComplete="off"
                    required
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                {error && (
                    <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>
                )}

                <button
                    type="submit"
                    disabled={cargando || !rut.trim()}
                    className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                    {cargando ? 'Validando…' : 'Continuar'}
                </button>
            </form>
        </main>
    );
}
