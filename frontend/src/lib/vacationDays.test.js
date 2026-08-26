// Correr: node src/lib/vacationDays.test.js
import assert from "node:assert/strict";
import { truncDias } from "./vacationDays.js";

// Trunca, no aproxima: 12.99 no puede convertirse en 13.0.
assert.equal(truncDias(12.99), 12.9);
assert.equal(truncDias(12.29), 12.2);
assert.equal(truncDias(12.9), 12.9);
assert.equal(truncDias(13), 13);

// Casos donde el binario muerde: sin el redondeo previo estos caen un decimal.
assert.equal(truncDias(0.3), 0.3);
assert.equal(truncDias(1.1), 1.1);
assert.equal(truncDias(8.2), 8.2);

// Entradas basura desde el input o desde la API.
assert.equal(truncDias(undefined), 0);
assert.equal(truncDias(null), 0);
assert.equal(truncDias(NaN), 0);
assert.equal(truncDias(""), 0);
assert.equal(truncDias("12.99"), 12.9);

console.log("vacationDays.test.js OK");
