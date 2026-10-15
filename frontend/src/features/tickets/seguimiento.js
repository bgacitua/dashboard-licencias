/**
 * El recorrido de una solicitud, armado como línea de tiempo.
 *
 * Va aparte del componente para poder probarlo con `node`: la vista solo pinta
 * lo que sale de acá.
 */

/** Cuándo ocurrió un hito, en corto: '13 oct · 09:12'. La fecha larga de
 *  `fechaHora` no cabe en la columna del portal, que es angosta. El año solo
 *  aparece si no es el de hoy: una solicitud vive días, no años, pero el
 *  historial viejo no puede quedar ambiguo. */
export const momento = (iso, hoy = new Date()) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const opciones = { day: '2-digit', month: 'short' };
    if (d.getFullYear() !== hoy.getFullYear()) opciones.year = 'numeric';
    // es-CL arma '13-oct' sin año y '13 oct 2025' con él; el guion sobra.
    const dia = d.toLocaleDateString('es-CL', opciones).replace('-', ' ');
    const hora = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${dia} · ${hora}`;
};

/** Cómo se lee cada cambio de estado en la línea de tiempo. No son las
 *  etiquetas de `ESTADOS`: esas rotulan un filtro del panel ("Cancelado") y acá
 *  se está contando qué le pasó a la solicitud ("Cancelada"). */
export const TITULOS = {
    pendiente: 'Vuelta a la cola',
    en_curso: 'En curso',
    en_revision: 'Cambio en revisión',
    cancelado: 'Cancelada',
    rechazado: 'Rechazada',
    cerrado: 'Cerrada',
};

/** Qué se promete en los hitos que todavía no ocurren. Van en gris y sin fecha:
 *  el que mira tiene que ver lo que falta sin tener que preguntarlo. */
const PENDIENTES = {
    en_curso: 'Cuando Administración la tome',
    cerrado: 'El día del servicio',
};

/** Estados que terminan el recorrido: después de uno de ellos no queda nada
 *  por venir. */
const TERMINALES = ['cerrado', 'rechazado', 'cancelado'];

/** Quién hizo algo, dicho para el que está mirando. El portal ya recibe
 *  "Administración" en lugar del username de la plataforma; el ternario es por
 *  si alguna vez llega el nombre real. */
const autorDe = (ev, lado) => {
    if (ev.es_admin) return lado === 'admin' ? ev.autor : 'Administración';
    return lado === 'admin' ? ev.autor : 'por ti';
};

const deEvento = (ev, lado) => ({
    clave: ev.estado_nuevo,
    titulo: ev.estado_nuevo ? (TITULOS[ev.estado_nuevo] || ev.estado_nuevo) : ev.texto,
    // Con cambio de estado el texto es el comentario que lo acompaña. Sin él,
    // el texto ya está haciendo de título y repetirlo sobraría.
    texto: ev.estado_nuevo ? ev.texto : null,
    cuando: ev.created_at,
    autor: autorDe(ev, lado),
    hecho: true,
});

/**
 * Los hitos de una solicitud en el orden en que ocurrieron y, al final, los que
 * faltan. Los cumplidos traen `cuando` y `autor`; los pendientes, `pista`.
 *
 * `lado`: 'usuario' para el portal (el solicitante es quien mira, así que sus
 * propios actos se cuentan como "por ti") o 'admin' para el panel.
 */
export function hitos(ticket, lado = 'usuario') {
    const eventos = ticket?.eventos || [];
    const ultimo = eventos[eventos.length - 1];

    // Crear no deja evento: el ticket es su propio registro de que se envió, y
    // de ahí sale la fecha.
    const linea = [{
        clave: 'enviada',
        titulo: 'Enviada',
        cuando: ticket?.created_at,
        autor: lado === 'admin' ? (ticket?.usuario || 'El solicitante') : 'por ti',
        hecho: true,
    }];
    for (const ev of eventos) linea.push(deEvento(ev, lado));

    const tiene = (clave) => linea.some((h) => h.clave === clave);

    // Resolver una solicitud de cambio devuelve el ticket a 'en_curso' sin
    // anotar el estado: lo único que queda es el comentario que la resuelve,
    // escrito en el mismo instante. De ahí sale la hora de este hito.
    if (ticket?.estado === 'en_curso' && !tiene('en_curso') && ultimo) {
        linea.push({
            clave: 'en_curso',
            titulo: TITULOS.en_curso,
            cuando: ultimo.created_at,
            autor: autorDe(ultimo, lado),
            hecho: true,
        });
    }

    // Lo que todavía falta del recorrido. Terminada la solicitud no se dibuja
    // nada más, ni siquiera el paso por el que nunca llegó a pasar.
    if (!TERMINALES.includes(ticket?.estado)) {
        if (!tiene('en_curso')) {
            linea.push({ clave: 'en_curso', titulo: TITULOS.en_curso, pista: PENDIENTES.en_curso });
        }
        // Sin condición: reabrir una solicitud cerrada deja el hito viejo arriba
        // y vuelve a dejar pendiente el cierre, que es justo lo que pasó.
        linea.push({ clave: 'cerrado', titulo: TITULOS.cerrado, pista: PENDIENTES.cerrado });
    }
    return linea;
}
