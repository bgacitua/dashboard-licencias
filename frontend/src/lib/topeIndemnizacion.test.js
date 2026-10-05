// Correr: node src/lib/topeIndemnizacion.test.js
import assert from "node:assert/strict";
import {
  calcularIndemnizacionAnosServicio,
  edadEnFecha,
} from "./topeIndemnizacion.js";

const UF = 39000; // tope 90 UF = 3.510.000
const calc = (over) =>
  calcularIndemnizacionAnosServicio({
    yearsOfService: 15,
    yearsForIndemnity: 15,
    totalHaberes: 1_000_000,
    ufValue: UF,
    ...over,
  });

// 1. Necesidades de la empresa: tope de 11 años.
{
  const r = calc({ terminationReason: "necesidades_empresa" });
  assert.equal(r.anosPagados, 11);
  assert.equal(r.monto, 11_000_000);
  assert.equal(r.topeAnosAplicado, true);
  assert.equal(r.topeBaseAplicado, false);
}

// 2. Necesidades de la empresa: base acotada a 90 UF (lo nuevo).
{
  const r = calc({ terminationReason: "necesidades_empresa", totalHaberes: 5_000_000 });
  assert.equal(r.base, 90 * UF);
  assert.equal(r.topeBaseAplicado, true);
  assert.equal(r.monto, 11 * 90 * UF);
}

// 3. Sin valor de UF el tope de base no se aplica, pero avisa.
{
  const r = calc({ terminationReason: "necesidades_empresa", totalHaberes: 5_000_000, ufValue: 0 });
  assert.equal(r.base, 5_000_000);
  assert.equal(r.topeBaseAplicado, false);
  assert.ok(r.avisos.some((a) => a.nivel === "error" && /UF/.test(a.texto)));
}

// 3b. Mutuo acuerdo especial calcula igual que necesidades de la empresa:
// si cambia el tope de uno, debe cambiar el del otro.
{
  const base = { totalHaberes: 5_000_000 };
  const nec = calc({ terminationReason: "necesidades_empresa", ...base });
  const esp = calc({ terminationReason: "mutuo_acuerdo_especial", ...base });
  assert.equal(esp.monto, nec.monto);
  assert.equal(esp.anosPagados, nec.anosPagados);
  assert.equal(esp.base, nec.base);
  assert.equal(esp.topeBaseAplicado, true);
}

// 4. Menos de 1 año de antigüedad: sin indemnización.
{
  const r = calc({ terminationReason: "necesidades_empresa", yearsOfService: 0.5 });
  assert.equal(r.aplica, false);
  assert.equal(r.monto, 0);
  assert.equal(r.regla.id, "sin_antiguedad");
}

// 5. Causal sin indemnización.
{
  const r = calc({ terminationReason: "renuncia" });
  assert.equal(r.aplica, false);
  assert.equal(r.monto, 0);
  assert.equal(r.regla, null);
}

// 6. Mutuo acuerdo, tramo 4-20: tope 11 años + 90 UF sobre el promedio de 48.
{
  const r = calc({
    terminationReason: "mutuo_acuerdo",
    edad: 40,
    averageSalary: 5_000_000,
  });
  assert.equal(r.regla.id, "mutuo_4_20");
  assert.equal(r.anosPagados, 11);
  assert.equal(r.base, 90 * UF);
  assert.equal(r.monto, 11 * 90 * UF);
  assert.equal(r.auditoria.applied, true);
}

// 7. Mutuo acuerdo, tramo 20-25: tope 16 años.
{
  const r = calc({
    terminationReason: "mutuo_acuerdo",
    edad: 50,
    yearsOfService: 22,
    yearsForIndemnity: 22,
    averageSalary: 1_000_000,
  });
  assert.equal(r.regla.id, "mutuo_20_25");
  assert.equal(r.anosPagados, 16);
  assert.equal(r.monto, 16_000_000);
}

// 8. Mutuo acuerdo, 65 años o más: sin topes.
{
  const r = calc({
    terminationReason: "mutuo_acuerdo",
    edad: 66,
    averageSalary: 5_000_000,
  });
  assert.equal(r.regla.id, "mutuo_edad_65");
  assert.equal(r.anosPagados, 15);
  assert.equal(r.monto, 75_000_000);
  assert.equal(r.topeBaseAplicado, false);
}

// 9. Mutuo acuerdo sin fecha de nacimiento: avisa que no hay tramo.
{
  const r = calc({ terminationReason: "mutuo_acuerdo", edad: null });
  assert.equal(r.regla.id, "mutuo_sin_fecha_nacimiento");
  assert.ok(r.avisos.some((a) => a.nivel === "error"));
  assert.equal(r.monto, 15_000_000);
}

// 10. Edad a la fecha de término, no a la de hoy.
{
  assert.equal(edadEnFecha("1960-06-15", "2025-06-14"), 64);
  assert.equal(edadEnFecha("1960-06-15", "2025-06-15"), 65);
  assert.equal(edadEnFecha(null, "2025-01-01"), null);
  assert.equal(edadEnFecha("no-es-fecha", "2025-01-01"), null);
  // La edad queda congelada al término: cumplir 65 después no recalcula el tope.
  assert.equal(edadEnFecha("1960-06-15", "2025-01-01"), 64);
  assert.equal(edadEnFecha("1960-06-15", "2030-01-01"), 69);
}

console.log("topeIndemnizacion: OK");
