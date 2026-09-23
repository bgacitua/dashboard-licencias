import React, { useState } from 'react';

import TextareaBuffer from './TextareaBuffer';
import { OPERADORES, operadorPorDefecto, operadoresPara, parsear, preguntasAnteriores, serializar } from './logica';
import { TIPOS, TIPOS_CON_OPCIONES, aHtmlInformativo, claveTipo, deHtmlInformativo } from './tipos';

const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const label = 'block text-xs font-medium text-gray-600 mt-4 mb-1';

const textoDeOpcion = (c) => (typeof c === 'string' ? c : c.text ?? c.value ?? '');
const valorDeOpcion = (c) => (typeof c === 'string' ? c : c.value ?? c.text);
const lineasUtiles = (texto) => texto.split('\n').filter((l) => l.trim() !== '');

/**
 * Selector de imagen: sube el archivo con `subirImagen` (lo pone el módulo,
 * que sabe a qué endpoint va) o acepta una URL pegada. Sin `subirImagen` queda
 * solo la URL.
 */
export function CampoImagen({ id, valor, onChange, subirImagen }) {
    const [estado, setEstado] = useState('');

    const subir = async (archivo) => {
        if (!archivo) return;
        setEstado('Subiendo…');
        try {
            onChange(await subirImagen(archivo));
            setEstado('');
        } catch (e) {
            setEstado(e.message);
        }
    };

    return (
        <div className="space-y-2">
            {valor && (
                <img src={valor} alt="" className="h-24 w-full rounded-lg border border-gray-200 object-cover" />
            )}
            <div className="flex gap-2">
                {subirImagen && (
                    <label className="cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100">
                        {valor ? 'Cambiar' : 'Subir imagen'}
                        <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            onChange={(e) => subir(e.target.files?.[0])}
                        />
                    </label>
                )}
                {valor && (
                    <button type="button" onClick={() => onChange('')} className="text-xs text-red-600 hover:underline">
                        Quitar
                    </button>
                )}
            </div>
            <input id={id} className={input} placeholder="…o pega una URL" value={valor || ''}
                onChange={(e) => onChange(e.target.value)} />
            {estado && <p className="text-xs text-gray-600">{estado}</p>}
        </div>
    );
}

/** Opciones de un imagepicker: cada una con texto e imagen. */
function OpcionesImagen({ opciones, onChange, subirImagen }) {
    const set = (i, cambios) => onChange(opciones.map((o, j) => (j === i ? { ...o, ...cambios } : o)));

    return (
        <div className="space-y-3">
            {opciones.map((o, i) => (
                <div key={i} className="rounded-lg border border-gray-200 p-2">
                    <div className="flex items-center gap-2">
                        <input
                            className={input}
                            placeholder={`Opción ${i + 1}`}
                            value={o.text ?? ''}
                            // El value se fija al crear la opción y no sigue al texto: si se
                            // renombrara, las respuestas viejas quedarían apuntando a nada.
                            onChange={(e) => set(i, { text: e.target.value })}
                        />
                        <button type="button" onClick={() => onChange(opciones.filter((_, j) => j !== i))}
                            className="text-xs text-red-600 hover:underline" aria-label={`Quitar opción ${i + 1}`}>
                            ✕
                        </button>
                    </div>
                    <div className="mt-2">
                        <CampoImagen valor={o.imageLink} onChange={(url) => set(i, { imageLink: url })} subirImagen={subirImagen} />
                    </div>
                </div>
            ))}
            <button
                type="button"
                onClick={() => onChange([...opciones, { value: `op_${Date.now().toString(36)}`, text: '', imageLink: '' }])}
                className="w-full rounded-lg border border-dashed border-gray-400 px-3 py-1.5 text-sm text-gray-600"
            >
                + Opción
            </button>
        </div>
    );
}

