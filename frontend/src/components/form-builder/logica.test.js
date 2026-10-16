// Correr: node src/components/form-builder/logica.test.js
import assert from "node:assert/strict";

import { operadorPorDefecto, parsear, preguntaDeEntrada, serializar } from "./logica.js";

const def = {
    pages: [{
        elements: [
            { type: "html", name: "h" },
            { type: "text", name: "nombre" },
            { type: "radiogroup", name: "servicio", choices: ["Coffee", "Almuerzo"] },
            { type: "dropdown", name: "otro", choices: ["a"] },
        ],
    }],
};

// La entrada es la primera de selección: salta html y text, toma el radiogroup.
assert.equal(preguntaDeEntrada(def).name, "servicio");

// Sin preguntas de selección no hay entrada.
assert.equal(preguntaDeEntrada({ pages: [{ elements: [{ type: "text", name: "t" }] }] }), null);
assert.equal(preguntaDeEntrada(undefined), null);

// Asignar un camino = {entrada} = 'valor', y "Todos" (sin valor) lo borra.
const entrada = preguntaDeEntrada(def);
const vi = serializar({ pregunta: entrada.name, operador: operadorPorDefecto(entrada), valor: "Almuerzo" });
assert.equal(vi, "{servicio} = 'Almuerzo'");
assert.deepEqual(parsear(vi), { pregunta: "servicio", operador: "=", valor: "Almuerzo" });
assert.equal(serializar({ pregunta: entrada.name, operador: "=", valor: "" }), "{servicio} = ''");

console.log("logica: ok");
