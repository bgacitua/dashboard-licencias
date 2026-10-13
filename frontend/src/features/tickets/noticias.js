/**
 * Noticias y recomendaciones que rotan en la pantalla de acuse, cuando el
 * usuario termina de enviar una solicitud.
 *
 * Editar esta lista es toda la configuración: cada elemento es un mensaje.
 * `titulo` es opcional. Lista vacía = no se muestra el carrusel.
 */
export const NOTICIAS = [
    {
        titulo: 'Gracias por tu solicitud',
        texto: 'La revisamos en orden de llegada y te avisamos por correo cuando quede gestionada.',
    },
    {
        titulo: 'Pide con anticipación',
        texto: 'Las solicitudes enviadas con un día de anticipación se alcanzan a preparar con calma.',
    },
    {
        titulo: '¿Necesitas cambiar algo?',
        texto: 'Mientras el plazo no venza puedes pedir un cambio desde "Mis solicitudes".',
    },
];

/** Milisegundos que queda visible cada mensaje. */
export const INTERVALO_MS = 6000;
