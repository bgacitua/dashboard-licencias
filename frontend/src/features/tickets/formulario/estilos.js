/**
 * Del objeto `tema` del admin a las variables CSS del renderer propio.
 *
 * El renderer es dueño de su DOM, así que no usa los ~1600 tokens `--sjs2-*` de
 * survey-core: le basta un puñado de variables propias con prefijo `--fp-`
 * (formulario propio) que consumen las clases Tailwind del render.
 *
 * Pura: se prueba en estilos.test.js sin navegador.
 */
import { TEMA_DEFECTO } from '../../../components/form-builder/tema.js';

/** Datos del encabezado que el renderer pinta a mano desde el tema. */
export const cabeceraDeTema = (tema, cabecera = {}) => {
    const t = { ...TEMA_DEFECTO, ...(tema || {}) };
    const banda = t.encabezado === 'color' || (t.encabezado === 'imagen' && !!t.encabezadoImagen);
    return {
        banda,
        imagen: banda && t.encabezado === 'imagen' ? t.encabezadoImagen : '',
        logo: t.logo || '',
        // sinTitulo oculta título y descripción cuando la imagen del encabezado
        // ya los trae escritos (mismo contrato que en construirTema).
        titulo: t.sinTitulo ? '' : (cabecera.titulo ?? ''),
        descripcion: t.sinTitulo ? '' : (cabecera.descripcion ?? ''),
    };
};

/** Variables CSS `--fp-*` para el contenedor del formulario. */
export const estilosDeTema = (tema) => {
    const t = { ...TEMA_DEFECTO, ...(tema || {}) };
    return {
        '--fp-marca': t.color,
        '--fp-fondo': t.fondo,
        '--fp-radio': `${Number(t.esquinas) || 0}px`,
    };
};
