import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { ingresar, registrarse, tokenPortal } from '../services/tickets';

const input = 'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200';

/** Ingreso y registro del portal, en la misma tarjeta. */
export default function PortalAcceso() {
    const navigate = useNavigate();
    const [modo, setModo] = useState('ingresar'); // ingresar | registro
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [repetir, setRepetir] = useState('');
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');
    const [enviando, setEnviando] = useState(false);

    if (tokenPortal.get()) return <Navigate to="/tickets" replace />;

    const enviar = async (e) => {
        e.preventDefault();
        setError('');
        setAviso('');
        if (modo === 'registro' && password !== repetir) {
            setError('Las contraseñas no coinciden.');
            return;
        }
        setEnviando(true);
        try {
            if (modo === 'ingresar') {
                await ingresar(email, password);
                navigate('/tickets', { replace: true });
            } else {
                const r = await registrarse(email, password);
                setAviso(r.mensaje);
                setModo('ingresar');
                setPassword('');
                setRepetir('');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setEnviando(false);
        }
    };

    const pestaña = (m, texto) => (
        <button
            type="button"
            onClick={() => { setModo(m); setError(''); }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                modo === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
        >
            {texto}
        </button>
    );

    return (
        <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-100 px-4">
            <div className="w-full max-w-sm">
                <div className="mb-6 text-center">
                    <span className="material-symbols-outlined rounded-2xl bg-blue-600 p-3 text-3xl text-white shadow-lg shadow-blue-600/20">
                        restaurant
                    </span>
                    <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">Solicitudes</h1>
                    <p className="mt-1 text-sm text-slate-500">Desayunos, almuerzos y más</p>
                </div>

                <form onSubmit={enviar} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50">
                    <div className="mb-5 flex gap-1 rounded-xl bg-slate-100 p-1">
                        {pestaña('ingresar', 'Ingresar')}
                        {pestaña('registro', 'Crear cuenta')}
                    </div>

                    {aviso && (
                        <p className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{aviso}</p>
                    )}

                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="tk-email">Correo de la empresa</label>
                    <input id="tk-email" type="email" autoComplete="email" required className={input}
                        placeholder="nombre@cramer.cl" value={email} onChange={(e) => setEmail(e.target.value)} />

                    <label className="mb-1 mt-4 block text-xs font-medium text-slate-600" htmlFor="tk-pass">Contraseña</label>
                    <input id="tk-pass" type="password" required minLength={modo === 'registro' ? 8 : undefined}
                        autoComplete={modo === 'registro' ? 'new-password' : 'current-password'}
                        className={input} value={password} onChange={(e) => setPassword(e.target.value)} />

                    {modo === 'registro' && (
                        <>
                            <label className="mb-1 mt-4 block text-xs font-medium text-slate-600" htmlFor="tk-pass2">Repite la contraseña</label>
                            <input id="tk-pass2" type="password" required autoComplete="new-password" className={input}
                                value={repetir} onChange={(e) => setRepetir(e.target.value)} />
                            <p className="mt-2 text-xs text-slate-500">
                                Mínimo 8 caracteres. Un administrador activará tu cuenta antes del primer ingreso.
                            </p>
                        </>
                    )}

                    {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}

                    <button type="submit" disabled={enviando}
                        className="mt-6 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60">
                        {enviando ? 'Un momento…' : modo === 'ingresar' ? 'Ingresar' : 'Crear cuenta'}
                    </button>
                </form>

                {modo === 'ingresar' && (
                    <p className="mt-4 text-center text-xs text-slate-500">
                        ¿Olvidaste tu contraseña? Pídele al administrador que la restablezca y vuelve a crear tu cuenta con el mismo correo.
                    </p>
                )}
            </div>
        </main>
    );
}
