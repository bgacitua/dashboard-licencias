import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const { login, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    React.useEffect(() => {
        if (isAuthenticated) {
            navigate('/menu', { replace: true });
        }
    }, [isAuthenticated, navigate, location]);

    const handleSubmit = async (e) => {
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
        } else {
            setError(result.error);
        }

        setIsLoading(false);
    };

    return (
        <div className="min-h-screen flex font-['Public_Sans']">
            {/* Panel izquierdo — branding */}
            <aside className="hidden lg:flex lg:w-[480px] xl:w-[540px] flex-shrink-0 flex-col justify-between bg-[#0c1a3a] px-14 py-16 relative overflow-hidden">
                {/* Texture sutil */}
                <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
                    <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
                    <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-blue-800/20 blur-3xl" />
                    {/* Grid decorativo */}
                    <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid)" />
                    </svg>
                </div>

                {/* Logo */}
                <div className="relative z-10 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg">
                        <span className="material-symbols-outlined text-white text-xl">corporate_fare</span>
                    </div>
                    <span className="text-white font-semibold text-lg tracking-tight">HR Portal</span>
                </div>

                {/* Cuerpo */}
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

                    {/* Feature pills */}
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

                {/* Footer branding */}
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

                    {/* Header form */}
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                            Iniciar sesión
                        </h2>
                        <p className="mt-1.5 text-slate-500 text-sm">
                            Ingresa tus credenciales para continuar.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} noValidate className="space-y-5">
                        {/* Usuario */}
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

                        {/* Contraseña */}
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

                        {/* Error */}
                        {error && (
                            <div
                                role="alert"
                                className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                            >
                                <span className="material-symbols-outlined text-red-500 text-[18px] mt-px flex-shrink-0">error</span>
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex items-center justify-center gap-2.5 py-3 px-6 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>
                                    <svg
                                        className="animate-spin h-4 w-4 text-white flex-shrink-0"
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        aria-hidden="true"
                                    >
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

                    <p className="mt-8 text-center text-xs text-slate-400">
                        Acceso restringido a personal autorizado.
                    </p>
                </div>
            </main>
        </div>
    );
};

export default Login;
