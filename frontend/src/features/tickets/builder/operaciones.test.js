// Correr: node src/features/tickets/builder/operaciones.test.js
import assert from 'node:assert/strict';

import {
    agregarSeccion, cambiarTipo, duplicar, eliminar, eliminarSeccion, insertar, mover, ubicar,
} from './operaciones.js';

const q = (name, extra = {}) => ({ type: 'text', name, title: name, ...extra });
const def = () => ({
    pages: [
        { name: 'p1', elements: [q('a'), q('b'), q('c')] },
        { name: 'p2', elements: [q('d')] },
    ],
});
const nombres = (d) => d.pages.map((p) => p.elements.map((e) => e.name));

// insertar: después de la seleccionada, o al final de la última sección.
assert.deepEqual(nombres(insertar(def(), q('x'), 'a')), [['a', 'x', 'b', 'c'], ['d']]);
assert.deepEqual(nombres(insertar(def(), q('x'))), [['a', 'b', 'c'], ['d', 'x']]);
assert.deepEqual(nombres(insertar(def(), q('x'), 'no-existe')), [['a', 'b', 'c'], ['d', 'x']]);
// Sin páginas, crea una en vez de reventar.
assert.deepEqual(nombres(insertar({ pages: [] }, q('x'))), [['x']]);

// No muta la definición original.
const original = def();
insertar(original, q('x'), 'a');
assert.deepEqual(nombres(original), [['a', 'b', 'c'], ['d']]);

// eliminar limpia las condiciones que apuntaban a la borrada.
const conRegla = { pages: [{ name: 'p', elements: [q('a'), q('b', { visibleIf: "{a} = 'si'" }), q('c', { visibleIf: "{b} notempty" })] }] };
const sinA = eliminar(conRegla, 'a');
assert.deepEqual(nombres(sinA), [['b', 'c']]);
assert.equal(sinA.pages[0].elements[0].visibleIf, undefined);
assert.equal(sinA.pages[0].elements[1].visibleIf, '{b} notempty'); // la que no dependía queda

// duplicar: debajo, con nombre distinto y copia profunda.
const conOpciones = { pages: [{ name: 'p', elements: [{ type: 'radiogroup', name: 'r', choices: ['A', 'B'] }] }] };
const dup = duplicar(conOpciones, 'r');
assert.equal(dup.def.pages[0].elements.length, 2);
assert.notEqual(dup.nombre, 'r');
dup.def.pages[0].elements[1].choices.push('C');
assert.deepEqual(dup.def.pages[0].elements[0].choices, ['A', 'B']);

// mover dentro de la sección.
assert.deepEqual(nombres(mover(def(), 0, 0, 2)), [['b', 'c', 'a'], ['d']]);

// agregarSeccion parte la sección en la pregunta, como Forms.
assert.deepEqual(nombres(agregarSeccion(def(), 'a')), [['a'], ['b', 'c'], ['d']]);
assert.deepEqual(nombres(agregarSeccion(def())), [['a', 'b', 'c'], ['d'], []]);

// eliminarSeccion no pierde preguntas.
assert.deepEqual(nombres(eliminarSeccion(def(), 1)), [['a', 'b', 'c', 'd']]);
assert.deepEqual(nombres(eliminarSeccion(def(), 0)), [['a', 'b', 'c', 'd']]);
assert.deepEqual(nombres(eliminarSeccion({ pages: [{ name: 'p', elements: [q('a')] }] }, 0)), [['a']]);

// cambiarTipo conserva nombre, enunciado y opciones entre tipos de selección.
const radio = { type: 'radiogroup', name: 'menu', title: '¿Menú?', isRequired: true, choices: ['A', 'B'], visibleIf: "{x} = '1'" };
const aCheck = cambiarTipo(radio, 'checkbox');
assert.equal(aCheck.type, 'checkbox');
assert.equal(aCheck.name, 'menu');
assert.equal(aCheck.title, '¿Menú?');
assert.equal(aCheck.isRequired, true);
assert.equal(aCheck.visibleIf, "{x} = '1'");
assert.deepEqual(aCheck.choices, ['A', 'B']);

const aImagen = cambiarTipo(radio, 'imagepicker');
assert.deepEqual(aImagen.choices[0], { value: 'A', text: 'A', imageLink: '' });
assert.deepEqual(cambiarTipo(aImagen, 'dropdown').choices, ['A', 'B']);

// A número: queda text + inputType, sin opciones colgando.
const aNumero = cambiarTipo(radio, 'numero');
assert.equal(aNumero.type, 'text');
assert.equal(aNumero.inputType, 'number');
assert.equal(aNumero.choices, undefined);
// Y de vuelta a texto corto pierde el inputType.
assert.equal(cambiarTipo(aNumero, 'text').inputType, undefined);

assert.deepEqual(ubicar(def(), 'd'), { pi: 1, ei: 0 });
assert.equal(ubicar(def(), 'zz'), null);

console.log('operaciones.test.js OK');
