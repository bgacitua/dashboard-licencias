import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { SesionVencida, tokenPortal, yo } from '../services/tickets';

/**
 * Marco del portal: barra superior y guardia de sesión. Si no hay token, o el
 * backend lo rechaza, manda a /tickets/ingresar.
 *
 * `useSesionPortal` expone `manejar(error)` para que cada página derive un 401
 * a la pantalla de ingreso en vez de mostrarlo como error.
 */
export function useSesionPortal() {
    const navigate = useNavigate();
    return (error) => {
        if (error instanceof SesionVencida) {
            tokenPortal.borrar();
            navigate('/tickets/ingresar', { replace: true });
            return '';
        }
        return error.message;
    };
}

// `estilo` pinta la página con el tema del formulario (ver PortalSolicitud);
// sin él queda el degradado neutro del portal.
export default function PortalLayout({ children, ancho = 'max-w-5xl', estilo }) {
    const [usuario, setUsuario] = useState(null);
    const manejar = useSesionPortal();
    const navigate = useNavigate();
    const hayToken = !!tokenPortal.get();

    useEffect(() => {
        if (hayToken) yo().then(setUsuario).catch(manejar);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hayToken]);

    if (!hayToken) return <Navigate to="/tickets/ingresar" replace />;

    const salir = () => {
        tokenPortal.borrar();
        navigate('/tickets/ingresar', { replace: true });
    };

    return (
        <div className={`min-h-screen ${estilo ? '' : 'bg-gradient-to-b from-slate-50 to-slate-100'}`} style={estilo}>
            <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
                <div className={`mx-auto flex h-14 items-center justify-between px-4 ${ancho}`}>
                    <Link to="/tickets" className="flex items-center gap-2 font-semibold text-slate-900">
                        <span className="material-symbols-outlined text-blue-600">restaurant</span>
                        Solicitudes
                    </Link>
                    <div className="flex items-center gap-3 text-sm">
                        <span className="hidden text-slate-600 sm:inline">{usuario?.nombre || usuario?.email}</span>
                        <button onClick={salir} className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100">
                            Salir
                        </button>
                    </div>
                </div>
            </header>
            <main className={`mx-auto px-4 py-8 ${ancho}`}>{children}</main>
        </div>
    );
}
