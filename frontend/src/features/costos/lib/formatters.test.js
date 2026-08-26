// Correr: node src/features/costos/lib/formatters.test.js
import assert from "node:assert/strict";
import { formatMoneda, formatMonedaCompact, formatPct, formatMesAbrev } from "./formatters.js";

// Cada país en su moneda. Se comparan los dígitos y el símbolo por separado
// porque el separador de miles varía según la versión de ICU.
const soloDigitos = (s) => s.replace(/\D/g, "");

assert.equal(soloDigitos(formatMoneda(1234567, "chile")), "1234567");
assert.match(formatMoneda(1234567, "chile"), /\$/);
assert.equal(soloDigitos(formatMoneda(1234567, "peru")), "1234567");
assert.match(formatMoneda(1234567, "peru"), /S\/|PEN/);

// Sin país explícito se asume Chile (retrocompatibilidad del módulo).
assert.equal(formatMoneda(1000), formatMoneda(1000, "chile"));

// Nulos y NaN no revientan la tabla.
for (const v of [null, undefined, NaN]) {
  assert.equal(formatMoneda(v, "peru"), "—");
  assert.equal(formatMonedaCompact(v, "peru"), "—");
}

// Compacto: símbolo del país, no "$" fijo.
assert.equal(formatMonedaCompact(1_500_000, "chile"), "$1.5M");
assert.equal(formatMonedaCompact(1_500_000, "peru"), "S/ 1.5M");
assert.equal(formatMonedaCompact(2_400_000_000, "peru"), "S/ 2.4MM");
assert.equal(formatMonedaCompact(12_000, "peru"), "S/ 12K");
assert.equal(formatMonedaCompact(-999, "chile"), "$-999");

assert.equal(formatPct(3.14159), "+3.1%");
assert.equal(formatPct(null), "—");
assert.equal(formatMesAbrev("2026-06-01"), "jun-26");

console.log("formatters: todo verde");
