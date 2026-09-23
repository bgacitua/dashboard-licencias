import React from 'react';
import { Link, NavLink } from 'react-router-dom';

import SidebarLayout from '../../../components/SidebarLayout';

const PESTAÑAS = [
    ['/tickets/admin', 'Solicitudes'],
    ['/tickets/admin/tipos', 'Tipos y formularios'],
    ['/tickets/admin/usuarios', 'Usuarios'],
];

/** Marco común del panel: sidebar de la plataforma + pestañas del módulo. */
export default function AdminMarco({ children, acciones }) {
    return (
        <SidebarLayout>
            <div className="mx-auto max-w-7xl p-6">
                <nav className="mb-6 flex items-center gap-2 text-sm text-app-muted">
                    <Link to="/menu" className="flex items-center gap-1 hover:text-app-ink">
                        <span className="material-symbols-outlined text-lg">home</span>
                    </Link>
                    <span>/</span>
                    <span>Tickets</span>
                </nav>
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200">
                    <div className="flex gap-1">
                        {PESTAÑAS.map(([to, label]) => (
                            <NavLink
                                key={to}
                                to={to}
                                end
                                className={({ isActive }) => `-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${
                                    isActive ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'
                                }`}
                            >
                                {label}
                            </NavLink>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 pb-2">{acciones}</div>
                </header>
                <div className="mt-6">{children}</div>
            </div>
        </SidebarLayout>
    );
}
