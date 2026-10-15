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

// La perilla oculta título Y descripción: con la imagen del encabezado ya
// escrita, dejar la descripción suelta se veía igual de repetido.
const sinTitulo = crearModelo(
    { elements: [{ type: "text", name: "q1" }] },
    { encabezado: "imagen", encabezadoImagen: "/x.png", sinTitulo: true },
    { titulo: "Almuerzos", descripcion: "Pide tu almuerzo" },
);
assert.equal(sinTitulo.title, "");
assert.equal(sinTitulo.description, "");
// Los tipos guardados antes de la perilla siguen mostrando ambos.
const conTitulo = crearModelo({ elements: [] }, {}, { titulo: "Almuerzos", descripcion: "Pide" });
assert.equal(conTitulo.title, "Almuerzos");
assert.equal(conTitulo.description, "Pide");

// El desglose entre paréntesis llega a survey-core como HTML: el texto de la
// opción se parte en título + tarjetas. Es todo lo que se puede comprobar del
// enganche de onTextMarkdown sin un navegador, y cubre los tres filtros.
const conDesglose = crearModelo({
    elements: [
        {
            type: "radiogroup", name: "r", choices: [
                { value: "srv:1", text: "Coffee break (café; galletas)" },
                { value: "srv:2", text: "Arriendo sala (sala grande)" },
            ],
        },
        { type: "dropdown", name: "d", choices: [{ value: "srv:1", text: "Coffee break (café; galletas)" }] },
    ],
}, {}, { titulo: "Comida (almuerzo; cena)" });

const ops = conDesglose.getQuestionByName("r").choices;
assert.ok(ops[0].locText.hasHtml, "la opción con desglose pasa a HTML");
assert.ok(ops[0].locText.textOrHtml.includes(">café<"), "y trae sus tarjetas");
// Sin ';' no se toca options.html: si no, survey-core deja ese texto en la
// rama innerHTML para siempre y se paga en todas las opciones.
assert.ok(!ops[1].locText.hasHtml, "sin ';' la opción queda como texto plano");

// El dropdown pinta la elegida dentro del combo cerrado, de una línea.
assert.ok(!conDesglose.getQuestionByName("d").choices[0].locText.hasHtml,
    "el dropdown no recibe tarjetas");

// El título del formulario no es una opción: un tipo con paréntesis en el
// nombre no puede terminar con tarjetas en el encabezado.
assert.ok(!conDesglose.locTitle.hasHtml, "el encabezado nunca recibe tarjetas");

// Modo tarjetas: colapsa las páginas en una y expone el flag para el scope CSS.
// Apagado (default) no toca nada.
const normal = crearModelo({ elements: [{ type: "radiogroup", name: "r", choices: ["a"] }] }, {});
assert.ok(!normal.modoTarjetas, "sin la perilla no hay modo tarjetas");

const tarjetas = crearModelo(
    { elements: [{ type: "html", name: "h", html: "<p>hola</p>" }, { type: "radiogroup", name: "r", choices: ["a"] }] },
    { tarjetas: true },
);
assert.equal(tarjetas.modoTarjetas, true);
assert.equal(tarjetas.questionsOnPageMode, "singlePage");
// La entrada es la primera pregunta de selección; el html de arriba se salta.
// Sin un render real solo se afirma el flag; la clase tema-entrada se ve en QA.
assert.equal(tarjetas.getAllQuestions().find((q) => q.getType() === "radiogroup").name, "r");

console.log("tema: ok");
