/**
 * Chequeo: el desglose entre paréntesis del nombre de un servicio.
 *
 * Ejecutar:  node src/features/tickets/desglose.test.mjs
 *
 * Cada caso borde tiene su assert a propósito: casi todos tienen una respuesta
 * discutible, y quiero que la fije esto y no la implementación del momento.
 */
import assert from 'node:assert/strict';

import { desglosar, htmlDeDesglose, tituloDe } from './desglose.js';

/** Lo normal: título y tarjetas. */
{
    const r = desglosar('Coffee break (café; galletas; jugo)');
    assert.equal(r.titulo, 'Coffee break');
    assert.deepEqual(r.partes, ['café', 'galletas', 'jugo']);
}

// Un solo ';' basta: es la puerta para una sola tarjeta.
assert.deepEqual(desglosar('Coffee break (café;)').partes, ['café']);

/** Todo lo que tiene que quedar intacto. `partes` vacío y el texto sin tocar. */
const INTACTOS = [
    ['Coffee break', 'sin paréntesis no hay nada que partir'],
    ['Coffee break (grande)', 'hay paréntesis pero no ";": es una aclaración, no una lista'],
    ['Coffee; té', 'el ";" está fuera del paréntesis'],
    ['Coffee (a; b) extra', 'el paréntesis no cierra la cadena'],
    ['Coffee (café (grande); té)', 'paréntesis anidado'],
    ['Coffee (café; té', 'paréntesis sin cerrar'],
    ['Coffee ) (a; b', 'cierre suelto y apertura sin cerrar'],
    ['(café; té)', 'sin título quedaría una opción sin rótulo'],
    ['Coffee (;)', 'no sobrevive ninguna parte: no se hace desaparecer lo escrito'],
    ['Coffee （café; té）', 'paréntesis de ancho completo, no son los ASCII'],
];
for (const [entrada, porque] of INTACTOS) {
    const r = desglosar(entrada);
    assert.deepEqual(r.partes, [], `${entrada} — ${porque}`);
    assert.equal(r.titulo, entrada, `${entrada} — el texto vuelve tal cual`);
}

// Varios paréntesis: parte por el último, que es el que cierra la cadena.
{
    const r = desglosar('Box (A) (café; té)');
    assert.equal(r.titulo, 'Box (A)');
    assert.deepEqual(r.partes, ['café', 'té']);
}

// Partes vacías descartadas: una tarjeta en blanco no dice nada.
assert.deepEqual(desglosar('Coffee (café;;té)').partes, ['café', 'té']);
assert.deepEqual(desglosar('Coffee (café; té;)').partes, ['café', 'té']);

// Espacios recortados a los dos lados.
{
    const r = desglosar('  Coffee   (  café ;  té  )  ');
    assert.equal(r.titulo, 'Coffee');
    assert.deepEqual(r.partes, ['café', 'té']);
}

// El texto del admin puede traer HTML y '&'. Acá viaja crudo: el escape es de
// quien lo inyecta en el DOM, y tiene que ver el original para escaparlo bien.
{
    const r = desglosar('Café & té <b>x</b> (a&b; "c")');
    assert.equal(r.titulo, 'Café & té <b>x</b>');
    assert.deepEqual(r.partes, ['a&b', '"c"']);
}

// Lo que no es string no puede tirar: `textoDeOpcion` puede entregar un value.
for (const v of [undefined, null, 12, true]) {
    assert.doesNotThrow(() => desglosar(v), `desglosar(${String(v)})`);
    assert.deepEqual(desglosar(v).partes, []);
}
assert.equal(desglosar(undefined).titulo, '');
assert.equal(desglosar(12).titulo, '12');

// Idempotente: volver a pasar el título no lo sigue recortando.
for (const entrada of ['Coffee break (café; té)', 'Box (A) (café; té)', 'Arriendo (sala grande)']) {
    const una = tituloDe(entrada);
    assert.equal(tituloDe(una), una, `${entrada} — segunda pasada`);
}

// tituloDe es el atajo para donde no caben tarjetas.
assert.equal(tituloDe('Coffee break (café; galletas)'), 'Coffee break');
assert.equal(tituloDe('Arriendo sala (sala grande)'), 'Arriendo sala (sala grande)');

// Un nombre en el tope de la columna (VARCHAR(160)) no se rompe.
{
    const largo = `${'x'.repeat(150)} (a; b)`;
    assert.deepEqual(desglosar(largo).partes, ['a', 'b']);
}

// === htmlDeDesglose ===

// Sin desglose devuelve null, y eso es contrato: quien engancha esto no debe
// tocar options.html, o survey-core deja ese texto en la rama innerHTML para
// siempre.
for (const [entrada] of INTACTOS) {
    assert.equal(htmlDeDesglose(entrada), null, `${entrada} — sin desglose no hay HTML`);
}
assert.equal(htmlDeDesglose(undefined), null);

// Con desglose: el título en su propia línea y una tarjeta por parte.
{
    const html = htmlDeDesglose('Coffee break (café; galletas)');
    assert.ok(html.includes('>Coffee break<'), 'el título va en el HTML');
    assert.ok(html.includes('>café<') && html.includes('>galletas<'), 'una tarjeta por parte');
    // Dentro del <label> del radio solo caben elementos inline.
    assert.ok(!/<(div|ul|li|p)\b/i.test(html), 'nada de bloque: el contenedor es un <span>');
    // Nada interactivo: rompería la tabulación del grupo de radios.
    assert.ok(!/<(button|a|input)\b|tabindex/i.test(html), 'nada interactivo dentro del label');
}

// El escape es lo único que separa esto de un XSS: el nombre lo escribe un
// admin y el backend solo valida el largo.
{
    // Sin paréntesis en el payload: los anidados ni siquiera pasan el parser.
    const html = htmlDeDesglose('Café & té (<script>robar</script>; "x")');
    assert.ok(!html.includes('<script>'), 'la etiqueta no sobrevive');
    assert.ok(html.includes('&lt;script&gt;'), 'queda escapada');
    assert.ok(html.includes('Café'), 'el acento no se toca');
    assert.ok(html.includes('&amp;'), 'el & del título también se escapa');
    assert.ok(html.includes('&quot;x&quot;'), 'las comillas se escapan: los atributos van en dobles');
}

// Un '&' crudo —lo que un admin escribe de verdad— se escapa una sola vez.
assert.ok(htmlDeDesglose('X (a&b; c)').includes('a&amp;b'),
    'el & se escapa una vez y no se interpreta lo que el admin escribió');

// El ';' es el separador, así que una parte no puede contener uno. Una entidad
// HTML escrita a mano ('&amp;') se parte en dos, y es inevitable: queda fijado
// acá para que nadie lo lea como un bug del escape.
assert.deepEqual(desglosar('X (a&amp;b; c)').partes, ['a&amp', 'b', 'c']);

console.log('desglose: ok');
