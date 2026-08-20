import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Barra de navegación superior con info del usuario y logout.
 */
const Navbar = () => {
    const { user, logout, isAuthenticated } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    if (!isAuthenticated) return null;

    const initials = (user?.nombre_completo || user?.username || 'U')
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(s => s[0]?.toUpperCase())
        .join('');

    return (
        <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-app-line bg-white px-4 md:px-10 h-16">
            <Link
                to="/menu"
                className="flex items-center gap-2 text-app-ink transition-colors hover:text-app-brand"
            >
                <span className="material-symbols-outlined text-app-brand text-[24px]">corporate_fare</span>
                <span className="text-[20px] font-semibold tracking-tight">Plataforma de Personas</span>
            </Link>

            <div className="flex items-center gap-4">
                <div className="hidden sm:flex items-center gap-3 border-r border-app-line pr-4">
                    <div className="flex h-9 w-9 select-none items-center justify-center rounded-lg bg-app-surface text-[13px] font-semibold text-app-brand">
                        {initials}
                    </div>
                    <div className="text-right leading-tight">
                        <p className="text-[13px] font-semibold text-app-ink">
                            {user?.nombre_completo || user?.username}
                        </p>
                        <p className="text-[12px] capitalize text-app-muted">
                            {user?.rol?.nombre || 'Usuario'}
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleLogout}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-app-line bg-white px-3.5 text-[13px] font-medium text-app-muted transition-colors hover:border-app-ink hover:text-app-ink focus:outline-none focus:ring-2 focus:ring-app-ink focus:ring-offset-2"
                >
                    <span className="material-symbols-outlined text-[18px]">logout</span>
                    <span>Cerrar sesión</span>
                </button>
            </div>
        </nav>
    );
};

export default Navbar;
