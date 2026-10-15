/**
 * Chequeo: la línea de tiempo del seguimiento.
 *
 * Ejecutar:  node src/features/tickets/seguimiento.test.mjs
 */
import assert from 'node:assert/strict';

import { TITULOS, hitos, momento } from './seguimiento.js';

const ev = (estado_nuevo, texto, es_admin = true, created_at = '2026-10-14T16:00:00Z') =>
    ({ estado_nuevo, texto, es_admin, autor: es_admin ? 'jperez' : 'Ana Soto', created_at });

const titulos = (linea) => linea.map((h) => h.titulo);
const claves = (linea) => linea.map((h) => h.clave);

// Recién enviada: el hito de envío sale del ticket (crear no deja evento) y
// los dos que faltan van en gris, con su pista y sin fecha.
{
    const linea = hitos({ estado: 'pendiente', created_at: '2026-10-13T09:12:00Z', eventos: [] });
    assert.deepEqual(claves(linea), ['enviada', 'en_curso', 'cerrado']);
    assert.equal(linea[0].hecho, true);
    assert.equal(linea[0].autor, 'por ti');
    assert.equal(linea[1].hecho, undefined);
    assert.ok(linea[1].pista, 'un hito pendiente tiene que explicar qué falta');
    assert.equal(linea[1].cuando, undefined, 'lo que no ocurrió no lleva fecha');
}

// En el panel, el que envió es el solicitante con nombre y apellido, no "por ti".
{
    const linea = hitos({ estado: 'pendiente', created_at: '2026-10-13T09:12:00Z', usuario: 'Ana Soto', eventos: [] }, 'admin');
    assert.equal(linea[0].autor, 'Ana Soto');
}

// Un cambio de estado se lee como hito cumplido y su comentario queda debajo,
// sin reemplazar el título.
{
    const linea = hitos({
        estado: 'rechazado', created_at: '2026-10-13T09:12:00Z',
        eventos: [ev('rechazado', 'Fuera de plazo')],
    });
    assert.deepEqual(titulos(linea), ['Enviada', 'Rechazada']);
    assert.equal(linea[1].texto, 'Fuera de plazo');
    assert.equal(linea[1].autor, 'Administración', 'el portal no ve el username de la plataforma');
}

// Terminada la solicitud no se promete nada más: ni siquiera el paso por el que
// nunca llegó a pasar.
for (const estado of ['cerrado', 'rechazado', 'cancelado']) {
    const linea = hitos({ estado, created_at: '2026-10-13T09:12:00Z', eventos: [ev(estado, null)] });
    assert.ok(!linea.some((h) => h.pista), `${estado} no deja hitos pendientes`);
    assert.equal(linea.length, 2);
}

// Un evento sin cambio de estado (el que resuelve una solicitud de cambio) usa
// su texto de título y no lo repite abajo.
{
    const linea = hitos({
        estado: 'en_curso', created_at: '2026-10-13T09:12:00Z',
        eventos: [ev('en_revision', 'Solicitud de modificación enviada (versión 2).', false),
            ev(null, 'Cambio aprobado (versión 2).')],
    });
    const aprobado = linea.find((h) => h.titulo === 'Cambio aprobado (versión 2).');
    assert.ok(aprobado, 'el comentario suelto es un hito');
    assert.equal(aprobado.texto, null, 'el texto ya es el título');
    // Aprobar devuelve el ticket a 'en_curso' sin anotar el estado: el hito se
    // reconstruye con la hora del comentario que lo resolvió.
    const enCurso = linea.find((h) => h.clave === 'en_curso' && h.hecho);
    assert.ok(enCurso, 'el ticket quedó en curso y la línea tiene que decirlo');
    assert.equal(enCurso.cuando, '2026-10-14T16:00:00Z');
    assert.ok(linea.some((h) => h.clave === 'cerrado' && h.pista), 'todavía falta cerrarla');
}

// Reabrir una solicitud cerrada deja el cierre viejo arriba y vuelve a dejar
// pendiente el nuevo: son dos hitos distintos, no uno sobrescrito.
{
    const linea = hitos({
        estado: 'en_curso', created_at: '2026-10-13T09:12:00Z',
        eventos: [ev('cerrado', null), ev('en_curso', 'Reabierta a pedido del solicitante.')],
    });
    const cierres = linea.filter((h) => h.clave === 'cerrado');
    assert.equal(cierres.length, 2);
    assert.equal(cierres[0].hecho, true);
    assert.equal(cierres[1].hecho, undefined);
}

// Todo estado de la solicitud tiene cómo leerse: un estado sin título caería
// en la línea de tiempo con su nombre interno ('en_revision').
for (const estado of ['pendiente', 'en_curso', 'en_revision', 'cancelado', 'rechazado', 'cerrado']) {
    assert.ok(TITULOS[estado], `falta el título de ${estado}`);
}

// La fecha va en corto para caber en la columna del portal. El año se calla
// mientras sea el de hoy, y aparece cuando el hito es de otro año.
{
    const hoy = new Date('2026-10-15T12:00:00Z');
    assert.equal(momento('2026-10-13T12:12:00Z', hoy), '13 oct · 09:12');
    assert.equal(momento('2025-01-05T12:12:00Z', hoy), '05 ene 2025 · 09:12');
    assert.equal(momento(null, hoy), '—');
    assert.equal(momento('no es una fecha', hoy), '—', 'una fecha rota no puede tirar la vista');
}

console.log('seguimiento: ok');
