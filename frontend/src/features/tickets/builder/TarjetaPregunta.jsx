import React, { useEffect, useRef, useState } from 'react';

import { TIPOS, aHtmlInformativo, claveTipo, deHtmlInformativo } from '../../../components/form-builder/tipos';
import TextareaBuffer from '../../../components/form-builder/TextareaBuffer';
import { subirImagen } from '../services/tickets';
import ReglaVisible from './ReglaVisible';
import { cambiarTipo, tiposDePregunta } from './operaciones';

// ponytail: `file` fuera del builder de tickets. survey-core guarda el archivo
// en base64 dentro de la respuesta y cada edición es una versión nueva.
const EXCLUIDOS = ['file'];

const sinBorde = 'w-full border-0 border-b border-transparent bg-transparent px-0 focus:border-[var(--tk-color)] focus:outline-none focus:ring-0';
const mock = 'border-b border-dashed border-gray-300 pb-1 text-sm text-gray-400';
// El :focus-visible global de index.css no está en una capa de Tailwind y le
// gana a cualquier utilidad; inline sí gana. El foco lo marca el subrayado.
export const SIN_CONTORNO = { outline: 'none' };

/** Subida de imagen compacta, para dentro de la tarjeta. */
function SubirImagen({ valor, onChange, className = '', alto = 'h-40', texto = 'Subir imagen' }) {
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
        <label className={`group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-500 hover:border-[var(--tk-color)] ${alto} ${className}`}>
            {valor ? (
                <>
                    <img src={valor} alt="" className="h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition group-hover:opacity-100">
                        Cambiar
                    </span>
                </>
            ) : (
                <span className="flex flex-col items-center gap-1">
                    <span className="material-symbols-outlined">add_photo_alternate</span>
                    {estado || texto}
                </span>
            )}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
                onChange={(e) => subir(e.target.files?.[0])} />
        </label>
    );
}

/**
 * Opciones de texto editables en línea, como Forms: Enter agrega la siguiente,
 * Backspace en una vacía la borra y vuelve a la anterior.
 */
function OpcionesTexto({ opciones, marca, onChange }) {
    const refs = useRef([]);
    const enfocar = useRef(null);

    useEffect(() => {
        if (enfocar.current !== null) {
            refs.current[enfocar.current]?.focus();
            enfocar.current = null;
        }
    });

    const set = (i, v) => onChange(opciones.map((o, j) => (j === i ? v : o)));
    const agregar = (despues) => {
        const nuevas = [...opciones];
        nuevas.splice(despues + 1, 0, `Opción ${opciones.length + 1}`);
        enfocar.current = despues + 1;
        onChange(nuevas);
    };
    const quitar = (i) => {
        enfocar.current = Math.max(0, i - 1);
        onChange(opciones.filter((_, j) => j !== i));
    };
    const repetidas = new Set(opciones.filter((o, i) => opciones.indexOf(o) !== i));

    return (
        <div className="space-y-1">
            {opciones.map((o, i) => (
                <div key={i} className="group flex items-center gap-3">
                    <span className="w-5 text-center text-gray-400">{marca(i)}</span>
                    <input
                        ref={(el) => { refs.current[i] = el; }}
                        style={SIN_CONTORNO}
                        className={`${sinBorde} py-1.5 text-sm ${repetidas.has(o) ? 'text-red-600' : 'text-gray-800'}`}
                        value={o}
                        aria-label={`Opción ${i + 1}`}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => set(i, e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); agregar(i); }
                            if (e.key === 'Backspace' && o === '' && opciones.length > 1) { e.preventDefault(); quitar(i); }
                        }}
                    />
                    <button type="button" onClick={() => quitar(i)} disabled={opciones.length <= 1}
                        aria-label={`Quitar opción ${i + 1}`}
                        className="text-gray-400 opacity-0 hover:text-gray-700 group-hover:opacity-100 disabled:hidden">
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>
            ))}
            <button type="button" onClick={() => agregar(opciones.length - 1)}
                className="ml-8 py-1.5 text-sm text-gray-500 hover:text-[var(--tk-color)]">
                Agregar opción
            </button>
            {repetidas.size > 0 && (
                <p className="ml-8 text-xs text-red-600">Hay opciones repetidas: survey-core no las distingue.</p>
            )}
        </div>
    );
}

