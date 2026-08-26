// Correr: node src/lib/descuentos.test.js
import assert from "node:assert/strict";
import { sufijoCuotas } from "./descuentos.js";

assert.equal(sufijoCuotas(3), " (3 cuotas)");
assert.equal(sufijoCuotas(12), " (12 cuotas)");

// Singular: "1 cuotas" queda mal en un documento que firma el trabajador.
assert.equal(sufijoCuotas(1), " (1 cuota)");

// El campo del formulario guarda strings, y admite quedar vacío mientras se escribe.
assert.equal(sufijoCuotas("3"), " (3 cuotas)");
assert.equal(sufijoCuotas(""), "");
assert.equal(sufijoCuotas(undefined), "");
assert.equal(sufijoCuotas(null), "");
assert.equal(sufijoCuotas(0), "");
assert.equal(sufijoCuotas(-2), "");
assert.equal(sufijoCuotas("abc"), "");

console.log("descuentos.test.js OK");
