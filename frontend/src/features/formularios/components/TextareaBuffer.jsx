import React, { useEffect, useState } from 'react';

/**
 * Textarea que conserva lo tipeado aunque el valor de afuera lo normalice.
 *
 * Un textarea controlado directo por el JSON del formulario se rompe cuando el
 * valor guardado no es idéntico al texto escrito: borrar una línea de opciones
 * la saca del array, el valor renderizado se acorta, el cursor salta al inicio
 * y una línea vacía nunca sobrevive lo suficiente para escribir encima. Acá el
 * texto crudo vive en el componente y el de afuera solo lo pisa cuando de
 * verdad cambió por otra razón (se seleccionó otra pregunta, se abrió otro
 * formulario).
 *
 * `normalizar` debe devolver, para un texto ya normalizado, el mismo texto: es
 * la comparación que distingue "el usuario está tipeando" de "esto cambió solo".
 */
export default function TextareaBuffer({ valor, normalizar, onChange, ...props }) {
    const [texto, setTexto] = useState(valor ?? '');

    useEffect(() => {
        const desdeArriba = valor ?? '';
        setTexto((actual) => (desdeArriba === normalizar(actual) ? actual : desdeArriba));
        // normalizar se redefine en cada render del padre; el disparador real es `valor`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [valor]);

    return (
        <textarea
            {...props}
            value={texto}
            onChange={(e) => {
                setTexto(e.target.value);
                onChange(e.target.value);
            }}
        />
    );
}