/** Opciones con imagen: grilla de tarjetas con foto y texto. */
function OpcionesImagen({ opciones, onChange }) {
    const set = (i, cambios) => onChange(opciones.map((o, j) => (j === i ? { ...o, ...cambios } : o)));
    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {opciones.map((o, i) => (
                <div key={o.value} className="group relative">
                    <SubirImagen valor={o.imageLink} onChange={(url) => set(i, { imageLink: url })}
                        alto="" className="aspect-[4/3]" texto="Foto" />
                    <input className={`${sinBorde} mt-1 text-center text-sm`} style={SIN_CONTORNO} placeholder={`Opción ${i + 1}`}
                        aria-label={`Texto de la opción ${i + 1}`}
                        // El value se fija al crear la opción y no sigue al texto:
                        // renombrarla no deja respuestas viejas apuntando a nada.
                        value={o.text ?? ''} onChange={(e) => set(i, { text: e.target.value })} />
                    <button type="button" onClick={() => onChange(opciones.filter((_, j) => j !== i))}
                        aria-label={`Quitar opción ${i + 1}`}
                        className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-gray-600 opacity-0 shadow group-hover:opacity-100">
                        <span className="material-symbols-outlined text-base">close</span>
                    </button>
                </div>
            ))}
            <button type="button"
                onClick={() => onChange([...opciones, { value: `op_${Date.now().toString(36)}`, text: '', imageLink: '' }])}
                className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 hover:border-[var(--tk-color)] hover:text-[var(--tk-color)]">
                + Opción
            </button>
        </div>
    );
}

