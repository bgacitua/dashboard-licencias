/**
 * Lectura de las respuestas de un formulario de tickets.
 *
 * Las columnas salen de la *definición* del tipo, no de los datos: así una
 * pregunta recién agregada —o que nadie respondió todavía— igual aparece, y el
 * orden es el del formulario y no el azar del JSONB.
 */

// Los elementos decorativos no son respuestas y no merecen columna.
const DECORATIVOS = new Set(['html', 'image', 'expression'])

/** Preguntas de la definición, en orden, aplanando los paneles. */
export function columnas(definicion) {
  const salida = []
  const recorrer = (elementos) => {
    for (const e of elementos || []) {
      if (e.elements) recorrer(e.elements)
      else if (!DECORATIVOS.has(e.type)) salida.push({ name: e.name, title: e.title || e.name })
    }
  }
  for (const p of definicion?.pages || []) recorrer(p.elements)
  return salida
}

/**
 * `{ value: texto }` de todas las opciones de la definición.
 *
 * Lo que se guarda en la respuesta es el `value`, así que sin esto una opción
 * del catálogo se vería como 'srv:12'. El texto sale de la definición, que el
 * backend ya devuelve con los nombres del catálogo al día; un servicio dado de
 * baja conserva ahí su último nombre conocido y se sigue leyendo.
 */
export function etiquetas(definicion) {
  const salida = {}
  const recorrer = (elementos) => {
    for (const e of elementos || []) {
      if (e.elements) recorrer(e.elements)
      for (const o of e.choices || []) {
        if (o && typeof o === 'object' && o.value != null && o.text) salida[o.value] = o.text
      }
    }
  }
  for (const p of definicion?.pages || []) recorrer(p.elements)
  return salida
}

/** Enunciado de cada campo según la definición: `{ nombre: título }`. */
export const titulos = (definicion) =>
  Object.fromEntries(columnas(definicion).map((c) => [c.name, c.title]))

/**
 * Una respuesta como texto plano, lista para una celda.
 *
 * `etqs` traduce el valor guardado al texto de la opción. Sin él se muestra el
 * valor crudo, que es lo correcto para las respuestas escritas a mano.
 */
export const mostrar = (v, etqs = {}) => {
  if (v === undefined || v === null || v === '') return '—'
  const uno = (x) => (typeof x === 'string' && etqs[x]) || x
  if (Array.isArray(v)) return v.map(uno).join(', ')
  const t = uno(v)
  return typeof t === 'object' ? JSON.stringify(t) : String(t)
}

// Columnas fijas del export, antes de las preguntas. Separadas de la tabla
// en pantalla porque acá importa la trazabilidad: correo, cuándo se envió y
// qué versión es, no solo lo que se ve de un vistazo.
const FIJAS = [
  ['N°', (t) => t.id],
  ['Solicitante', (t) => t.usuario || ''],
  ['Correo', (t) => t.email || ''],
  ['Estado', (t) => t.estado],
  ['Fecha servicio', (t) => t.fecha_servicio || ''],
  ['Enviado', (t) => t.created_at || ''],
  ['Última edición', (t) => t.updated_at || ''],
  ['Versión', (t) => t.version_actual],
]

/**
 * `{ columns, rows }` para descargarHojas(): una fila por ticket, una columna
 * por pregunta además de las fijas.
 *
 * Los encabezados tienen que ser únicos: json_to_sheet mapea cada fila por el
 * texto de la columna, así que dos preguntas con el mismo título se pisarían.
 * Cuando pasa, se desambigua con el nombre interno.
 */
export function filasExport(tickets, columnasDef, etqs = {}) {
  const vistos = new Map()
  const etiqueta = (c) => {
    const n = (vistos.get(c.title) || 0) + 1
    vistos.set(c.title, n)
    return n === 1 ? c.title : `${c.title} (${c.name})`
  }
  const preguntas = columnasDef.map((c) => [etiqueta(c), c])

  const columns = [...FIJAS.map(([h]) => h), ...preguntas.map(([h]) => h)]
  const rows = tickets.map((t) => {
    const fila = {}
    for (const [h, get] of FIJAS) fila[h] = get(t)
    for (const [h, c] of preguntas) fila[h] = mostrar(t.datos?.[c.name], etqs)
    return fila
  })
  return { columns, rows }
}

