// Correr: node src/components/form-builder/tema.test.js
import assert from "node:assert/strict";
import { BaseTheme, Model } from "survey-core";
import { DefaultLight } from "survey-core/themes";

import { construirTema, crearModelo } from "./tema.js";

// Regresión de FormPublico/FormBuilder: el bug era silencioso (el formulario
// renderizaba, solo se veía roto), así que se afirma el contrato de la librería.
const vars = (...args) => {
    const m = new Model({ elements: [{ type: "text", name: "q1" }] });
    m.applyTheme(...args);
    return Object.keys(m.themeVariables || {});
};

// DefaultLight es un delta vacío: por sí solo no define ningún token.
assert.equal(vars(DefaultLight).length, 0);

// Con BaseTheme llegan los --sjs2-* que consume survey-core.css.
const conBase = vars(DefaultLight, BaseTheme);
assert.ok(conBase.length > 1000, `pocos tokens: ${conBase.length}`);
assert.ok(conBase.every((k) => k.startsWith("--")));
for (const k of ["--sjs2-base-unit-size", "--sjs2-base-unit-spacing"]) {
    assert.ok(conBase.includes(k), `falta ${k}`);
}

// construirTema: las perillas del admin llegan como tokens del modelo.
const m = crearModelo(
    { elements: [{ type: "text", name: "q1" }] },
    { color: "#ff0000", fondo: "#000000", esquinas: 0, encabezado: "color" },
    { titulo: "Almuerzos" },
);
const tv = m.themeVariables;
assert.equal(tv["--sjs2-color-project-brand-600"], "#ff0000");
assert.equal(tv["--sjs2-color-utility-body"], "#000000");
assert.equal(tv["--sjs2-base-unit-radius"], "0px");
assert.ok(Object.keys(tv).length > 1000, "el tema propio no debe perder BaseTheme");
assert.equal(m.title, "Almuerzos");
assert.equal(m.headerView, "advanced");

// Encabezado "imagen" sin imagen cae a básico, no a una banda vacía.
assert.equal(construirTema({ encabezado: "imagen", encabezadoImagen: "" }).headerView, "basic");
assert.equal(construirTema({ encabezado: "simple" }).headerView, "basic");

console.log("tema: ok");
