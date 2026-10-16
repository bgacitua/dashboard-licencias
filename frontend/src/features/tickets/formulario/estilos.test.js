// Correr: node src/features/tickets/formulario/estilos.test.js
import assert from "node:assert/strict";

import { cabeceraDeTema, estilosDeTema } from "./estilos.js";

// Las perillas del admin llegan como variables --fp-*.
const v = estilosDeTema({ color: "#ff0000", fondo: "#001122", esquinas: 12 });
assert.equal(v["--fp-marca"], "#ff0000");
assert.equal(v["--fp-fondo"], "#001122");
assert.equal(v["--fp-radio"], "12px");

// Sin tema: cae a los valores por defecto, no revienta.
const d = estilosDeTema(undefined);
assert.ok(d["--fp-marca"] && d["--fp-fondo"] && d["--fp-radio"]);

// Encabezado "color" => banda; "simple" => sin banda.
assert.equal(cabeceraDeTema({ encabezado: "color" }, { titulo: "Casino" }).banda, true);
assert.equal(cabeceraDeTema({ encabezado: "simple" }, { titulo: "Casino" }).banda, false);

// "imagen" sin imagen no arma banda (igual criterio que construirTema).
assert.equal(cabeceraDeTema({ encabezado: "imagen", encabezadoImagen: "" }).banda, false);
assert.equal(cabeceraDeTema({ encabezado: "imagen", encabezadoImagen: "/x.png" }).imagen, "/x.png");

// sinTitulo oculta título y descripción.
const st = cabeceraDeTema({ encabezado: "imagen", encabezadoImagen: "/x.png", sinTitulo: true },
    { titulo: "Casino", descripcion: "Pide tu almuerzo" });
assert.equal(st.titulo, "");
assert.equal(st.descripcion, "");

// Sin sinTitulo, pasa la cabecera.
const con = cabeceraDeTema({ encabezado: "color" }, { titulo: "Casino", descripcion: "Pide" });
assert.equal(con.titulo, "Casino");
assert.equal(con.descripcion, "Pide");

console.log("estilos: ok");
