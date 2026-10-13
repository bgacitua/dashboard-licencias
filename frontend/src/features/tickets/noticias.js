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

// Self-check: `node src/features/tickets/noticias.js` (lo corre `npm test`).
if (process.argv?.[1]?.endsWith('noticias.js')) {
    const assert = await import('node:assert/strict').then((m) => m.default);
    // El carrusel pinta `texto` y usa `titulo` solo si está: una noticia sin
    // texto saldría como una tarjeta en blanco.
    for (const n of NOTICIAS) {
        assert.equal(typeof n.texto, 'string');
        assert.ok(n.texto.trim(), 'cada noticia necesita texto');
        if ('titulo' in n) assert.equal(typeof n.titulo, 'string');
    }
    // Los puntos de navegación usan `texto` como key de React.
    assert.equal(new Set(NOTICIAS.map((n) => n.texto)).size, NOTICIAS.length);
    assert.ok(INTERVALO_MS >= 1000, 'un intervalo corto hace ilegible el carrusel');
    console.log('noticias: ok');
}
