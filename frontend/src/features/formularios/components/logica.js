/**
 * Lógica condicional: una regla por pregunta, serializada al `visibleIf` de
 * survey-core.
 *
 * ponytail: v1 soporta exactamente una condición por pregunta ("mostrar si
 * {otra} = valor"). Combinar reglas con and/or exige un parser de expresiones;
 * si se pide, ese es el punto donde crece.
 */
export const OPERADORES = [
    { key: '=', label: 'es igual a' },
    { key: '<>', label: 'es distinto de' },
    { key: 'contains', label: 'contiene' },
    { key: 'notempty', label: 'está respondida', sinValor: true },
    { key: 'empty', label: 'no está respondida', sinValor: true },
];

/** Regla -> string de survey-core. Sin pregunta origen, no hay condición. */
export const serializar = ({ pregunta, operador, valor }) => {
    if (!pregunta || !operador) return undefined;
    const op = OPERADORES.find((o) => o.key === operador);
    if (op?.sinValor) return `{${pregunta}} ${operador}`;
    // Escapa comillas simples: un valor con apóstrofo rompe la expresión.
    const seguro = String(valor ?? '').replace(/'/g, "\'");
    return `{${pregunta}} ${operador} '${seguro}'`;
};

/** string de survey-core -> regla. Devuelve null si no calza con el formato v1. */
export const parsear = (visibleIf) => {
    if (!visibleIf) return null;
    const sinValor = visibleIf.match(/^\{([^}]+)\}\s+(notempty|empty)$/);
    if (sinValor) return { pregunta: sinValor[1], operador: sinValor[2], valor: '' };

    const conValor = visibleIf.match(/^\{([^}]+)\}\s+(=|<>|contains)\s+'(.*)'$/);
    if (conValor) {
        return { pregunta: conValor[1], operador: conValor[2], valor: conValor[3].replace(/\'/g, "'") };
    }
    return null;
};

/** Preguntas que pueden ser origen de la condición: las anteriores a esta. */
export const preguntasAnteriores = (definicion, nombreActual) => {
    const salida = [];
    for (const pagina of definicion.pages || []) {
        for (const el of pagina.elements || []) {
            if (el.name === nombreActual) return salida;
            salida.push(el);
        }
    }
    return salida;
};
