import React from 'react';

import { desglosar } from '../../../components/form-builder/desglose';

/**
 * Una respuesta ya traducida, con el desglose de cada servicio en tarjetas bajo
 * su título.
 *
 * Recibe la lista sin aplanar (`valoresDe`), no el string de `mostrar`: un
 * nombre de servicio puede traer una coma, así que partir el string de vuelta
 * rompería justo los nombres largos.
 *
 * Acá las tarjetas son clases de Tailwind y no estilos en línea como las del
 * formulario: este JSX es nuestro y no vive dentro del DOM de survey-core.
 */
export default function Desglosado({ valores, vacio = '—' }) {
    if (!valores?.length) return <span className="text-slate-400">{vacio}</span>;
    return (
        <ul className="space-y-1.5">
            {valores.map((valor, i) => {
                const { titulo, partes } = desglosar(valor);
                return (
                    <li key={i}>
                        <span className="whitespace-pre-wrap">{titulo}</span>
                        {partes.length > 0 && (
                            <span className="mt-1 flex flex-wrap gap-1">
                                {partes.map((parte, j) => (
                                    <span key={j}
                                        className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                                        {parte}
                                    </span>
                                ))}
                            </span>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
