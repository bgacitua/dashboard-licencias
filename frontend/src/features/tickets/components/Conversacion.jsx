import React, { useState } from 'react';

import { ESTADOS, fechaHora } from '../services/tickets';

/** Historial de estados y comentarios de un ticket, con caja para responder. */
export default function Conversacion({ eventos = [], onEnviar, lado = 'usuario' }) {
    const [texto, setTexto] = useState('');
    const [error, setError] = useState('');
    const [enviando, setEnviando] = useState(false);

    const enviar = async (e) => {
        e.preventDefault();
        if (!texto.trim()) return;
        setEnviando(true);
        setError('');
        try {
            await onEnviar(texto.trim());
            setTexto('');
        } catch (err) {
            setError(err.message);
        } finally {
            setEnviando(false);
        }
    };

    return (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Seguimiento</h2>
            <ol className="mt-4 space-y-3">
                {eventos.map((ev, i) => {
                    const propio = (lado === 'admin') === ev.es_admin;
                    return (
                        <li key={i} className={`flex ${propio ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                                propio ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'
                            }`}>
                                {ev.estado_nuevo && (
                                    <p className="font-medium">
                                        Cambió el estado a {ESTADOS[ev.estado_nuevo]?.label || ev.estado_nuevo}
                                    </p>
                                )}
                                {ev.texto && <p className="whitespace-pre-wrap">{ev.texto}</p>}
                                <p className={`mt-1 text-[11px] ${propio ? 'text-blue-100' : 'text-slate-500'}`}>
                                    {ev.es_admin ? (lado === 'admin' ? ev.autor : 'Administración') : ev.autor} · {fechaHora(ev.created_at)}
                                </p>
                            </div>
                        </li>
                    );
                })}
                {eventos.length === 0 && <li className="text-sm text-slate-500">Sin mensajes todavía.</li>}
            </ol>
            <form onSubmit={enviar} className="mt-4 flex gap-2">
                <input
                    className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="Escribe un mensaje…"
                    maxLength={2000}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    aria-label="Mensaje"
                />
                <button disabled={enviando || !texto.trim()}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                    Enviar
                </button>
            </form>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </section>
    );
}
