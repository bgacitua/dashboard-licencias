import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { initialize2FA } from '../services/auth';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // 2FA state
    const [step, setStep] = useState('credentials'); // 'credentials' | 'totp' | 'setup' | 'setup-confirm'
    const [preAuthToken, setPreAuthToken] = useState('');
    const [setupToken, setSetupToken] = useState('');
    const [setupData, setSetupData] = useState(null); // { qr_image_b64, secret }
    const [totpCode, setTotpCode] = useState('');
    const totpInputRef = useRef(null);

    const { login, verify2FA, activate2FA, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/menu', { replace: true });
        }
    }, [isAuthenticated, navigate, location]);

    useEffect(() => {
        if ((step === 'totp' || step === 'setup-confirm') && totpInputRef.current) {
            totpInputRef.current.focus();
        }
    }, [step]);

    const handleCredentials = async (e) => {
        e.preventDefault();
        setError('');

        if (!username.trim() || !password.trim()) {
            setError('Por favor, completa todos los campos.');
            return;
        }

        setIsLoading(true);
        const result = await login(username, password);

        if (result.success) {
            navigate('/menu', { replace: true });
        } else if (result.requires_2fa) {
            setPreAuthToken(result.pre_auth_token);
            setStep('totp');
        } else if (result.requires_setup) {
            // 2FA obligatorio — cargar QR y mostrar setup
            setSetupToken(result.setup_token);
            setIsLoading(true);
            try {
                const data = await initialize2FA(result.setup_token);
                setSetupData(data);
                setStep('setup');
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        } else {
            setError(result.error);
        }

        setIsLoading(false);
    };

    const handleTotpVerify = async (e) => {
        e.preventDefault();
        setError('');

        const code = totpCode.replace(/\s/g, '');
        if (code.length !== 6 || !/^\d+$/.test(code)) {
            setError('Ingresa el código de 6 dígitos de tu app autenticadora.');
            return;
        }

        setIsLoading(true);
        const result = await verify2FA(preAuthToken, code);

        if (result.success) {
            navigate('/menu', { replace: true });
        } else {
            setError(result.error || 'Código incorrecto. Inténtalo nuevamente.');
            setTotpCode('');
        }

        setIsLoading(false);
    };

    const handleSetupConfirm = async (e) => {
        e.preventDefault();
        setError('');
        const code = totpCode.replace(/\s/g, '');
        if (code.length !== 6 || !/^\d+$/.test(code)) {
            setError('Ingresa el código de 6 dígitos de tu app autenticadora.');
            return;
        }
        setIsLoading(true);
        const result = await activate2FA(setupToken, code);
        if (result.success) {
            navigate('/menu', { replace: true });
        } else {
            setError(result.error || 'Código incorrecto. Inténtalo nuevamente.');
            setTotpCode('');
        }
        setIsLoading(false);
    };

    const handleBackToCredentials = () => {
        setStep('credentials');
        setPreAuthToken('');
        setSetupToken('');
        setSetupData(null);
        setTotpCode('');
        setError('');
    };

    return (
        <div className="min-h-screen flex font-['Public_Sans']">
            {/* Panel izquierdo — branding */}
            <aside className="hidden lg:flex lg:w-[480px] xl:w-[540px] flex-shrink-0 flex-col justify-between bg-[#0c1a3a] px-14 py-16 relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
                    <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
                    <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-blue-800/20 blur-3xl" />
                    <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid)" />
                    </svg>
                </div>

                <div className="relative z-10 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg">
                        <span className="material-symbols-outlined text-white text-xl">corporate_fare</span>
                    </div>
                    <span className="text-white font-semibold text-lg tracking-tight">HR Portal</span>
                </div>

                <div className="relative z-10 space-y-6">
                    <div className="space-y-3">
                        <p className="text-primary/80 text-sm font-semibold uppercase tracking-widest">
                            Gestión de Personas
                        </p>
                        <h1 className="text-white text-4xl font-bold leading-snug">
                            Tu plataforma<br />de recursos humanos.
                        </h1>
                        <p className="text-slate-400 text-base leading-relaxed">
                            Administra licencias, vacaciones, finiquitos y más desde un único lugar seguro.
                        </p>
                    </div>

                    <ul className="space-y-2.5">
                        {[
                            { icon: 'medical_services', label: 'Licencias y permisos médicos' },
                            { icon: 'beach_access',     label: 'Control de vacaciones activas' },
                            { icon: 'description',      label: 'Generación de finiquitos' },
                        ].map(({ icon, label }) => (
                            <li key={label} className="flex items-center gap-3 text-slate-300 text-sm">
                                <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                                    <span className="material-symbols-outlined text-white text-[18px]">{icon}</span>
                                </span>
                                {label}
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="relative z-10 text-slate-600 text-xs">
                    © {new Date().getFullYear()} Portal RRHH — Uso interno
                </p>
            </aside>

            {/* Panel derecho — formulario */}
            <main className="flex-1 flex items-center justify-center bg-slate-50 px-6 py-12">
                <div className="w-full max-w-[400px]">
                    {/* Logo mobile */}
                    <div className="flex items-center gap-2.5 mb-10 lg:hidden">
                        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-sm">
                            <span className="material-symbols-outlined text-white text-xl">corporate_fare</span>
                        </div>
                        <span className="text-slate-800 font-semibold text-lg tracking-tight">HR Portal</span>
                    </div>

                    {step === 'credentials' ? (
                        <>
                            <div className="mb-8">
                                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                                    Iniciar sesión
                                </h2>
                                <p className="mt-1.5 text-slate-500 text-sm">
                                    Ingresa tus credenciales para continuar.
                                </p>
                            </div>

                            <form onSubmit={handleCredentials} noValidate className="space-y-5">
                                <div className="space-y-1.5">
                                    <label htmlFor="username" className="block text-sm font-semibold text-slate-700">
                                        Usuario
                                    </label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                                            <span className="material-symbols-outlined text-slate-400 text-[20px]">person</span>
                                        </span>
                                        <input
                                            id="username"
                                            type="text"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            placeholder="Nombre de usuario"
                                            autoComplete="username"
                                            disabled={isLoading}
                                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-slate-100 disabled:cursor-not-allowed"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                                        Contraseña
                                    </label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                                            <span className="material-symbols-outlined text-slate-400 text-[20px]">lock</span>
                                        </span>
                                        <input
                                            id="password"
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Contraseña"
                                            autoComplete="current-password"
                                            disabled={isLoading}
                                            className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-slate-100 disabled:cursor-not-allowed"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(v => !v)}
                                            tabIndex={-1}
                                            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                            className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[20px]">
                                                {showPassword ? 'visibility_off' : 'visibility'}
                                            </span>
                                        </button>
                                    </div>
                                </div>

                                {error && (
                                    <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                        <span className="material-symbols-outlined text-red-500 text-[18px] mt-px flex-shrink-0">error</span>
                                        <span>{error}</span>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full flex items-center justify-center gap-2.5 py-3 px-6 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4 text-white flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                            </svg>
                                            Iniciando sesión…
                                        </>
                                    ) : (
                                        <>
                                            Iniciar sesión
                                            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                                        </>
                                    )}
                                </button>
                            </form>
                        </>
                    ) : step === 'setup' ? (
                        /* ── Step 2a: Setup obligatorio — escanear QR ── */
                        <>
                            <div className="mb-6">
                                <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
                                    <span className="material-symbols-outlined text-amber-600 text-2xl">security</span>
                                </div>
                                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                                    Configura la verificación en dos pasos
                                </h2>
                                <p className="mt-1.5 text-slate-500 text-sm">
                                    Tu cuenta requiere 2FA obligatoriamente. Escanea el código QR con Google Authenticator o Authy.
                                </p>
                            </div>

                            <div className="flex flex-col items-center gap-4 mb-6">
                                {setupData && (
                                    <img
                                        src={setupData.qr_image_b64}
                                        alt="Código QR para configurar 2FA"
                                        className="w-48 h-48 rounded-xl border border-slate-200 shadow-sm"
                                    />
                                )}
                                <div className="text-center w-full">
                                    <p className="text-xs text-slate-500 mb-1">¿No puedes escanear? Ingresa este código en tu app:</p>
                                    <code className="text-xs font-mono bg-slate-100 px-3 py-2 rounded-lg text-slate-700 tracking-widest break-all select-all block">
                                        {setupData?.secret}
                                    </code>
                                </div>
                            </div>

                            <button
                                onClick={() => { setStep('setup-confirm'); setTotpCode(''); setError(''); }}
                                className="w-full flex items-center justify-center gap-2.5 py-3 px-6 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold shadow-sm transition-colors"
                            >
                                Ya escaneé el código
                                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                            </button>

                            <button
                                type="button"
                                onClick={handleBackToCredentials}
                                className="w-full flex items-center justify-center gap-1.5 mt-3 py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                                Volver al inicio de sesión
                            </button>
                        </>

                    ) : step === 'setup-confirm' ? (
                        /* ── Step 2b: Setup obligatorio — confirmar código ── */
                        <>
                            <div className="mb-8">
                                <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
                                    <span className="material-symbols-outlined text-amber-600 text-2xl">verified_user</span>
                                </div>
                                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                                    Confirma tu app autenticadora
                                </h2>
                                <p className="mt-1.5 text-slate-500 text-sm">
                                    Ingresa el código de 6 dígitos que muestra tu app para activar 2FA.
                                </p>
                            </div>

                            <form onSubmit={handleSetupConfirm} noValidate className="space-y-5">
                                <input
                                    ref={totpInputRef}
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={6}
                                    value={totpCode}
                                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000000"
                                    autoComplete="one-time-code"
                                    disabled={isLoading}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-300 text-center text-2xl font-mono tracking-[0.5em] shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-slate-100"
                                />

                                {error && (
                                    <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                        <span className="material-symbols-outlined text-red-500 text-[18px] mt-px flex-shrink-0">error</span>
                                        <span>{error}</span>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isLoading || totpCode.length !== 6}
                                    className="w-full flex items-center justify-center gap-2.5 py-3 px-6 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4 text-white flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                            </svg>
                                            Activando…
                                        </>
                                    ) : (
                                        <>
                                            Activar y entrar
                                            <span className="material-symbols-outlined text-[18px]">lock</span>
                                        </>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => { setStep('setup'); setError(''); }}
                                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                                    Ver QR nuevamente
                                </button>
                            </form>
                        </>

                    ) : (
                        /* ── Step 3: TOTP verify ── */
                        <>
                            <div className="mb-8">
                                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                                    <span className="material-symbols-outlined text-primary text-2xl">shield_lock</span>
                                </div>
                                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                                    Verificación en dos pasos
                                </h2>
                                <p className="mt-1.5 text-slate-500 text-sm">
                                    Abre tu app autenticadora e ingresa el código de 6 dígitos.
                                </p>
                            </div>

                            <form onSubmit={handleTotpVerify} noValidate className="space-y-5">
                                <div className="space-y-1.5">
                                    <label htmlFor="totp" className="block text-sm font-semibold text-slate-700">
                                        Código de verificación
                                    </label>
                                    <input
                                        ref={totpInputRef}
                                        id="totp"
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        maxLength={6}
                                        value={totpCode}
                                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder="000000"
                                        autoComplete="one-time-code"
                                        disabled={isLoading}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-300 text-center text-2xl font-mono tracking-[0.5em] shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-slate-100 disabled:cursor-not-allowed"
                                    />
                                </div>

                                {error && (
                                    <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                        <span className="material-symbols-outlined text-red-500 text-[18px] mt-px flex-shrink-0">error</span>
                                        <span>{error}</span>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isLoading || totpCode.length !== 6}
                                    className="w-full flex items-center justify-center gap-2.5 py-3 px-6 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4 text-white flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                            </svg>
                                            Verificando…
                                        </>
                                    ) : (
                                        <>
                                            Verificar
                                            <span className="material-symbols-outlined text-[18px]">verified_user</span>
                                        </>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={handleBackToCredentials}
                                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                                    Volver al inicio de sesión
                                </button>
                            </form>
                        </>
                    )}

                    <p className="mt-8 text-center text-xs text-slate-400">
                        Acceso restringido a personal autorizado.
                    </p>
                </div>
            </main>
        </div>
    );
};

export default Login;
