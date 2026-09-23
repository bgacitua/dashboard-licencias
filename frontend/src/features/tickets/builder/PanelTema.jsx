import React from 'react';

import { CampoImagen } from '../../../components/form-builder/PanelPropiedades';
import { TEMA_DEFECTO } from '../../../components/form-builder/tema';
import { subirImagen } from '../services/tickets';

const label = 'mb-1.5 block text-xs font-medium text-gray-600';

// Paletas rápidas, como Forms: color principal + un fondo que combine.
const PALETAS = [
    ['#2563eb', '#eff6ff'], ['#7c3aed', '#f5f3ff'], ['#db2777', '#fdf2f8'], ['#dc2626', '#fef2f2'],
    ['#ea580c', '#fff7ed'], ['#16a34a', '#f0fdf4'], ['#0d9488', '#f0fdfa'], ['#334155', '#f1f5f9'],
];

/** Panel lateral de apariencia. Cada cambio se ve al instante en el lienzo. */
export default function PanelTema({ tema, onChange, onCerrar }) {
    const t = { ...TEMA_DEFECTO, ...tema };
    const set = (cambios) => onChange({ ...t, ...cambios });

    return (
        <aside className="sticky top-4 max-h-[calc(100vh-2rem)] w-80 shrink-0 overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Tema</h2>
                <button type="button" onClick={onCerrar} aria-label="Cerrar tema"
                    className="rounded-lg p-1 text-gray-500 hover:bg-gray-100">
                    <span className="material-symbols-outlined text-lg">close</span>
                </button>
            </div>

            <span className={`${label} mt-5`}>Paleta</span>
            <div className="grid grid-cols-8 gap-1.5">
                {PALETAS.map(([color, fondo]) => (
                    <button key={color} type="button" onClick={() => set({ color, fondo })}
                        aria-label={`Paleta ${color}`}
                        className={`h-7 w-7 rounded-full ring-offset-2 ${t.color === color ? 'ring-2 ring-gray-900' : ''}`}
                        style={{ background: color }} />
                ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="text-xs text-gray-600">
                    Principal
                    <input type="color" value={t.color} onChange={(e) => set({ color: e.target.value })}
                        className="mt-1 h-9 w-full cursor-pointer rounded border border-gray-300" />
                </label>
                <label className="text-xs text-gray-600">
                    Fondo
                    <input type="color" value={t.fondo} onChange={(e) => set({ fondo: e.target.value })}
                        className="mt-1 h-9 w-full cursor-pointer rounded border border-gray-300" />
                </label>
            </div>

            <span className={`${label} mt-5`}>Encabezado</span>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1 text-xs">
                {[['simple', 'Simple'], ['color', 'Color'], ['imagen', 'Imagen']].map(([k, l]) => (
                    <button key={k} type="button" onClick={() => set({ encabezado: k })}
                        className={`rounded-md py-1.5 ${t.encabezado === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}>
                        {l}
                    </button>
                ))}
            </div>
            {t.encabezado === 'imagen' && (
                <div className="mt-3">
                    <span className={label}>Imagen del encabezado (ideal 1600×400)</span>
                    <CampoImagen valor={t.encabezadoImagen} subirImagen={subirImagen}
                        onChange={(v) => set({ encabezadoImagen: v })} />
                </div>
            )}

            <span className={`${label} mt-5`}>Logo</span>
            <CampoImagen valor={t.logo} subirImagen={subirImagen} onChange={(v) => set({ logo: v })} />

            <span className={`${label} mt-5`}>Imagen de fondo</span>
            <CampoImagen valor={t.fondoImagen} subirImagen={subirImagen} onChange={(v) => set({ fondoImagen: v })} />

            <label className={`${label} mt-5`} htmlFor="tk-esquinas">Esquinas: {t.esquinas}px</label>
            <input id="tk-esquinas" type="range" min="0" max="20" value={t.esquinas}
                onChange={(e) => set({ esquinas: Number(e.target.value) })} className="w-full" />

            <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={!!t.sinPaneles} onChange={(e) => set({ sinPaneles: e.target.checked })} />
                Preguntas sin tarjeta
            </label>
        </aside>
    );
}
