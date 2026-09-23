import React from 'react';

import {
    OPERADORES, operadorPorDefecto, operadoresPara, parsear, preguntasAnteriores, serializar,
} from '../../../components/form-builder/logica';
import { TIPOS_CON_OPCIONES } from '../../../components/form-builder/tipos';

const control = 'rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const valorDe = (c) => (typeof c === 'string' ? c : c.value ?? c.text);
const textoDe = (c) => (typeof c === 'string' ? c : c.text ?? c.value);

/**
 * "Mostrar solo si…" en una línea, dentro de la tarjeta. Misma lógica que el
 * panel del builder de formularios (logica.js): una condición por pregunta.
 */
export default function ReglaVisible({ definicion, pregunta, onChange }) {
    const regla = parsear(pregunta.visibleIf) || { pregunta: '', operador: '=', valor: '' };
    const origenes = preguntasAnteriores(definicion, pregunta.name);
    const origen = origenes.find((p) => p.name === regla.pregunta);
    const op = OPERADORES.find((o) => o.key === regla.operador);

    const set = (cambios) => {
        const nueva = { ...regla, ...cambios };
        if (cambios.pregunta !== undefined) {
            const o = origenes.find((p) => p.name === cambios.pregunta);
            if (!operadoresPara(o).some((x) => x.key === nueva.operador)) {
                nueva.operador = operadorPorDefecto(o);
                nueva.valor = '';
            }
        }
        const visibleIf = serializar(nueva);
        const { visibleIf: _, ...resto } = pregunta;
        onChange(visibleIf ? { ...pregunta, visibleIf } : resto);
    };

    if (origenes.length === 0) {
        return <p className="text-xs text-gray-500">Las condiciones usan preguntas anteriores; esta es la primera.</p>;
    }

    const opciones = (TIPOS_CON_OPCIONES.includes(origen?.type) || origen?.type === 'imagepicker') ? origen.choices || [] : null;

    return (
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
            <span>Mostrar solo si</span>
            <select className={control} value={regla.pregunta} aria-label="Pregunta de la condición"
                onChange={(e) => set({ pregunta: e.target.value })}>
                <option value="">(siempre visible)</option>
                {origenes.map((p) => <option key={p.name} value={p.name}>{p.title || p.name}</option>)}
            </select>
            {regla.pregunta && (
                <>
                    <select className={control} value={regla.operador} aria-label="Condición"
                        onChange={(e) => set({ operador: e.target.value })}>
                        {operadoresPara(origen).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                    {!op?.sinValor && (opciones ? (
                        <select className={control} value={regla.valor} aria-label="Valor"
                            onChange={(e) => set({ valor: e.target.value })}>
                            <option value="">—</option>
                            {opciones.map((c) => <option key={valorDe(c)} value={valorDe(c)}>{textoDe(c)}</option>)}
                        </select>
                    ) : (
                        <input className={control} value={regla.valor} aria-label="Valor"
                            onChange={(e) => set({ valor: e.target.value })} />
                    ))}
                </>
            )}
        </div>
    );
}
