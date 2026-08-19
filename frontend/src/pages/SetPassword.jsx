import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';

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

    const inputClass = 'w-full h-11 rounded-lg border border-app-line bg-white text-[14px] text-app-ink placeholder:text-app-outline transition-colors focus:outline-none focus:border-app-ink focus:ring-1 focus:ring-app-ink';
    const primaryBtn = 'w-full h-11 rounded-lg bg-app-ink text-white text-[13px] font-semibold transition-colors hover:bg-app-ink/90 focus:outline-none focus:ring-2 focus:ring-app-ink focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed';

    return (
        <AuthShell>
            <div className="flex flex-col items-center text-center mb-8">
                <div className="w-11 h-11 rounded-lg bg-app-surface flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-app-brand text-[22px]">lock_open</span>
                </div>
                <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-app-ink">
                    Establece tu contraseña
                </h1>
                <p className="mt-1.5 text-[14px] text-app-muted">Plataforma de Personas — Cramer &amp; Asociados</p>
            </div>

            {status === 'success' ? (
                <div className="flex flex-col items-center text-center gap-3">
                    <span className="material-symbols-outlined text-app-brand text-[32px]">check_circle</span>
                    <p className="text-[16px] font-semibold text-app-ink">¡Contraseña establecida!</p>
                    <p className="text-[14px] text-app-muted">Ya puedes iniciar sesión con tus credenciales.</p>
                    <button onClick={() => navigate('/login')} className={`${primaryBtn} mt-3`}>
                        Ir al login
                    </button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="new-password" className="block text-[12px] font-medium text-app-ink">
                            Nueva contraseña
                        </label>
                        <div className="relative">
                            <input
                                id="new-password"
                                type={showPassword ? 'text' : 'password'}
                                required
                                minLength={6}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Mínimo 6 caracteres"
                                autoComplete="new-password"
                                className={`${inputClass} pl-3 pr-11`}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(v => !v)}
                                tabIndex={-1}
                                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                className="absolute inset-y-0 right-3 flex items-center text-app-muted transition-colors hover:text-app-ink"
                            >
                                <span className="material-symbols-outlined text-[20px]">
                                    {showPassword ? 'visibility_off' : 'visibility'}
                                </span>
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="confirm-password" className="block text-[12px] font-medium text-app-ink">
                            Confirmar contraseña
                        </label>
                        <input
                            id="confirm-password"
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={confirm}
                            onChange={e => setConfirm(e.target.value)}
                            placeholder="Repite la contraseña"
                            autoComplete="new-password"
                            className={`${inputClass} px-3`}
                        />
                    </div>

                    {errorMsg && (
                        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-[#ba1a1a]/30 bg-[#ffdad6] px-4 py-3 text-[13px] text-[#93000a]">
                            <span className="material-symbols-outlined text-[18px] mt-px flex-shrink-0">error</span>
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    <button type="submit" disabled={status === 'loading' || !token} className={primaryBtn}>
                        {status === 'loading' ? 'Guardando…' : 'Establecer contraseña'}
                    </button>
                </form>
            )}
        </AuthShell>
    );
};

export default SetPassword;
