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
  console.log('ok')
}
