import React from 'react';

import Desglosado from './Desglosado';
import { bloque, fechaCorta } from '../services/tickets';

/**
 * Lo que el usuario lleva elegido, al lado del formulario que está llenando.
 *
 * Es un ayudamemoria, no una lista de pendientes: muestra lo contestado y
 * calla lo que falta. Quien decide qué entra es survey-core —una pregunta
 * escondida por su `visibleIf` no llega acá—, así que el resumen nunca afirma
 * algo que el usuario no esté viendo.
 *
 * Solo existe al crear una solicitud. Abriendo una ya enviada, la columna es
 * del Seguimiento: ahí lo que importa es en qué quedó, no qué se eligió.
 */
export default function ResumenVivo({ reserva, tramo, filas = [] }) {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Tu solicitud</h2>

            {reserva && (
                <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5">
                    <p className="text-sm font-medium text-slate-800">
                        {fechaCorta(reserva.fecha)}
                        {tramo?.inicio && ` · ${tramo.inicio}–${tramo.fin}`}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                        {reserva.sala}
                        {reserva.asunto ? ` — ${reserva.asunto}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                        Dentro de tu reserva de {bloque(reserva)}
                    </p>
                </div>
            )}

            {filas.length > 0 ? (
                <dl className="mt-4 space-y-3">
                    {filas.map((f) => (
                        <div key={f.name}>
                            <dt className="text-xs text-slate-500">{f.title}</dt>
                            <dd className="mt-0.5 text-sm text-slate-900">
                                <Desglosado valores={f.valores} />
                            </dd>
                        </div>
                    ))}
                </dl>
            ) : (
                <p className="mt-4 text-sm text-slate-500">
                    Acá vas a ir viendo lo que elijas, para revisarlo antes de enviar.
                </p>
            )}

            {/* Las respuestas escritas a mano aparecen al salir del campo:
                survey-core avisa del cambio en `onBlur`, no en cada tecla. */}
        </section>
    );
}
