import React from 'react';

import {
    operadorPorDefecto, parsear, preguntaDeEntrada, preguntasAnteriores, serializar,
} from '../../../components/form-builder/logica';

const control = 'rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500';
const valorDe = (c) => (typeof c === 'string' ? c : c.value ?? c.text);
const textoDe = (c) => (typeof c === 'string' ? c : c.text ?? c.value);

/**
 * Asigna la pregunta a un "camino": una opción de la pregunta de entrada
 * (Coffee / Almuerzo). Genera el `visibleIf` por el admin —`{entrada} = 'valor'`—
 * en vez de que lo cablee a mano. Para condiciones más complejas está el panel
 * avanzado (ReglaVisible); si hay una regla que no es un camino simple, el
 * selector cae a "Personalizado" y no la pisa.
 *
 * Solo aparece en preguntas posteriores a la entrada; si no hay entrada, no se
 * muestra.
 */
export default function SelectorCamino({ definicion, pregunta, onChange }) {
    const entrada = preguntaDeEntrada(definicion);
    if (!entrada || entrada.name === pregunta.name) return null;
    // La entrada tiene que quedar antes de esta pregunta para poder condicionarla.
    const anteriores = preguntasAnteriores(definicion, pregunta.name);
    if (!anteriores.some((p) => p.name === entrada.name)) return null;

    const operador = operadorPorDefecto(entrada);
    const regla = parsear(pregunta.visibleIf);
    const esCamino = !!regla && regla.pregunta === entrada.name && regla.operador === operador;
    const personalizado = !!pregunta.visibleIf && !esCamino;
    const valorActual = esCamino ? regla.valor : '';

    const set = (valor) => {
        const { visibleIf: _ignorado, ...sinCondicion } = pregunta;
        if (!valor) { onChange(sinCondicion); return; } // "Todos"
        onChange({ ...pregunta, visibleIf: serializar({ pregunta: entrada.name, operador, valor }) });
    };

    return (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-6 py-3 text-sm text-gray-700">
            <span className="material-symbols-outlined text-base text-gray-400">alt_route</span>
            <span>Camino</span>
            <select className={control} aria-label="Camino de la pregunta"
                disabled={personalizado}
                value={personalizado ? '__custom__' : valorActual}
                onChange={(e) => set(e.target.value)}>
                {personalizado && <option value="__custom__">Personalizado (regla avanzada)</option>}
                <option value="">Todos</option>
                {(entrada.choices || []).map((c) => (
                    <option key={valorDe(c)} value={valorDe(c)}>{textoDe(c)}</option>
                ))}
            </select>
        </div>
    );
}
