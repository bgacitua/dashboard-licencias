// El nodo Webhook envuelve el payload en { headers, params, query, body }.
// El fallback a json cubre ejecuciones manuales con datos pegados a mano.
const raw = $input.first().json;
const data = raw.body ?? raw;
const tipo = data.tipo;

// El cuerpo va como HTML, asi que todo valor dinamico se escapa.
const esc = (v) => String(v ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

// Los montos llegan como string decimal ("999999.00"). Se redondean a peso:
// el centavo no aporta al leer la alerta.
const money = (v) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!isFinite(n)) return esc(v);
  return "$" + Math.round(n).toLocaleString("es-CL");
};

// Outlook de escritorio usa el motor de Word, que NO hereda font-family hacia
// dentro de una tabla: el td que no la declara cae a Times New Roman. Por eso F
// se repite en cada celda en vez de ponerse una sola vez en el contenedor.
// 'Segoe UI' va entrecomillado: sin comillas el nombre con espacio es invalido
// y Word descarta la declaracion completa.
const FONT = "'Segoe UI',Arial,sans-serif";
const F = "font-family:" + FONT + ";mso-line-height-rule:exactly";

const P = F + ";margin:0 0 14px;font-size:14px;line-height:22px;color:#1f2937";
const H2 = F + ";margin:0 0 14px;font-size:18px;line-height:26px;font-weight:600";
const TD = F + ";padding:8px 10px;font-size:13px;line-height:20px;color:#1f2937;" +
  "border-bottom:1px solid #e5e7eb";
const TH = F + ";padding:8px 10px;font-size:12px;font-weight:600;color:#6b7280;" +
  "background:#f3f4f6;border-bottom:1px solid #d1d5db";

// Word ignora max-width, asi que sin esto la tarjeta se estira a todo el panel de
// lectura. El comentario condicional le da un ancho fijo que solo el ve; el resto
// de los clientes usan max-width y siguen siendo responsive.
const ANCHO = 700;
const salida = (asunto, cuerpo) => [{ json: { asunto, cuerpo_html:
  '<!--[if mso]><table role="presentation" width="' + ANCHO + '" align="left" ' +
  'cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->' +
  '<div style="' + F + ';max-width:' + ANCHO + 'px;font-size:14px;color:#1f2937">' +
  cuerpo +
  '</div>' +
  '<!--[if mso]></td></tr></table><![endif]-->'
} }];

const pie =
  '<p style="' + F + ';color:#6b7280;font-size:12px;line-height:18px;margin:24px 0 0">' +
  'Enviado automaticamente por el Dashboard de Personas. No responder este correo.</p>';

if (tipo === "liquidos_snapshot") {
  return salida(
    "Cierre de liquidaciones congelado — " + data.periodo,
    '<h2 style="' + H2 + '">Cierre ' + esc(data.periodo) + "</h2>" +
    '<p style="' + P + '">' + esc(data.timestamp) + "</p>" +
    '<p style="' + P + '">' + esc(data.mensaje) + "</p>" + pie
  );
}

if (tipo === "liquidos_descuadre") {
  const trabajadores = data.trabajadores ?? [];

  // Anchos duplicados en el atributo width y en el style: Word ignora el ancho
  // declarado solo por CSS en una celda.
  const COLS = [
    { w: "24%", label: "RUT", align: "left" },
    { w: "28%", label: "Campo", align: "left" },
    { w: "24%", label: "Cierre", align: "right" },
    { w: "24%", label: "Actual", align: "right" },
  ];

  const celda = (i, html, extra) => (
    '<td width="' + COLS[i].w + '" align="' + COLS[i].align + '" style="' + TD +
    ";width:" + COLS[i].w + ";text-align:" + COLS[i].align + (extra || "") + '">' +
    html + "</td>"
  );

  // Una fila por campo descuadrado, agrupando visualmente por trabajador.
  const filas = trabajadores.flatMap((t) => {
    const titulo = t.rut ? esc(t.rut) : "employee_id " + esc(t.employee_id);
    const campos = t.campos ?? [];
    return campos.map((c, i) => (
      "<tr>" +
      celda(0, i === 0 ? "<b>" + titulo + "</b>" : "&nbsp;") +
      celda(1, esc(c.etiqueta)) +
      celda(2, money(c.target)) +
      celda(3, money(c.actual), ";color:#b91c1c;font-weight:600") +
      "</tr>"
    ));
  }).join("");

  const thead = "<tr>" + COLS.map((c) => (
    '<th width="' + c.w + '" align="' + c.align + '" style="' + TH +
    ";width:" + c.w + ";text-align:" + c.align + '">' + c.label + "</th>"
  )).join("") + "</tr>";

  return salida(
    "Descuadre de liquidaciones " + data.periodo + " — " +
      trabajadores.length + " trabajador(es)",
    '<h2 style="' + H2 + ';color:#b91c1c">Descuadre de liquidaciones</h2>' +
    '<p style="' + P + '">Periodo <b>' + esc(data.periodo) + "</b> — detectado el " +
      esc(data.timestamp) + "<br>" +
      trabajadores.length + " trabajador(es) con diferencias respecto al cierre.</p>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ' +
    'border="0" style="width:100%;border-collapse:collapse;' + F + '">' +
    "<thead>" + thead + "</thead><tbody>" + filas + "</tbody></table>" + pie
  );
}

if (tipo === "error_inesperado") {
  return salida(
    "Descuadre de liquidaciones — error del barrido",
    '<h2 style="' + H2 + '">Error en el barrido de liquidaciones</h2>' +
    '<p style="' + P + '">' + esc(data.timestamp) + "</p>" +
    '<p style="' + P + '">' + esc(data.mensaje) + "</p>" + pie
  );
}

return salida(
  "Descuadre de liquidaciones — evento desconocido",
  '<p style="' + P + '">Evento desconocido: ' + esc(tipo) + "</p>" + pie
);
