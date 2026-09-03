import React from 'react';

import TextareaBuffer from './TextareaBuffer';
import { OPERADORES, operadorPorDefecto, operadoresPara, parsear, preguntasAnteriores, serializar } from './logica';
import { TIPOS, TIPOS_CON_OPCIONES } from './tipos';

const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const label = 'block text-xs font-medium text-gray-600 mt-4 mb-1';

const textoDeOpcion = (c) => (typeof c === 'string' ? c : c.text ?? c.value ?? '');
const lineasUtiles = (texto) => texto.split('\n').filter((l) => l.trim() !== '');

/** Panel de propiedades de la pregunta seleccionada. */
export default function PanelPropiedades({ definicion, pregunta, onChange, onEliminar }) {
    if (!pregunta) {
        return (
            <aside className="w-80 shrink-0 border-l border-gray-200 bg-white p-4">
                <p className="text-sm text-gray-500">Selecciona una pregunta para editarla.</p>
            </aside>
        );
    }

    const set = (campo, valor) => onChange({ ...pregunta, [campo]: valor });
    const meta = TIPOS[pregunta.type] || { label: pregunta.type, campos: [] };
    const regla = parsear(pregunta.visibleIf) || { pregunta: '', operador: '=', valor: '' };
    const origenes = preguntasAnteriores(definicion, pregunta.name);
    const origen = origenes.find((p) => p.name === regla.pregunta);
    const operadoresValidos = operadoresPara(origen?.type);

    const setRegla = (cambios) => {
        const nueva = { ...regla, ...cambios };
        // Cambiar el origen puede dejar un operador que ese tipo no admite
        // (p. ej. `=` sobre una selección múltiple, que nunca sería verdadero).
        if (cambios.pregunta !== undefined) {
            const tipoNuevo = origenes.find((p) => p.name === cambios.pregunta)?.type;
            if (!operadoresPara(tipoNuevo).some((o) => o.key === nueva.operador)) {
                nueva.operador = operadorPorDefecto(tipoNuevo);
                nueva.valor = '';
            }
        }
        onChange({ ...pregunta, visibleIf: serializar(nueva) });
    };

    const opDefinido = OPERADORES.find((o) => o.key === regla.operador);

    return (
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">{meta.label}</h2>
                <button type="button" onClick={onEliminar} className="text-xs text-red-600 hover:underline">
                    Eliminar
                </button>
            </div>

            <label className={label} htmlFor="prop-title">Enunciado</label>
            <input id="prop-title" className={input} value={pregunta.title || ''}
                onChange={(e) => set('title', e.target.value)} />

            <label className={label} htmlFor="prop-name">
                Nombre del campo (clave de la respuesta)
            </label>
            <input id="prop-name" className={input} value={pregunta.name}
                onChange={(e) => set('name', e.target.value.trim())} />

            <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={!!pregunta.isRequired}
                    onChange={(e) => set('isRequired', e.target.checked)} />
                Obligatoria
            </label>

            {meta.campos.map((campo) => (
                <div key={campo.key}>
                    <label className={label} htmlFor={`prop-${campo.key}`}>{campo.label}</label>
                    {campo.tipo === 'opciones' ? (
                        // Una opción por línea: editar una lista corta en un
                        // textarea es menos fricción que N inputs con botones.
                        <TextareaBuffer
                            key={pregunta.name}
                            id={`prop-${campo.key}`}
                            rows={5}
                            className={input}
                            valor={(pregunta[campo.key] || []).map(textoDeOpcion).join('\n')}
                            normalizar={(texto) => lineasUtiles(texto).join('\n')}
                            onChange={(texto) => set(campo.key, lineasUtiles(texto))}
                        />
                    ) : (
                        <input
                            id={`prop-${campo.key}`}
                            type={campo.tipo === 'numero' ? 'number' : 'text'}
                            className={input}
                            value={pregunta[campo.key] ?? ''}
                            onChange={(e) => set(campo.key, campo.tipo === 'numero' ? Number(e.target.value) : e.target.value)}
                        />
                    )}
                </div>
            ))}

            <hr className="my-5 border-gray-200" />

            <h3 className="text-sm font-semibold text-gray-900">Mostrar solo si…</h3>
            <label className={label} htmlFor="regla-pregunta">Pregunta</label>
            <select id="regla-pregunta" className={input} value={regla.pregunta}
                onChange={(e) => setRegla({ pregunta: e.target.value })}>
                <option value="">Siempre visible</option>
                {origenes.map((p) => (
                    <option key={p.name} value={p.name}>{p.title || p.name}</option>
                ))}
            </select>

            {regla.pregunta && (
                <>
                    <label className={label} htmlFor="regla-operador">Condición</label>
                    <select id="regla-operador" className={input} value={regla.operador}
                        onChange={(e) => setRegla({ operador: e.target.value })}>
                        {operadoresValidos.map((o) => (
                            <option key={o.key} value={o.key}>{o.label}</option>
                        ))}
                    </select>

                    {!opDefinido?.sinValor && (
                        <>
                            <label className={label} htmlFor="regla-valor">Valor</label>
                            {(() => {
                                const opciones = TIPOS_CON_OPCIONES.includes(origen?.type)
                                    ? (origen.choices || []).map((c) => (typeof c === 'string' ? c : c.value ?? c.text))
                                    : null;
                                return opciones ? (
                                    <select id="regla-valor" className={input} value={regla.valor}
                                        onChange={(e) => setRegla({ valor: e.target.value })}>
                                        <option value="">—</option>
                                        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                ) : (
                                    <input id="regla-valor" className={input} value={regla.valor}
                                        onChange={(e) => setRegla({ valor: e.target.value })} />
                                );
                            })()}
                        </>
                    )}
                </>
            )}
        </aside>
    );
}
