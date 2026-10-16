import React from 'react';

import { desglosar } from '../../../components/form-builder/desglose';

/**
 * Render de una pregunta del formulario propio. Un switch por tipo, como el
 * `Cuerpo` del builder (builder/TarjetaPregunta.jsx), pero este es interactivo:
 * lee y escribe `question.value` del modelo de survey-core, que es quien recalcula
 * las ramas (`visibleIf`). No usa el DOM de survey-react-ui.
 *
 * Al escribir `q.value` survey dispara `onValueChanged`, y el contenedor
 * (FormularioPortal) se vuelve a montar: por eso acá no hace falta estado propio.
 */

// Opción con su desglose "Coffee break (café; galletas)" -> título + chips.
// En dropdown no: el combo cerrado es de una línea.
function Etiqueta({ texto, conChips }) {
    const { titulo, partes } = desglosar(texto);
    return (
        <span className="min-w-0">
            <span className="block">{titulo}</span>
            {conChips && partes.length > 0 && (
                <span className="mt-1 flex flex-wrap gap-1">
                    {partes.map((parte, j) => (
                        <span key={j}
                            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                            {parte}
                        </span>
                    ))}
                </span>
            )}
        </span>
    );
}

const claseInput =
    'w-full rounded-[var(--fp-radio)] border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 ' +
    'shadow-sm transition-colors placeholder:text-slate-400 ' +
    'focus:border-[var(--fp-marca)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--fp-marca)_30%,transparent)] ' +
    'disabled:bg-slate-50 disabled:text-slate-500';

// Tarjeta de opción (radio/checkbox): objetivo grande y look de "elegir", no de
// casilla de formulario. El estado activo tiñe con el color de marca.
const claseOpcion = (activo, lectura) =>
    `flex cursor-pointer items-start gap-3 rounded-[var(--fp-radio)] border px-5 py-4 text-base transition-all duration-200 focus-within:ring-2 focus-within:ring-[var(--fp-marca)] focus-within:ring-offset-1 ${
        activo
            ? 'border-[var(--fp-marca)] bg-[color-mix(in_srgb,var(--fp-marca)_8%,white)] shadow-md ring-1 ring-[var(--fp-marca)]'
            : 'border-slate-200 shadow-sm hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md'
    } ${lectura ? 'pointer-events-none opacity-70' : ''}`;

// Si la opción empieza con un emoji ("☕ Coffee"), lo separa para pintarlo grande
// como ícono del camino. Si no hay emoji, icono queda vacío y se usa solo el texto.
const partirIcono = (texto) => {
    const m = /^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s*(.*)$/u.exec(texto || '');
    return m ? { icono: m[1], resto: m[2] || texto } : { icono: '', resto: texto };
};

