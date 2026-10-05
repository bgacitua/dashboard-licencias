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

/** Enunciado de cada campo según la definición: `{ nombre: título }`. */
export const titulos = (definicion) =>
  Object.fromEntries(columnas(definicion).map((c) => [c.name, c.title]))

/** Una respuesta como texto plano, lista para una celda. */
export const mostrar = (v) => {
  if (v === undefined || v === null || v === '') return '—'
  if (Array.isArray(v)) return v.join(', ')
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
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
export function filasExport(tickets, columnasDef) {
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
    for (const [h, c] of preguntas) fila[h] = mostrar(t.datos?.[c.name])
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

  console.log('ok')
}
