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
    numero: {
        label: 'Número',
        base: { type: 'text', inputType: 'number' },
        campos: [
            { key: 'min', label: 'Mínimo', tipo: 'numero' },
            { key: 'max', label: 'Máximo', tipo: 'numero' },
        ],
    },
    fecha: { label: 'Fecha', base: { type: 'text', inputType: 'date' }, campos: [] },
    radiogroup: { label: 'Selección única', campos: [{ key: 'choices', label: 'Opciones', tipo: 'opciones' }] },
    checkbox: { label: 'Selección múltiple', campos: [{ key: 'choices', label: 'Opciones', tipo: 'opciones' }] },
    dropdown: { label: 'Lista desplegable', campos: [{ key: 'choices', label: 'Opciones', tipo: 'opciones' }] },
    imagepicker: {
        label: 'Opciones con imagen',
        conImagenes: true,
        campos: [
            { key: 'choices', label: 'Opciones', tipo: 'opcionesImagen' },
            { key: 'multiSelect', label: 'Permitir elegir varias', tipo: 'booleano' },
            { key: 'imageHeight', label: 'Alto de cada imagen (px)', tipo: 'numero' },
        ],
    },
    boolean: { label: 'Sí / No', campos: [] },
    rating: { label: 'Escala', campos: [{ key: 'rateMax', label: 'Máximo', tipo: 'numero' }] },
    file: { label: 'Archivo', campos: [] },
    image: {
        label: 'Imagen',
        conImagenes: true,
        sinRespuesta: true,
        campos: [
            { key: 'imageLink', label: 'Imagen', tipo: 'imagen' },
            { key: 'imageHeight', label: 'Alto (px)', tipo: 'numero' },
        ],
    },
    html: {
        label: 'Texto informativo',
        sinRespuesta: true,
        campos: [{ key: 'html', label: 'Texto', tipo: 'html' }],
    },
};

export const TIPOS_CON_OPCIONES = ['radiogroup', 'checkbox', 'dropdown'];

/**
 * Clave de TIPOS que corresponde a una pregunta. Número y Fecha son `text` con
 * `inputType` en survey-core, así que el `type` solo no alcanza: gana la
 * entrada con `base` más específica que calce.
 */
export const claveTipo = (p) => {
    const conBase = Object.entries(TIPOS)
        .filter(([, meta]) => meta.base && Object.entries(meta.base).every(([k, v]) => p[k] === v))
        .sort(([, a], [, b]) => Object.keys(b.base).length - Object.keys(a.base).length);
    return conBase[0]?.[0] ?? p.type;
};

let contador = 0;

/** Nombre único de pregunta. Es la clave con la que se guarda la respuesta. */
export const nuevoNombre = (tipo) => `${tipo}_${Date.now().toString(36)}${contador++}`;

export const nuevaPregunta = (clave) => {
    const meta = TIPOS[clave];
    const tipo = meta.base?.type ?? clave;
    const base = { type: tipo, ...meta.base, name: nuevoNombre(clave), title: meta.label, isRequired: false };
    if (TIPOS_CON_OPCIONES.includes(tipo)) base.choices = ['Opción 1', 'Opción 2'];
    if (tipo === 'rating') base.rateMax = 5;
    if (tipo === 'imagepicker') {
        Object.assign(base, { choices: [], showLabel: true, imageFit: 'cover', imageHeight: 150 });
    }
    if (tipo === 'image') {
        Object.assign(base, { imageLink: '', imageFit: 'cover', imageHeight: 240, imageWidth: '100%' });
        delete base.isRequired;
    }
    if (tipo === 'html') {
        Object.assign(base, { html: '' });
        delete base.isRequired;
        delete base.title;
    }
    return base;
};

export const nuevaPagina = (indice) => ({
    name: `pagina_${indice + 1}`,
    title: `Página ${indice + 1}`,
    elements: [],
});

export const definicionVacia = () => ({ pages: [nuevaPagina(0)] });

/**
 * Mensaje de agradecimiento -> `completedHtml` de survey-core.
 *
 * survey-core inyecta ese campo como HTML en una página pública, así que el
 * texto del builder se escapa acá: lo escribe un admin, pero un admin no
 * debería poder meter script en el formulario que ve todo el mundo.
 */
export const aCompletedHtml = (texto) => {
    const limpio = String(texto ?? '').trim();
    if (!limpio) return undefined;
    const escapado = limpio
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>');
    return `<div style="text-align:center;padding:1.5rem 1rem;font-size:1rem">${escapado}</div>`;
};

/**
 * Texto informativo -> `html` de survey-core. Mismo escape que completedHtml:
 * survey-core lo inyecta tal cual en la página que ve el usuario. Se permite
 * solo **negrita** y saltos de línea, que es lo que un aviso necesita.
 */
export const aHtmlInformativo = (texto) => {
    const limpio = String(texto ?? '').trim();
    if (!limpio) return '';
    const escapado = limpio
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
    return `<div style="line-height:1.6">${escapado}</div>`;
};

/** html informativo -> el texto que se edita en el builder. */
export const deHtmlInformativo = (html) =>
    String(html ?? '')
        .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .trim();

/** completedHtml -> el texto plano que se muestra en el builder. */
export const deCompletedHtml = (html) =>
    String(html ?? '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .trim();