/** Panel de propiedades de la pregunta seleccionada. */
export default function PanelPropiedades({ definicion, pregunta, onChange, onEliminar, subirImagen }) {
    if (!pregunta) {
        return (
            <aside className="w-80 shrink-0 border-l border-gray-200 bg-white p-4">
                <p className="text-sm text-gray-500">Selecciona una pregunta para editarla.</p>
            </aside>
        );
    }

    const set = (campo, valor) => onChange({ ...pregunta, [campo]: valor });
    const meta = TIPOS[claveTipo(pregunta)] || { label: pregunta.type, campos: [] };
    const regla = parsear(pregunta.visibleIf) || { pregunta: '', operador: '=', valor: '' };
    const origenes = preguntasAnteriores(definicion, pregunta.name);
    const origen = origenes.find((p) => p.name === regla.pregunta);
    const operadoresValidos = operadoresPara(origen);

    const setRegla = (cambios) => {
        const nueva = { ...regla, ...cambios };
        // Cambiar el origen puede dejar un operador que ese tipo no admite
        // (p. ej. `=` sobre una selección múltiple, que nunca sería verdadero).
        if (cambios.pregunta !== undefined) {
            const nuevoOrigen = origenes.find((p) => p.name === cambios.pregunta);
            if (!operadoresPara(nuevoOrigen).some((o) => o.key === nueva.operador)) {
                nueva.operador = operadorPorDefecto(nuevoOrigen);
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

            {pregunta.type !== 'html' && (
                <>
                    <label className={label} htmlFor="prop-title">{meta.sinRespuesta ? 'Título (opcional)' : 'Enunciado'}</label>
                    <input id="prop-title" className={input} value={pregunta.title || ''}
                        onChange={(e) => set('title', e.target.value)} />
                </>
            )}

            {!meta.sinRespuesta && (
                <>
                    <label className={label} htmlFor="prop-description">Ayuda (texto chico bajo el enunciado)</label>
                    <input id="prop-description" className={input} value={pregunta.description || ''}
                        onChange={(e) => set('description', e.target.value || undefined)} />

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
                </>
            )}

            <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                <input
                    type="checkbox"
                    checked={pregunta.startWithNewLine === false}
                    // survey-core pone en la misma fila lo que tenga startWithNewLine
                    // false; en pantallas chicas lo vuelve a apilar solo.
                    onChange={(e) => set('startWithNewLine', e.target.checked ? false : undefined)}
                />
                Al lado de la anterior
            </label>

            {meta.campos.map((campo) => (
                <div key={campo.key}>
                    {campo.tipo !== 'booleano' && (
                        <label className={label} htmlFor={`prop-${campo.key}`}>{campo.label}</label>
                    )}
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
                    ) : campo.tipo === 'opcionesImagen' ? (
                        <OpcionesImagen opciones={pregunta[campo.key] || []} subirImagen={subirImagen}
                            onChange={(v) => set(campo.key, v)} />
                    ) : campo.tipo === 'imagen' ? (
                        <CampoImagen id={`prop-${campo.key}`} valor={pregunta[campo.key]} subirImagen={subirImagen}
                            onChange={(v) => set(campo.key, v)} />
                    ) : campo.tipo === 'html' ? (
                        <>
                            <TextareaBuffer
                                key={pregunta.name}
                                id={`prop-${campo.key}`}
                                rows={6}
                                className={input}
                                valor={deHtmlInformativo(pregunta[campo.key])}
                                normalizar={(texto) => deHtmlInformativo(aHtmlInformativo(texto))}
                                onChange={(texto) => set(campo.key, aHtmlInformativo(texto))}
                            />
                            <p className="mt-1 text-xs text-gray-500">Usa **texto** para negrita.</p>
                        </>
                    ) : campo.tipo === 'booleano' ? (
                        <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
                            <input type="checkbox" checked={!!pregunta[campo.key]}
                                onChange={(e) => set(campo.key, e.target.checked)} />
                            {campo.label}
                        </label>
                    ) : (
                        <input
                            id={`prop-${campo.key}`}
                            type={campo.tipo === 'numero' ? 'number' : 'text'}
                            className={input}
                            value={pregunta[campo.key] ?? ''}
                            onChange={(e) => {
                                const v = e.target.value;
                                // Vacío = sin valor, no 0: un "máximo 0" dejaría la pregunta inusable.
                                set(campo.key, campo.tipo === 'numero' ? (v === '' ? undefined : Number(v)) : v);
                            }}
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
                                const conOpciones = TIPOS_CON_OPCIONES.includes(origen?.type) || origen?.type === 'imagepicker';
                                const opciones = conOpciones ? (origen.choices || []) : null;
                                return opciones ? (
                                    <select id="regla-valor" className={input} value={regla.valor}
                                        onChange={(e) => setRegla({ valor: e.target.value })}>
                                        <option value="">—</option>
                                        {opciones.map((o) => (
                                            <option key={valorDeOpcion(o)} value={valorDeOpcion(o)}>{textoDeOpcion(o)}</option>
                                        ))}
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
