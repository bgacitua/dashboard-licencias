import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthShell from '../components/AuthShell';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const { login, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/menu', { replace: true });
        }
    }, [isAuthenticated, navigate, location]);

    const handleCredentials = async (e) => {
        e.preventDefault();
        setError('');

        if (!username.trim() || !password.trim()) {
            setError('Por favor, completa todos los campos.');
            return;
        }

        setIsLoading(true);
        const result = await login(username, password);

        if (result.duo_auth_url) {
            // Duo se encarga del segundo factor. El login continúa al volver
            // del prompt, en /duo/callback. No quitamos el spinner: la página
            // se está yendo.
            window.location.assign(result.duo_auth_url);
            return;
        }

        setError(result.error || 'No se pudo iniciar sesión.');
        setIsLoading(false);
    };

    const inputClass = 'w-full h-11 rounded-lg border border-app-line bg-white text-[14px] text-app-ink placeholder:text-app-outline transition-colors focus:outline-none focus:border-app-ink focus:ring-1 focus:ring-app-ink disabled:bg-app-surface disabled:cursor-not-allowed';
    const primaryBtn = 'w-full h-11 flex items-center justify-center gap-2 rounded-lg bg-app-ink text-white text-[13px] font-semibold transition-colors hover:bg-app-ink/90 focus:outline-none focus:ring-2 focus:ring-app-ink focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed';
    const labelClass = 'block text-[12px] font-medium text-app-ink';

    const Spinner = () => (
        <svg className="animate-spin h-4 w-4 text-white flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
    );

    return (
        <AuthShell>
            <div className="flex flex-col items-center text-center mb-8">
                <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-app-ink">Iniciar sesión</h1>
                <p className="mt-1.5 text-[14px] text-app-muted">Ingresa tus credenciales para continuar.</p>
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-app-surface px-3 py-1 text-[12px] font-medium text-app-brand">
                    <span className="material-symbols-outlined text-[15px]">verified_user</span>
                    ¡Ahora protegido con DUO!
                </span>
            </div>

            <form onSubmit={handleCredentials} noValidate className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="username" className={labelClass}>Usuario</label>
                    <input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Nombre de usuario"
                        autoComplete="username"
                        disabled={isLoading}
                        className={`${inputClass} px-3`}
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <label htmlFor="password" className={labelClass}>Contraseña</label>
                    <div className="relative">
                        <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            disabled={isLoading}
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

                {error && (
                    <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-[#ba1a1a]/30 bg-[#ffdad6] px-4 py-3 text-[13px] text-[#93000a]">
                        <span className="material-symbols-outlined text-[18px] mt-px flex-shrink-0">error</span>
                        <span>{error}</span>
                    </div>
                )}

                <button type="submit" disabled={isLoading} className={primaryBtn}>
                    {isLoading ? (<><Spinner />Redirigiendo a Duo…</>) : 'Iniciar sesión'}
                </button>
            </form>
        </AuthShell>
    );
};

export default Login;
