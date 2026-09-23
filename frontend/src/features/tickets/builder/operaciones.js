/**
 * Operaciones del lienzo sobre la definición de survey-core.
 *
 * Puras: reciben la definición y devuelven una nueva, sin mutar. Son la parte
 * del builder que puede romper datos (una pregunta perdida, una condición que
 * apunta a nada), así que viven aparte y se prueban en operaciones.test.js.
 *
 * Forma: { pages: [{ name, title, description, elements: [pregunta] }] }.
 * Cada página es una "sección" en el lienzo, como en Forms.
 */
import { TIPOS, TIPOS_CON_OPCIONES, claveTipo, nuevaPagina, nuevaPregunta, nuevoNombre } from '../../../components/form-builder/tipos.js';

const paginas = (def) => (def?.pages?.length ? def.pages : [nuevaPagina(0)]);

/** Dónde está una pregunta: índice de página y de elemento, o null. */
export const ubicar = (def, nombre) => {
    const ps = paginas(def);
    for (let pi = 0; pi < ps.length; pi++) {
        const ei = (ps[pi].elements || []).findIndex((e) => e.name === nombre);
        if (ei >= 0) return { pi, ei };
    }
    return null;
};

const conPaginas = (def, ps) => ({ ...def, pages: ps });

/** Inserta después de `despuesDe`; sin ella (o si no existe), al final de la última sección. */
export const insertar = (def, pregunta, despuesDe = null) => {
    const ps = paginas(def).map((p) => ({ ...p, elements: [...(p.elements || [])] }));
    const donde = despuesDe && ubicar(def, despuesDe);
    if (donde) ps[donde.pi].elements.splice(donde.ei + 1, 0, pregunta);
    else ps[ps.length - 1].elements.push(pregunta);
    return conPaginas(def, ps);
};

export const actualizar = (def, nombre, nueva) =>
    conPaginas(def, paginas(def).map((p) => ({
        ...p, elements: (p.elements || []).map((e) => (e.name === nombre ? nueva : e)),
    })));

/**
 * Elimina la pregunta y limpia las condiciones que dependían de ella. Sin eso,
 * `{borrada} = 'x'` evalúa contra un valor que nunca existe y la pregunta
 * dependiente queda oculta para siempre sin que nadie entienda por qué.
 */
export const eliminar = (def, nombre) => {
    const ref = `{${nombre}}`;
    return conPaginas(def, paginas(def).map((p) => ({
        ...p,
        elements: (p.elements || [])
            .filter((e) => e.name !== nombre)
            .map((e) => {
                if (!e.visibleIf?.includes(ref)) return e;
                const { visibleIf: _, ...resto } = e;
                return resto;
            }),
    })));
};

/** Copia justo debajo, con nombre nuevo: el nombre es la clave de la respuesta. */
export const duplicar = (def, nombre) => {
    const donde = ubicar(def, nombre);
    if (!donde) return { def, nombre: null };
    const original = paginas(def)[donde.pi].elements[donde.ei];
    const copia = { ...structuredClone(original), name: nuevoNombre(claveTipo(original)) };
    return { def: insertar(def, copia, nombre), nombre: copia.name };
};

/** Reordena dentro de una sección. */
export const mover = (def, pi, desde, hasta) =>
    conPaginas(def, paginas(def).map((p, i) => {
        if (i !== pi) return p;
        const els = [...(p.elements || [])];
        const [x] = els.splice(desde, 1);
        els.splice(hasta, 0, x);
        return { ...p, elements: els };
    }));

/**
 * Nueva sección después de la pregunta `despuesDe`, como en Forms: lo que
 * venía debajo de esa pregunta pasa a la sección nueva. Sin pregunta, la
 * sección se agrega vacía al final.
 */
export const agregarSeccion = (def, despuesDe = null) => {
    const ps = paginas(def).map((p) => ({ ...p, elements: [...(p.elements || [])] }));
    // Sin título: el lienzo muestra "Sección sin título" hasta que se escriba uno.
    const nueva = { ...nuevaPagina(ps.length), title: '', name: `pagina_${Date.now().toString(36)}` };
    const donde = despuesDe && ubicar(def, despuesDe);
    if (!donde) return conPaginas(def, [...ps, nueva]);
    nueva.elements = ps[donde.pi].elements.splice(donde.ei + 1);
    ps.splice(donde.pi + 1, 0, nueva);
    return conPaginas(def, ps);
};

/** Quita la sección sin perder preguntas: se juntan con la anterior (o la siguiente, si es la primera). */
export const eliminarSeccion = (def, pi) => {
    const ps = paginas(def).map((p) => ({ ...p, elements: [...(p.elements || [])] }));
    if (ps.length <= 1) return def;
    const [quitada] = ps.splice(pi, 1);
    if (pi > 0) ps[pi - 1].elements.push(...quitada.elements);
    else ps[0].elements.unshift(...quitada.elements);
    return conPaginas(def, ps);
};

export const actualizarSeccion = (def, pi, cambios) =>
    conPaginas(def, paginas(def).map((p, i) => (i === pi ? { ...p, ...cambios } : p)));

const textoOpcion = (c) => (typeof c === 'string' ? c : c.text ?? c.value ?? '');

/**
 * Cambia el tipo conservando lo que tenga sentido: enunciado, ayuda,
 * condición, posición, y las opciones entre tipos de selección. El nombre se
 * mantiene para que las condiciones de otras preguntas sigan apuntando acá.
 */
export const cambiarTipo = (p, clave) => {
    const base = nuevaPregunta(clave);
    const nueva = { ...base, name: p.name };
    for (const k of ['title', 'description', 'visibleIf', 'startWithNewLine']) {
        if (p[k] !== undefined && (k !== 'title' || base.title !== undefined)) nueva[k] = p[k];
    }
    if ('isRequired' in base) nueva.isRequired = !!p.isRequired;

    const eraOpciones = TIPOS_CON_OPCIONES.includes(p.type) || p.type === 'imagepicker';
    if (eraOpciones && p.choices?.length) {
        if (TIPOS_CON_OPCIONES.includes(nueva.type)) nueva.choices = p.choices.map(textoOpcion);
        if (nueva.type === 'imagepicker') {
            nueva.choices = p.choices.map((c) =>
                typeof c === 'string' ? { value: c, text: c, imageLink: '' } : c);
        }
    }
    return nueva;
};

/** Tipos que el lienzo ofrece para cambiar una pregunta (no los que no guardan respuesta). */
export const tiposDePregunta = (excluidos = []) =>
    Object.entries(TIPOS).filter(([k, m]) => !m.sinRespuesta && !excluidos.includes(k));
