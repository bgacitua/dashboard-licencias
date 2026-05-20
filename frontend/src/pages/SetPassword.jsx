import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const SetPassword = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token') || '';

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [status, setStatus] = useState('idle'); // idle | loading | success | error
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (!token) setStatus('error'), setErrorMsg('El enlace no contiene un token válido.');
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        if (password.length < 6) return setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
        if (password !== confirm) return setErrorMsg('Las contraseñas no coinciden.');

        setStatus('loading');
        try {
            const res = await fetch('/api/v1/auth/set-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || 'Error al establecer contraseña.');
            }
            setStatus('success');
        } catch (err) {
            setStatus('error');
            setErrorMsg(err.message);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-['Public_Sans']">
            <div className="bg-white rounded-2xl shadow-card border border-slate-200 w-full max-w-md p-8">

                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <span className="material-symbols-outlined text-white text-[24px]">lock_open</span>
                    </div>
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight">Establece tu contraseña</h1>
                    <p className="text-sm text-slate-500 mt-1.5">Portal RRHH — Cramer &amp; Asociados</p>
                </div>

                {status === 'success' ? (
                    <div className="text-center space-y-4">
                        <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto">
                            <span className="material-symbols-outlined text-emerald-500 text-3xl">check_circle</span>
                        </div>
                        <p className="text-slate-800 font-semibold">¡Contraseña establecida!</p>
                        <p className="text-sm text-slate-500">Ya puedes iniciar sesión con tus credenciales.</p>
                        <button
                            onClick={() => navigate('/login')}
                            className="w-full py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-colors mt-2"
                        >
                            Ir al login
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-slate-600">Nueva contraseña *</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    minLength={6}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Mínimo 6 caracteres"
                                    className="w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-shadow"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    tabIndex={-1}
                                >
                                    <span className="material-symbols-outlined text-[18px]">
                                        {showPassword ? 'visibility_off' : 'visibility'}
                                    </span>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-slate-600">Confirmar contraseña *</label>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                required
                                value={confirm}
                                onChange={e => setConfirm(e.target.value)}
                                placeholder="Repite la contraseña"
                                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-shadow"
                            />
                        </div>

                        {errorMsg && (
                            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2.5">{errorMsg}</p>
                        )}

                        <button
                            type="submit"
                            disabled={status === 'loading' || !token}
                            className="w-full py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors mt-2"
                        >
                            {status === 'loading' ? 'Guardando...' : 'Establecer contraseña'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default SetPassword;