/** Lo que va bajo el enunciado: editor si está seleccionada, maqueta si no. */
function Cuerpo({ p, editando, set }) {
    const clave = claveTipo(p);
    const opciones = p.choices || [];

    switch (clave) {
        case 'text':
            return <p className={`${mock} w-1/2`}>{p.placeholder || 'Respuesta corta'}</p>;
        case 'comment':
            return <p className={`${mock} w-full`}>{p.placeholder || 'Respuesta larga'}</p>;
        case 'numero':
            return editando ? (
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                    <span className={mock}>123</span>
                    <label>Mínimo <input type="number" className="ml-1 w-20 rounded border border-gray-300 px-2 py-1"
                        value={p.min ?? ''} onChange={(e) => set({ min: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
                    <label>Máximo <input type="number" className="ml-1 w-20 rounded border border-gray-300 px-2 py-1"
                        value={p.max ?? ''} onChange={(e) => set({ max: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
                </div>
            ) : <p className={`${mock} w-32`}>{p.min != null || p.max != null ? `${p.min ?? '…'} a ${p.max ?? '…'}` : 'Número'}</p>;
        case 'fecha':
            return <p className={`${mock} flex w-40 items-center justify-between`}>dd-mm-aaaa <span className="material-symbols-outlined text-base">calendar_today</span></p>;
        case 'radiogroup':
        case 'checkbox':
        case 'dropdown': {
            const marca = clave === 'radiogroup' ? () => '○' : clave === 'checkbox' ? () => '☐' : (i) => `${i + 1}.`;
            if (editando) return <OpcionesTexto opciones={opciones} marca={marca} onChange={(v) => set({ choices: v })} />;
            return (
                <ul className="space-y-1.5 text-sm text-gray-700">
                    {opciones.map((o, i) => <li key={i} className="flex gap-3"><span className="w-5 text-center text-gray-400">{marca(i)}</span>{o}</li>)}
                </ul>
            );
        }
        case 'imagepicker':
            if (editando) return <OpcionesImagen opciones={opciones} onChange={(v) => set({ choices: v })} />;
            return (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {opciones.map((o) => (
                        <figure key={o.value} className="overflow-hidden rounded-lg border border-gray-200">
                            {o.imageLink
                                ? <img src={o.imageLink} alt="" className="aspect-[4/3] w-full object-cover" />
                                : <div className="aspect-[4/3] bg-gray-100" />}
                            <figcaption className="px-2 py-1 text-center text-sm text-gray-700">{o.text}</figcaption>
                        </figure>
                    ))}
                    {opciones.length === 0 && <p className="text-sm text-gray-400">Sin opciones todavía.</p>}
                </div>
            );
        case 'boolean':
            return <div className="flex gap-2 text-sm">{['Sí', 'No'].map((x) => <span key={x} className="rounded-full border border-gray-300 px-4 py-1 text-gray-600">{x}</span>)}</div>;
        case 'rating': {
            const max = p.rateMax || 5;
            return (
                <div className="flex flex-wrap items-center gap-2">
                    {Array.from({ length: max }, (_, i) => (
                        <span key={i} className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-sm text-gray-600">{i + 1}</span>
                    ))}
                    {editando && (
                        <select className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm" value={max} aria-label="Máximo de la escala"
                            onChange={(e) => set({ rateMax: Number(e.target.value) })}>
                            {[3, 4, 5, 6, 7, 10].map((n) => <option key={n} value={n}>1 a {n}</option>)}
                        </select>
                    )}
                </div>
            );
        }
        case 'image':
            return editando ? (
                <div className="space-y-2">
                    <SubirImagen valor={p.imageLink} onChange={(url) => set({ imageLink: url })} alto="" className="min-h-40"
                        texto="Subir imagen (menú, foto del plato…)" />
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                        Alto: {p.imageHeight || 240}px
                        <input type="range" min="120" max="600" step="20" value={p.imageHeight || 240}
                            onChange={(e) => set({ imageHeight: Number(e.target.value) })} />
                    </label>
                </div>
            ) : p.imageLink ? (
                <img src={p.imageLink} alt={p.title || ''} className="w-full rounded-lg object-cover" style={{ height: p.imageHeight || 240 }} />
            ) : <div className="flex h-32 items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-400">Imagen sin cargar</div>;
        case 'html':
            return editando ? (
                <>
                    <TextareaBuffer
                        key={p.name}
                        rows={4}
                        style={SIN_CONTORNO}
                        className="w-full rounded-lg border border-gray-200 p-3 text-sm focus:border-[var(--tk-color)] focus:outline-none"
                        placeholder="Escribe el aviso o la instrucción…"
                        valor={deHtmlInformativo(p.html)}
                        normalizar={(t) => deHtmlInformativo(aHtmlInformativo(t))}
                        onChange={(t) => set({ html: aHtmlInformativo(t) })}
                    />
                    <p className="mt-1 text-xs text-gray-500">Usa **texto** para negrita.</p>
                </>
            ) : (
                // aHtmlInformativo escapa todo; solo introduce <strong>, <br> y el div.
                <div className="text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: p.html || '<span style="color:#9ca3af">Texto informativo vacío</span>' }} />
            );
        default:
            return <p className={mock}>{TIPOS[clave]?.label || p.type}</p>;
    }
}

/**
 * Una pregunta en el lienzo. Seleccionada: se edita en el lugar. Sin
 * seleccionar: se ve como la verá el usuario (maqueta, no survey-core; la
 * vista previa exacta está en su pestaña).
 */
export default function TarjetaPregunta({
    definicion, pregunta: p, seleccionada, onSeleccionar, onChange, onDuplicar, onEliminar,
    arrastre, estiloTarjeta,
}) {
    const [extra, setExtra] = useState(false);
    const meta = TIPOS[claveTipo(p)] || { label: p.type, campos: [] };
    const set = (cambios) => onChange({ ...p, ...cambios });

    return (
        <div
            onClick={() => !seleccionada && onSeleccionar(p.name)}
            className={`relative bg-white transition ${seleccionada ? 'shadow-md' : 'cursor-pointer hover:shadow-sm'}`}
            style={{
                ...estiloTarjeta,
                boxShadow: seleccionada ? `inset 5px 0 0 var(--tk-color), 0 4px 12px rgba(0,0,0,.08)` : estiloTarjeta.boxShadow,
            }}
        >
            <button type="button" {...arrastre} aria-label="Arrastrar para reordenar"
                onClick={(e) => e.stopPropagation()}
                className="absolute left-1/2 top-0.5 -translate-x-1/2 cursor-grab text-gray-300 hover:text-gray-500">
                <span className="material-symbols-outlined text-lg">drag_indicator</span>
            </button>

            <div className="px-6 pb-4 pt-6">
                {p.type !== 'html' && (
                    seleccionada ? (
                        <div className="flex flex-wrap items-start gap-3">
                            <input
                                autoFocus
                                style={SIN_CONTORNO}
                                className="min-w-0 flex-1 rounded-t-md border-0 border-b-2 border-gray-200 bg-gray-50 px-3 py-3 text-base text-gray-900 focus:border-[var(--tk-color)] focus:outline-none"
                                placeholder={meta.sinRespuesta ? 'Título (opcional)' : 'Pregunta'}
                                value={p.title || ''}
                                aria-label="Enunciado"
                                // Una pregunta nueva trae el tipo como enunciado: seleccionarlo
                                // entero hace que escribir lo reemplace, como en Forms.
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => set({ title: e.target.value })}
                            />
                            {!meta.sinRespuesta && (
                                <select
                                    className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"
                                    value={claveTipo(p)}
                                    aria-label="Tipo de pregunta"
                                    onChange={(e) => onChange(cambiarTipo(p, e.target.value))}
                                >
                                    {tiposDePregunta(EXCLUIDOS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                                </select>
                            )}
                        </div>
                    ) : (
                        (p.title || !meta.sinRespuesta) && (
                            <p className="text-base text-gray-900">
                                {p.title || <span className="text-gray-400">Pregunta sin enunciado</span>}
                                {p.isRequired && <span className="ml-1 text-red-600">*</span>}
                            </p>
                        )
                    )
                )}

                {!meta.sinRespuesta && (seleccionada ? (
                    <input className={`${sinBorde} mt-2 text-sm text-gray-600`} style={SIN_CONTORNO} placeholder="Descripción (opcional)"
                        aria-label="Descripción" value={p.description || ''}
                        onChange={(e) => set({ description: e.target.value || undefined })} />
                ) : p.description && <p className="mt-1 text-sm text-gray-500">{p.description}</p>)}

                {!seleccionada && p.visibleIf && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                        <span className="material-symbols-outlined text-sm">call_split</span> Condicional
                    </p>
                )}

                <div className="mt-4">
                    <Cuerpo p={p} editando={seleccionada} set={set} />
                </div>
            </div>

            {seleccionada && (
                <>
                    {extra && (
                        <div className="space-y-3 border-t border-gray-100 bg-gray-50/60 px-6 py-4">
                            <ReglaVisible definicion={definicion} pregunta={p} onChange={onChange} />
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input type="checkbox" checked={p.startWithNewLine === false}
                                    onChange={(e) => set({ startWithNewLine: e.target.checked ? false : undefined })} />
                                Al lado de la anterior (en pantallas chicas se apila sola)
                            </label>
                            {(claveTipo(p) === 'text' || claveTipo(p) === 'comment') && (
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                    Texto de ejemplo
                                    <input className="flex-1 rounded border border-gray-300 px-2 py-1" value={p.placeholder || ''}
                                        onChange={(e) => set({ placeholder: e.target.value || undefined })} />
                                </label>
                            )}
                            {p.type === 'imagepicker' && (
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                    <input type="checkbox" checked={!!p.multiSelect} onChange={(e) => set({ multiSelect: e.target.checked })} />
                                    Permitir elegir varias
                                </label>
                            )}
                            {!meta.sinRespuesta && (
                                <label className="flex items-center gap-2 text-xs text-gray-500">
                                    Nombre del campo (clave en las respuestas)
                                    <input className="flex-1 rounded border border-gray-300 px-2 py-1 font-mono"
                                        value={p.name} onChange={(e) => set({ name: e.target.value.trim() })} />
                                </label>
                            )}
                        </div>
                    )}
                    <div className="flex items-center justify-end gap-1 border-t border-gray-100 px-4 py-2 text-gray-600">
                        <button type="button" onClick={onDuplicar} title="Duplicar" aria-label="Duplicar"
                            className="rounded-full p-2 hover:bg-gray-100">
                            <span className="material-symbols-outlined text-xl">content_copy</span>
                        </button>
                        <button type="button" onClick={onEliminar} title="Eliminar" aria-label="Eliminar"
                            className="rounded-full p-2 hover:bg-gray-100">
                            <span className="material-symbols-outlined text-xl">delete</span>
                        </button>
                        {!meta.sinRespuesta && (
                            <>
                                <span className="mx-2 h-6 w-px bg-gray-200" />
                                <label className="flex cursor-pointer items-center gap-2 text-sm">
                                    Obligatoria
                                    <input type="checkbox" role="switch" checked={!!p.isRequired}
                                        onChange={(e) => set({ isRequired: e.target.checked })}
                                        className="h-4 w-4 accent-[var(--tk-color)]" />
                                </label>
                            </>
                        )}
                        <button type="button" onClick={() => setExtra(!extra)} title="Más opciones" aria-label="Más opciones"
                            aria-expanded={extra}
                            className={`ml-1 rounded-full p-2 hover:bg-gray-100 ${extra || p.visibleIf ? 'text-[var(--tk-color)]' : ''}`}>
                            <span className="material-symbols-outlined text-xl">more_vert</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
