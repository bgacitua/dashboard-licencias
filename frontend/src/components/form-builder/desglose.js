/**
 * El desglose de un servicio: lo que el administrador escribe entre paréntesis
 * al final del nombre, separado por ';'.
 *
 *     "Coffee break (café; galletas; jugo)"
 *       -> { titulo: 'Coffee break', partes: ['café', 'galletas', 'jugo'] }
 *
 * Va aparte de la vista porque lo usan cuatro superficies —el formulario del
 * portal, su vista previa en el panel, el resumen vivo y el detalle de una
 * solicitud— y porque así lo corre `node`.
 *
 * Vive acá y no en features/tickets por la misma razón que servicios.js: lo
 * necesita `crearModelo`, y components/ no importa de features/.
 */
import { escaparHtml } from './tipos.js';

/**
 * Separa el título del desglose. Sin desglose, `partes` queda vacío y `titulo`
 * es el texto tal cual: quien dibuja no tiene que saber si hubo o no.
 *
 * Es deliberadamente conservador. Un nombre que ya existe no puede cambiar de
 * aspecto por accidente, así que ante la duda se devuelve intacto.
 */
export function desglosar(texto) {
    const limpio = `${texto ?? ''}`.trim();
    // El paréntesis tiene que cerrar la cadena y no puede traer otro adentro:
    // "Coffee (a; b) extra" y "Coffee (café (grande); té)" quedan intactos.
    // El `.*\S` de adelante exige un título: "(café; té)" suelto dejaría una
    // opción sin rótulo.
    const m = /^(.*\S)\s*\(([^()]*)\)$/.exec(limpio);
    // Sin ';' adentro no es una lista sino una aclaración —"Arriendo sala
    // (sala grande)"— y convertirla en tarjetas cambiaría nombres ya escritos.
    if (!m || !m[2].includes(';')) return { titulo: limpio, partes: [] };
    const partes = m[2].split(';').map((p) => p.trim()).filter(Boolean);
    // "(;)" no deja nada útil. Antes de hacer desaparecer lo que el admin
    // escribió, se devuelve el nombre entero.
    return partes.length ? { titulo: m[1].trim(), partes } : { titulo: limpio, partes: [] };
}

/** Solo el título, para donde no caben tarjetas: una celda de tabla o un diff. */
export const tituloDe = (texto) => desglosar(texto).titulo;

// Estilos en línea y relativos: este HTML vive dentro del DOM de survey-core,
// que no se tematiza con Tailwind sino con las variables --sjs2-*. `em` y
// `currentColor` hacen que las tarjetas sigan el tamaño y el color del texto
// de la opción, sea cual sea el tema que eligió el admin.
const FILA = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px';
const TARJETA = 'border:1px solid currentColor;opacity:.7'
    + ';border-radius:calc(var(--sjs2-base-unit-radius, 4px) * .75)'
    + ';padding:1px 8px;font-size:.8em;line-height:1.7';

/**
 * El desglose como HTML para el texto de una opción de survey-core, o `null`
 * si ese texto no trae desglose.
 *
 * `null` es parte del contrato: quien engancha esto no debe tocar
 * `options.html` cuando no hay nada que dibujar. Asignarlo deja ese texto en
 * la rama innerHTML de survey-core para siempre, y no hay por qué pagarlo en
 * todas las opciones del formulario.
 *
 * Todo con `<span>` y nada interactivo: survey-react-ui pinta el texto de una
 * opción dentro de un `<span>` que va dentro del `<label>` del radio
 * (`SurveyLocStringViewer.renderString`). Un `<div>` ahí es marcado inválido,
 * y un `<button>` o un `tabindex` romperían la tabulación del grupo.
 */
export function htmlDeDesglose(texto) {
    const { titulo, partes } = desglosar(texto);
    if (!partes.length) return null;
    const tarjetas = partes.map((p) => `<span style="${TARJETA}">${escaparHtml(p)}</span>`).join('');
    return `<span style="display:block">${escaparHtml(titulo)}</span>`
        + `<span style="${FILA}">${tarjetas}</span>`;
}
