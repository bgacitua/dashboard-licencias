import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthShell from '../components/AuthShell';

/**
 * Página de retorno del prompt de Duo (DUO_REDIRECT_URI).
 *
 * Duo redirige aquí con `state` y `duo_code`; los canjeamos en el backend por
 * el JWT de sesión. El usuario solo ve esta pantalla un instante.
 */
const DuoCallback = () => {
    const [params] = useSearchParams();
    const { completeDuoLogin } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState('');
    // StrictMode monta dos veces en desarrollo y el duo_code es de un solo uso.
    const exchanged = useRef(false);

    useEffect(() => {
        if (exchanged.current) return;
        exchanged.current = true;

        const state = params.get('state');
        const duoCode = params.get('duo_code');

        if (!state || !duoCode) {
            setError('El enlace de verificación está incompleto. Inicia sesión nuevamente.');
            return;
        }

        completeDuoLogin(state, duoCode).then((result) => {
            if (result.success) {
                navigate('/menu', { replace: true });
            } else {
                setError(result.error || 'No se pudo completar la verificación.');
            }
        });
    }, [params, completeDuoLogin, navigate]);

    return (
        <AuthShell>
            <div className="flex flex-col items-center text-center gap-4 py-6">
                {error ? (
                    <>
                        <span className="material-symbols-outlined text-[32px] text-[#93000a]">error</span>
                        <p className="text-[14px] text-app-muted">{error}</p>
                        <button
                            type="button"
                            onClick={() => navigate('/login', { replace: true })}
                            className="h-11 px-5 rounded-lg bg-app-ink text-white text-[13px] font-semibold transition-colors hover:bg-app-ink/90"
                        >
                            Volver al inicio de sesión
                        </button>
                    </>
                ) : (
                    <>
                        <svg className="animate-spin h-6 w-6 text-app-ink" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                        <p className="text-[14px] text-app-muted">Completando la verificación…</p>
                    </>
                )}
            </div>
        </AuthShell>
    );
};

export default DuoCallback;