// Pregunta de entrada: dos (o más) tarjetas grandes lado a lado, cada una un
// camino. Al elegir una se despliega su formulario (vía visibleIf). `grande` es
// la vista de selección a pantalla completa (paso 1); sin él, el formato normal.
export function TarjetasCamino({ q, lectura, grande = false }) {
    return (
        <div role="radiogroup" aria-label={q.title || 'Opciones'} className="grid gap-4 sm:grid-cols-2 sm:gap-6">
            {q.visibleChoices.map((item) => {
                const activo = q.value === item.value;
                const { titulo, partes } = desglosar(item.text);
                const { icono, resto } = partirIcono(titulo);
                return (
                    <button key={item.value} type="button" role="radio" aria-checked={activo} disabled={lectura}
                        onClick={() => { q.value = item.value; }}
                        className={`flex flex-col items-center justify-center gap-3 rounded-[var(--fp-radio)] border-2 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fp-marca)] focus-visible:ring-offset-2 ${
                            grande ? 'px-8 py-14' : 'px-6 py-8'
                        } ${
                            activo
                                ? 'border-[var(--fp-marca)] bg-[color-mix(in_srgb,var(--fp-marca)_8%,white)] shadow-lg ring-1 ring-[var(--fp-marca)]'
                                : 'border-slate-200 shadow-sm hover:-translate-y-1 hover:border-[var(--fp-marca)] hover:shadow-xl'
                        } ${lectura ? 'pointer-events-none opacity-70' : ''}`}>
                        {icono && <span className={grande ? 'text-6xl leading-none' : 'text-4xl leading-none'} aria-hidden>{icono}</span>}
                        <span className={`font-semibold text-slate-900 ${grande ? 'text-2xl tracking-tight' : 'text-lg'}`}>{resto}</span>
                        {partes.length > 0 && (
                            <span className="flex flex-wrap justify-center gap-1">
                                {partes.map((parte, j) => (
                                    <span key={j} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                                        {parte}
                                    </span>
                                ))}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

function Control({ q, lectura, entrada }) {
    const tipo = q.getType();

    const setTexto = (v) => { q.value = v === '' ? undefined : v; };

    // La entrada de selección única va como tarjetas de camino.
    if (entrada && tipo === 'radiogroup') return <TarjetasCamino q={q} lectura={lectura} />;

    switch (tipo) {
        case 'text': {
            const it = q.inputType || 'text';
            const asNumero = it === 'number';
            return (
                <input
                    type={it}
                    className={claseInput}
                    disabled={lectura}
                    placeholder={q.renderedPlaceholder || ''}
                    value={q.value ?? ''}
                    min={asNumero && q.min != null ? q.min : undefined}
                    max={asNumero && q.max != null ? q.max : undefined}
                    onChange={(e) => {
                        const v = e.target.value;
                        q.value = v === '' ? undefined : (asNumero ? Number(v) : v);
                    }}
                />
            );
        }

        case 'comment':
            return (
                <textarea rows={4} className={claseInput} disabled={lectura}
                    placeholder={q.renderedPlaceholder || ''}
                    value={q.value ?? ''} onChange={(e) => setTexto(e.target.value)} />
            );

        case 'radiogroup':
            return (
                <div className="flex flex-col gap-2">
                    {q.visibleChoices.map((item) => {
                        const activo = q.value === item.value;
                        return (
                            <label key={item.value} className={claseOpcion(activo, lectura)}>
                                <input type="radio" className="mt-0.5 h-4 w-4 accent-[var(--fp-marca)]"
                                    name={q.name} checked={activo} disabled={lectura}
                                    onChange={() => { q.value = item.value; }} />
                                <Etiqueta texto={item.text} conChips />
                            </label>
                        );
                    })}
                </div>
            );

        case 'checkbox': {
            const arr = Array.isArray(q.value) ? q.value : [];
            const alternar = (val) => {
                q.value = arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
            };
            return (
                <div className="flex flex-col gap-2">
                    {q.visibleChoices.map((item) => {
                        const activo = arr.includes(item.value);
                        return (
                            <label key={item.value} className={claseOpcion(activo, lectura)}>
                                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--fp-marca)]"
                                    checked={activo} disabled={lectura}
                                    onChange={() => alternar(item.value)} />
                                <Etiqueta texto={item.text} conChips />
                            </label>
                        );
                    })}
                </div>
            );
        }

        case 'dropdown':
            return (
                <select className={claseInput} disabled={lectura}
                    value={q.value ?? ''}
                    onChange={(e) => {
                        const item = q.visibleChoices.find((c) => String(c.value) === e.target.value);
                        q.value = item ? item.value : undefined;
                    }}>
                    <option value="">{q.renderedPlaceholder || 'Elige una opción'}</option>
                    {q.visibleChoices.map((item) => (
                        <option key={item.value} value={String(item.value)}>{desglosar(item.text).titulo}</option>
                    ))}
                </select>
            );

        case 'boolean':
            return (
                <div className="flex gap-2">
                    {[[true, q.labelTrue || 'Sí'], [false, q.labelFalse || 'No']].map(([val, rotulo]) => {
                        const activo = q.booleanValue === val;
                        return (
                            <button key={String(val)} type="button" disabled={lectura} aria-pressed={activo}
                                onClick={() => { q.booleanValue = activo ? undefined : val; }}
                                className={`rounded-[var(--fp-radio)] border px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fp-marca)] focus-visible:ring-offset-1 ${
                                    activo ? 'border-[var(--fp-marca)] bg-[color-mix(in_srgb,var(--fp-marca)_8%,white)] text-slate-900'
                                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                                }`}>
                                {rotulo}
                            </button>
                        );
                    })}
                </div>
            );

        // Contenido del admin; mismo trato que hoy (survey lo inyecta por innerHTML).
        case 'html':
            return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: q.processedHtml || '' }} />;

        case 'image':
            return q.imageLink
                ? <img src={q.imageLink} alt="" className="rounded-[var(--fp-radio)]"
                    style={{ height: q.imageHeight || 'auto', width: q.imageWidth || '100%', objectFit: q.imageFit || 'cover' }} />
                : null;

        // Tipo aún no portado al renderer propio: no se rompe, se avisa.
        default:
            return (
                <p className="rounded-[var(--fp-radio)] border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Este tipo de pregunta («{tipo}») todavía no está disponible en esta vista.
                </p>
            );
    }
}

const DECORATIVAS = new Set(['html', 'image']);

export default function Pregunta({ q, lectura, entrada = false }) {
    const decorativa = DECORATIVAS.has(q.getType());
    const errores = q.errors || [];
    return (
        <div className="min-w-0">
            {!decorativa && q.title && (
                <label className={`block text-slate-900 ${
                    entrada ? 'mb-4 text-center text-lg font-semibold' : 'mb-3 text-lg font-semibold'
                }`}>
                    {q.title}
                    {q.isRequired && <span className="ml-1 text-[var(--fp-marca)]" aria-hidden>*</span>}
                </label>
            )}
            {q.description && <p className={`mb-3 -mt-1 text-base text-slate-500 ${entrada ? 'text-center' : ''}`}>{q.description}</p>}
            <Control q={q} lectura={lectura} entrada={entrada} />
            {errores.length > 0 && (
                <p className="mt-1.5 text-sm text-red-600" role="alert">
                    {errores.map((e) => e.getText()).join(' ')}
                </p>
            )}
        </div>
    );
}
