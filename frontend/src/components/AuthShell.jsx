import React from 'react';

/**
 * Layout institucional para las pantallas de autenticación:
 * header con la marca, contenido centrado a 400px y footer legal.
 */
const AuthShell = ({ children }) => (
    <div className="min-h-screen flex flex-col bg-white font-app text-app-ink">
        <header className="border-b border-app-line">
            <div className="h-16 max-w-[1280px] mx-auto px-4 md:px-10 flex items-center gap-2">
                <span className="material-symbols-outlined text-app-brand text-[24px]">corporate_fare</span>
                <span className="text-[20px] font-semibold tracking-tight">Plataforma de Personas</span>
            </div>
        </header>

        <main className="flex-1 flex items-center justify-center bg-app-surface px-4 md:px-10 py-12">
            <div className="w-full max-w-[400px] rounded-xl border border-app-line bg-white/70 p-8 shadow-[0_4px_20px_rgba(0,0,0,0.05)] backdrop-blur-xl">
                {children}
            </div>
        </main>

        <footer className="border-t border-app-line py-6">
            <div className="max-w-[1280px] mx-auto px-4 md:px-10 flex flex-col md:flex-row items-center justify-between gap-2 text-[11px] font-semibold text-app-muted">
                <span>© {new Date().getFullYear()} Plataforma de Personas — Uso interno</span>
                <span>Acceso restringido a personal autorizado</span>
            </div>
        </footer>
    </div>
);

export default AuthShell;