// Check: `node frontend/src/features/tickets/respuestas.js`
if (globalThis.process?.argv?.[1]?.endsWith('respuestas.js')) {
  const eq = (a, b) => {
    const [x, y] = [JSON.stringify(a), JSON.stringify(b)]
    if (x !== y) throw new Error(`${x} != ${y}`)
  }
  const def = {
    pages: [
      { elements: [{ name: 'a', type: 'text', title: 'Nombre' }, { name: 'logo', type: 'image' }] },
      {
        elements: [
          { type: 'panel', elements: [{ name: 'b', type: 'checkbox', title: 'Servicios' }] },
          { name: 'c', type: 'text' },
        ],
      },
    ],
  }
  eq(columnas(def), [{ name: 'a', title: 'Nombre' }, { name: 'b', title: 'Servicios' }, { name: 'c', title: 'c' }])
  eq(columnas(undefined), [])
  eq(titulos(def), { a: 'Nombre', b: 'Servicios', c: 'c' })
  eq(mostrar(['x', 'y']), 'x, y')
  eq(mostrar(''), '—')
  eq(mostrar(0), '0')
  eq(mostrar(false), 'false')

  // Opciones del catálogo: lo guardado es el value, se muestra el texto.
  const defSrv = {
    pages: [{
      elements: [
        { name: 'coffee', type: 'radiogroup', title: 'Coffee',
          choices: [{ value: 'srv:12', text: 'Coffee Básico' }, 'Ninguno'] },
        { name: 'extras', type: 'checkbox', title: 'Extras',
          choices: [{ value: 'srv:7', text: 'Almuerzo' }] },
      ],
    }],
  }
  const etqs = etiquetas(defSrv)
  eq(etqs, { 'srv:12': 'Coffee Básico', 'srv:7': 'Almuerzo' })
  eq(mostrar('srv:12', etqs), 'Coffee Básico')
  eq(mostrar(['srv:12', 'srv:7'], etqs), 'Coffee Básico, Almuerzo')
  // Sin mapa, o con un valor que no está en él, se muestra el valor crudo.
  eq(mostrar('srv:12'), 'srv:12')
  eq(mostrar('Ninguno', etqs), 'Ninguno')
  // Un servicio sacado de la definición ya no se traduce, pero no rompe.
  eq(mostrar('srv:99', etqs), 'srv:99')
  eq(etiquetas(undefined), {})

  // Export: columnas fijas + una por pregunta, filas keyed por la cabecera.
  const exp = filasExport(
    [{ id: 5, usuario: 'Ana', email: 'a@x.cl', estado: 'pendiente', fecha_servicio: '2026-10-09',
       created_at: '2026-10-05', updated_at: '2026-10-05', version_actual: 1,
       datos: { a: 'Hola', b: ['x', 'y'] } }],
    columnas(def),
  )
  eq(exp.columns, ['N°', 'Solicitante', 'Correo', 'Estado', 'Fecha servicio', 'Enviado',
    'Última edición', 'Versión', 'Nombre', 'Servicios', 'c'])
  eq(exp.rows[0]['N°'], 5)
  eq(exp.rows[0].Nombre, 'Hola')
  eq(exp.rows[0].Servicios, 'x, y')
  eq(exp.rows[0].c, '—')
  // Títulos repetidos: el segundo se desambigua con el nombre interno.
  const dup = filasExport([{ datos: { p: 1, q: 2 } }],
    [{ name: 'p', title: 'Monto' }, { name: 'q', title: 'Monto' }])
  eq(dup.columns.slice(-2), ['Monto', 'Monto (q)'])
  eq(dup.rows[0]['Monto'], '1')
  eq(dup.rows[0]['Monto (q)'], '2')

  // El export traduce igual que la tabla.
  const expSrv = filasExport([{ datos: { coffee: 'srv:12' } }], columnas(defSrv), etqs)
  eq(expSrv.rows[0].Coffee, 'Coffee Básico')

  console.log('ok')
}
