// Correr: node src/features/formularios/tema.test.js
import assert from "node:assert/strict";
import { BaseTheme, Model } from "survey-core";
import { DefaultLight } from "survey-core/themes";

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

console.log("tema: ok");
