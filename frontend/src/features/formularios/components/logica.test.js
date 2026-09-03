// Correr: node src/features/formularios/components/logica.test.js
import assert from "node:assert/strict";
import { Model } from "survey-core";

import { operadorPorDefecto, operadoresPara, parsear, serializar } from "./logica.js";

/** Arma un formulario de dos preguntas y responde la primera. */
const visible = (tipoOrigen, respuesta, visibleIf) => {
    const m = new Model({
        pages: [
            { elements: [{ type: tipoOrigen, name: "q1", choices: ["Opción 1", "Opción 2", "O'Higgins"] }] },
            { elements: [{ type: "text", name: "q2", visibleIf }] },
        ],
    });
    m.data = { q1: respuesta };
    return m.getQuestionByName("q2").isVisible;
};

const regla = (operador, valor) => serializar({ pregunta: "q1", operador, valor });

// Selección única: la respuesta es un escalar y `=` compara bien.
assert.equal(visible("radiogroup", "Opción 1", regla("=", "Opción 1")), true);
assert.equal(visible("radiogroup", "Opción 2", regla("=", "Opción 1")), false);

// Selección múltiple: la respuesta es un array. `=` nunca sería verdadero, por
// eso el panel no lo ofrece para estos tipos y la pertenencia va con contains.
assert.equal(visible("checkbox", ["Opción 1"], regla("contains", "Opción 1")), true);
assert.equal(visible("checkbox", ["Opción 2"], regla("contains", "Opción 1")), false);
assert.equal(visible("checkbox", ["Opción 2"], regla("notcontains", "Opción 1")), true);

assert.ok(!operadoresPara("checkbox").some((o) => o.key === "="));
assert.ok(operadoresPara("radiogroup").some((o) => o.key === "="));
assert.equal(operadorPorDefecto("checkbox"), "contains");
assert.equal(operadorPorDefecto("radiogroup"), "=");

// Un apóstrofo sin escapar rompe la expresión, y una expresión rota se evalúa
// como visible: el campo que debía esconderse aparece.
assert.equal(visible("radiogroup", "O'Higgins", regla("=", "O'Higgins")), true);
assert.equal(visible("radiogroup", "Opción 1", regla("=", "O'Higgins")), false);

// Ida y vuelta: lo que se guarda es lo que el panel vuelve a mostrar.
for (const [operador, valor] of [["=", "Opción 1"], ["contains", "O'Higgins"], ["notcontains", "x"]]) {
    assert.deepEqual(parsear(regla(operador, valor)), { pregunta: "q1", operador, valor });
}
assert.deepEqual(parsear(regla("notempty")), { pregunta: "q1", operador: "notempty", valor: "" });
assert.equal(parsear(undefined), null);
assert.equal(serializar({ pregunta: "", operador: "=", valor: "x" }), undefined);

console.log("logica.test.js OK");
