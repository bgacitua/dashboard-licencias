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
    { key: 'notcontains', label: 'no contiene' },
    { key: 'notempty', label: 'está respondida', sinValor: true },
    { key: 'empty', label: 'no está respondida', sinValor: true },
];

/** Tipos cuya respuesta es un array y no un escalar. */
const TIPOS_MULTIPLES = ['checkbox', 'tagbox'];

/**
 * Operadores válidos según el tipo de la pregunta origen.
 *
 * Una pregunta de selección múltiple guarda `["Opción 1"]`, así que `=` compara
 * un array contra un string y nunca es verdadero: el campo dependiente no
 * aparece nunca. Para esos tipos la pertenencia se pregunta con `contains`.
 */
export const operadoresPara = (tipo) =>
    TIPOS_MULTIPLES.includes(tipo)
        ? OPERADORES.filter((o) => o.key !== '=' && o.key !== '<>')
        : OPERADORES.filter((o) => o.key !== 'notcontains');

/** El operador por defecto de un origen: el primero que ese tipo admite. */
export const operadorPorDefecto = (tipo) => operadoresPara(tipo)[0].key;

// survey-core corta el literal en la primera comilla simple: sin escapar, un
// valor con apóstrofo produce una expresión inválida, y una expresión inválida
// se evalúa como visible (falla abierta, mostrando lo que debía esconderse).
const escapar = (texto) => String(texto ?? '').replace(/'/g, "\\'");
const desescapar = (texto) => texto.replace(/\\'/g, "'");

/** Regla -> string de survey-core. Sin pregunta origen, no hay condición. */
export const serializar = ({ pregunta, operador, valor }) => {
    if (!pregunta || !operador) return undefined;
    const op = OPERADORES.find((o) => o.key === operador);
    if (op?.sinValor) return `{${pregunta}} ${operador}`;
    return `{${pregunta}} ${operador} '${escapar(valor)}'`;
};

/** string de survey-core -> regla. Devuelve null si no calza con el formato v1. */
export const parsear = (visibleIf) => {
    if (!visibleIf) return null;
    const sinValor = visibleIf.match(/^\{([^}]+)\}\s+(notempty|empty)$/);
    if (sinValor) return { pregunta: sinValor[1], operador: sinValor[2], valor: '' };

    const conValor = visibleIf.match(/^\{([^}]+)\}\s+(=|<>|contains|notcontains)\s+'(.*)'$/);
    if (conValor) {
        return { pregunta: conValor[1], operador: conValor[2], valor: desescapar(conValor[3]) };
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
