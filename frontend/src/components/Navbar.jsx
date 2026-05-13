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
        <nav className="sticky top-0 z-40 flex items-center justify-between bg-white/95 backdrop-blur border-b border-slate-200 px-6 py-3 shadow-navbar">
            <Link
                to="/menu"
                className="flex items-center gap-3 text-slate-800 hover:text-primary transition-colors"
            >
                <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shadow-sm">
                    <span className="material-symbols-outlined text-white text-xl">corporate_fare</span>
                </div>
                <span className="text-base font-semibold tracking-tight">
                    Portal RRHH
                </span>
            </Link>

            <div className="flex items-center gap-4">
                <div className="hidden sm:flex items-center gap-3 pr-4 border-r border-slate-200">
                    <div className="w-9 h-9 rounded-full bg-primary-soft text-primary flex items-center justify-center font-semibold text-sm select-none">
                        {initials}
                    </div>
                    <div className="text-right leading-tight">
                        <p className="text-sm font-semibold text-slate-800">
                            {user?.nombre_completo || user?.username}
                        </p>
                        <p className="text-xs text-slate-500 capitalize">
                            {user?.rol?.nombre || 'Usuario'}
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleLogout}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 hover:text-red-600 hover:border-red-200 transition-colors"
                >
                    <span className="material-symbols-outlined text-base">logout</span>
                    <span>Cerrar sesión</span>
                </button>
            </div>
        </nav>
    );
};

export default Navbar;
