/**
 * Apariencia de un formulario: de un objeto chico que edita el admin al ITheme
 * de survey-core.
 *
 * El admin no ve los ~1600 tokens de survey-core, ve cinco perillas. Todos los
 * colores de marca de survey-core derivan de --sjs2-color-project-brand-600,
 * así que un solo color alcanza para teñir botones, focos y selección.
 */
import { BaseTheme, Model } from 'survey-core';
import { DefaultLight } from 'survey-core/themes';

export const TEMA_DEFECTO = {
    color: '#2563eb',
    fondo: '#f3f4f6',
    esquinas: 8,
    // simple = título sobre el fondo; color = banda del color de marca;
    // imagen = banda con la imagen de encabezado.
    encabezado: 'color',
    encabezadoImagen: '',
    fondoImagen: '',
    logo: '',
    sinPaneles: false,
};

/** Objeto del admin -> ITheme. Pura: se prueba en tema.test.js. */
export const construirTema = (tema) => {
    const t = { ...TEMA_DEFECTO, ...(tema || {}) };
    const vars = {
        '--sjs2-color-project-brand-600': t.color,
        '--sjs2-color-utility-body': t.fondo,
        '--sjs2-base-unit-radius': `${Number(t.esquinas) || 0}px`,
    };
    const banda = t.encabezado === 'color' || (t.encabezado === 'imagen' && t.encabezadoImagen);
    if (banda) {
        // Texto blanco sobre la banda; sin esto el título queda gris sobre azul.
        vars['--sjs2-color-component-survey-header-default-title'] = '#ffffff';
        vars['--sjs2-color-component-survey-header-default-description'] = 'rgba(255,255,255,0.85)';
    }
    return {
        ...DefaultLight,
        isPanelless: !!t.sinPaneles,
        backgroundImage: t.fondoImagen || undefined,
        backgroundImageFit: 'cover',
        backgroundImageAttachment: 'fixed',
        backgroundOpacity: 1,
        headerView: banda ? 'advanced' : 'basic',
        header: banda
            ? {
                height: t.encabezado === 'imagen' ? 260 : 180,
                mobileHeight: 140,
                inheritWidthFrom: 'container',
                textAreaWidth: 560,
                overlapEnabled: true,
                backgroundImage: t.encabezado === 'imagen' ? t.encabezadoImagen : undefined,
                backgroundImageFit: 'cover',
                backgroundImageOpacity: 1,
                logoPositionX: 'right',
                logoPositionY: 'top',
                titlePositionX: 'left',
                titlePositionY: 'bottom',
                descriptionPositionX: 'left',
                descriptionPositionY: 'bottom',
            }
            : undefined,
        cssVariables: {
            ...DefaultLight.cssVariables,
            ...vars,
            // La banda de color es el fondo del header avanzado.
            ...(t.encabezado === 'color' ? { '--sjs2-color-component-survey-header-default-bg': t.color } : {}),
        },
    };
};

/**
 * Modelo listo para renderizar, igual en el portal, la vista previa y el panel.
 * `cabecera` = { titulo, descripcion } va al header de survey-core.
 */
export const crearModelo = (definicion, tema, cabecera = {}) => {
    const t = { ...TEMA_DEFECTO, ...(tema || {}) };
    const m = new Model({
        ...definicion,
        title: cabecera.titulo ?? definicion.title,
        description: cabecera.descripcion ?? definicion.description,
        logo: t.logo || undefined,
        logoFit: 'contain',
        logoHeight: '56px',
        logoWidth: 'auto',
        showQuestionNumbers: false,
    });
    m.locale = 'es';
    // BaseTheme obligatorio: DefaultLight es un delta vacío en v3 (ver tema.test.js).
    m.applyTheme(construirTema(tema), BaseTheme);
    // fitToContainer es true por defecto en v3 y fija height 100% con scroll
    // propio: dentro de un contenedor sin altura reserva una caja vacía.
    m.fitToContainer = false;
    return m;
};
