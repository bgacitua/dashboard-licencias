import React from 'react';

import { hitos, momento } from '../seguimiento';

/**
 * El recorrido de una solicitud como línea de tiempo: punto lleno en lo que ya
 * ocurrió, con su fecha y quién lo hizo, y punto hueco en lo que falta.
 *
 * Se lee, no se contesta. Lo que el usuario tenga que decir va en una solicitud
 * de cambio; lo que diga el administrador, en el comentario con que mueve el
 * estado.
 *
 * `columna`: para ir en una columna lateral de alto fijo. Los hitos scrollean
 * dentro y la caja nunca empuja el resto de la página.
 */
export default function Seguimiento({ ticket, lado = 'usuario', columna = false }) {
    const linea = hitos(ticket, lado);
    const acento = lado === 'admin' ? 'bg-red-700' : 'bg-blue-600';

    return (
        <section className={`rounded-2xl border border-slate-200 bg-white p-5 ${columna ? 'flex h-full flex-col' : ''}`}>
            <h2 className="text-sm font-semibold text-slate-900">Seguimiento</h2>
            <ol className={`mt-4 ${columna ? 'max-h-[60vh] min-h-0 flex-1 overflow-y-auto pr-1 lg:max-h-none' : ''}`}>
                {linea.map((h, i) => (
                    <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
                        {/* El riel arranca bajo el punto y llega hasta el hito
                            siguiente; en el último no hay nada que unir. */}
                        {i < linea.length - 1 && (
                            <span aria-hidden="true"
                                className="absolute bottom-0 left-[7px] top-[18px] w-px bg-slate-200" />
                        )}
                        <span aria-hidden="true"
                            className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full ${
                                h.hecho ? acento : 'border-2 border-slate-300 bg-white'
                            }`} />
                        <div className="min-w-0">
                            <p className={`text-sm font-medium ${h.hecho ? 'text-slate-900' : 'text-slate-400'}`}>
                                {h.titulo}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                                {h.hecho ? `${momento(h.cuando)} · ${h.autor}` : h.pista}
                            </p>
                            {h.texto && (
                                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{h.texto}</p>
                            )}
                        </div>
                    </li>
                ))}
            </ol>
            {lado !== 'admin' && (
                <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
                    Acá te avisamos cómo avanza tu solicitud. No hace falta que respondas.
                </p>
            )}
        </section>
    );
}
