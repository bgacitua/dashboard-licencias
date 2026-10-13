import React, { useEffect, useState } from 'react';

import { INTERVALO_MS, NOTICIAS } from '../noticias';

/**
 * Rota los mensajes de `noticias.js` en la pantalla de acuse. Reemplaza al
 * "¡Gracias por completar la encuesta!" de survey-core, que era un texto fijo.
 */
export default function CarruselNoticias({ noticias = NOTICIAS, intervalo = INTERVALO_MS }) {
    const [i, setI] = useState(0);

    useEffect(() => {
        // ponytail: un setInterval y nada más; con una sola noticia no rota.
        if (noticias.length < 2) return undefined;
        const t = setInterval(() => setI((n) => (n + 1) % noticias.length), intervalo);
        return () => clearInterval(t);
    }, [noticias, intervalo]);

    if (!noticias.length) return null;
    const actual = noticias[i];

    return (
        <section
            className="rounded-2xl border border-slate-200 bg-white px-5 py-6 text-center"
            aria-live="polite"
        >
            <span className="material-symbols-outlined text-4xl text-green-600">check_circle</span>
            {/* key por índice: el mensaje se vuelve a montar y entra animado. */}
            <div key={i} className="animate-entra mt-3">
                {actual.titulo && (
                    <p className="text-lg font-semibold text-slate-900">{actual.titulo}</p>
                )}
                <p className="mx-auto mt-1 max-w-prose text-sm text-slate-600">{actual.texto}</p>
            </div>

            {noticias.length > 1 && (
                <div className="mt-4 flex items-center justify-center gap-2">
                    {noticias.map((n, idx) => (
                        <button
                            key={n.texto}
                            type="button"
                            onClick={() => setI(idx)}
                            aria-label={`Mensaje ${idx + 1} de ${noticias.length}`}
                            aria-current={idx === i}
                            className={`h-2 rounded-full transition-all duration-200 ${
                                idx === i ? 'w-5 bg-blue-600' : 'w-2 bg-slate-300 hover:bg-slate-400'
                            }`}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
