/**
 * Tipos de pregunta que ofrece el builder y qué propiedades expone cada uno.
 *
 * Un mapa, no un componente por tipo: los campos editables son los mismos
 * controles (texto, booleano, lista de opciones) repetidos.
 *
 * `campos` son propiedades extra sobre las comunes (title, name, isRequired).
 * Los nombres son los de survey-core, porque el JSON que se edita es el que
 * consume survey-core sin traducción intermedia.
 */
export const TIPOS = {
    text: { label: 'Texto corto', campos: [{ key: 'placeholder', label: 'Placeholder', tipo: 'texto' }] },
    comment: { label: 'Texto largo', campos: [{ key: 'placeholder', label: 'Placeholder', tipo: 'texto' }] },
    radiogroup: { label: 'Selección única', campos: [{ key: 'choices', label: 'Opciones', tipo: 'opciones' }] },
    checkbox: { label: 'Selección múltiple', campos: [{ key: 'choices', label: 'Opciones', tipo: 'opciones' }] },
    dropdown: { label: 'Lista desplegable', campos: [{ key: 'choices', label: 'Opciones', tipo: 'opciones' }] },
    boolean: { label: 'Sí / No', campos: [] },
    rating: { label: 'Escala', campos: [{ key: 'rateMax', label: 'Máximo', tipo: 'numero' }] },
    file: { label: 'Archivo', campos: [] },
};

export const TIPOS_CON_OPCIONES = ['radiogroup', 'checkbox', 'dropdown'];

let contador = 0;

/** Nombre único de pregunta. Es la clave con la que se guarda la respuesta. */
export const nuevoNombre = (tipo) => `${tipo}_${Date.now().toString(36)}${contador++}`;

export const nuevaPregunta = (tipo) => {
    const base = { type: tipo, name: nuevoNombre(tipo), title: TIPOS[tipo].label, isRequired: false };
    if (TIPOS_CON_OPCIONES.includes(tipo)) base.choices = ['Opción 1', 'Opción 2'];
    if (tipo === 'rating') base.rateMax = 5;
    return base;
};

export const nuevaPagina = (indice) => ({
    name: `pagina_${indice + 1}`,
    title: `Página ${indice + 1}`,
    elements: [],
});

export const definicionVacia = () => ({ pages: [nuevaPagina(0)] });
