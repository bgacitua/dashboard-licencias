// Correr: node src/lib/variableBonus.test.js
import assert from "node:assert/strict";
import {
  parsePeriodo,
  getExpandedVariableGroups,
  calculateTotalFromExpandedGroups,
} from "./variableBonus.js";

const item = (concepto, periodo, monto) => ({ concepto, periodo, monto });
const expand = (items, licencias = [], filledActive = {}, fechaTermino) =>
  getExpandedVariableGroups(items, {}, licencias, filledActive, fechaTermino);
// No se compara `periodo` formateado: el ICU de node no pad-ea el mes como el del browser.
const periodosDe = (grupo) =>
  grupo.map((i) => {
    const p = i.year != null ? { year: i.year, month: i.month } : parsePeriodo(i.periodo);
    return `${String(p.month).padStart(2, "0")}-${p.year}:${i.monto}`;
  });

// 1. REGRESIÓN: concepto que deja de pagarse los últimos 2 meses debe mostrar $0,
// no desaparecer. El tope lo marca el mes más reciente de cualquier concepto.
{
  const items = [
    item("Bono Turno", "01-2025", 300000),
    item("Bono Turno", "02-2025", 300000),
    item("Bono Turno", "03-2025", 300000),
    item("Bono Turno", "04-2025", 300000),
    item("Comisión", "01-2025", 100000),
    item("Comisión", "02-2025", 100000),
    item("Comisión", "03-2025", 100000),
    item("Comisión", "04-2025", 100000),
    item("Comisión", "05-2025", 100000),
    item("Comisión", "06-2025", 100000),
  ];
  const groups = expand(items);
  assert.equal(groups["Bono Turno"].length, 6, "Bono Turno debe cubrir enero-junio");
  const rellenos = groups["Bono Turno"].filter((i) => i.type === "filled");
  assert.deepEqual(
    rellenos.map((i) => `${i.year}-${i.month}`),
    ["2025-5", "2025-6"]
  );
  assert.ok(rellenos.every((i) => i.monto === 0 && i.active === true));
  // Bono Turno: (0 + 0 + 300000)/3 = 100000 ; Comisión: 100000. Antes del fix daba 400000.
  assert.equal(calculateTotalFromExpandedGroups(groups), 200000);
}

// 2. Los huecos intermedios se siguen rellenando en 0.
{
  const groups = expand([
    item("Bono Turno", "01-2025", 300000),
    item("Bono Turno", "03-2025", 300000),
  ]);
  assert.deepEqual(periodosDe(groups["Bono Turno"]), [
    "01-2025:300000",
    "02-2025:0",
    "03-2025:300000",
  ]);
}

// 3. Un bono que empezó después NO se rellena hacia atrás con ceros.
{
  const groups = expand([
    item("Comisión", "01-2025", 100000),
    item("Comisión", "06-2025", 100000),
    item("Bono Nuevo", "05-2025", 50000),
    item("Bono Nuevo", "06-2025", 50000),
  ]);
  assert.deepEqual(periodosDe(groups["Bono Nuevo"]), ["05-2025:50000", "06-2025:50000"]);
}

// 4. Mes relleno que cae en licencia médica queda inactivo y fuera del promedio.
{
  const licencias = [
    { tipo_permiso: "Licencia por enfermedad", fecha_inicio: "2025-05-02", fecha_fin: "2025-05-20" },
  ];
  const groups = expand(
    [
      item("Bono Turno", "03-2025", 300000),
      item("Bono Turno", "04-2025", 300000),
      item("Comisión", "06-2025", 0),
    ],
    licencias
  );
  const mayo = groups["Bono Turno"].find((i) => i.month === 5);
  assert.equal(mayo.hasLicense, true);
  assert.equal(mayo.active, false);
  // Válidos más recientes: junio(0), abril(300000), marzo(300000) => 200000
  assert.equal(calculateTotalFromExpandedGroups(groups), 200000);
}

// 5. REGRESIÓN: TODOS los conceptos paran en mayo pero el término es en julio.
// El tope lo marca la fecha de término, no el último dato. Antes faltaban junio y julio.
{
  const items = [
    item("Bono Turno", "03-2025", 300000),
    item("Bono Turno", "04-2025", 300000),
    item("Bono Turno", "05-2025", 300000),
  ];
  const groups = expand(items, [], {}, "2025-07-15");
  const rellenos = groups["Bono Turno"].filter((i) => i.type === "filled");
  assert.deepEqual(
    rellenos.map((i) => `${i.year}-${i.month}`),
    ["2025-6", "2025-7"]
  );
  // Más recientes válidos: julio(0), junio(0), mayo(300000) => 100000
  assert.equal(calculateTotalFromExpandedGroups(groups), 100000);
}

// 6. Fecha de término anterior al último dato no recorta nada.
{
  const groups = expand(
    [item("Bono Turno", "03-2025", 300000), item("Bono Turno", "06-2025", 300000)],
    [],
    {},
    "2025-04-30"
  );
  assert.equal(groups["Bono Turno"].length, 4); // mar, abr(0), may(0), jun
}

console.log("variableBonus: 6/6 OK");
