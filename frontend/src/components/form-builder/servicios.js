/**
 * Opciones que vienen del catálogo de servicios.
 *
 * Una opción del catálogo se guarda como `{value: 'srv:12', text: 'Coffee'}`:
 * la llave es el id, nunca el texto, así renombrar el servicio no rompe los
 * formularios que lo usan ni los tickets ya respondidos.
 *
 * Vive en el form-builder compartido pero no sabe de tickets: el catálogo
 * entra por props, igual que `subirImagen`. Sin catálogo, nada de esto se usa.
 */

const PREFIJO = 'srv:'

export const valorDeServicio = (id) => `${PREFIJO}${id}`

/** El id detrás del `value` de una opción, o null si es una opción libre. */
export function idDeServicio(valor) {
  if (typeof valor !== 'string' || !valor.startsWith(PREFIJO)) return null
  const resto = valor.slice(PREFIJO.length)
  return /^\d+$/.test(resto) ? Number(resto) : null
}

const valorDe = (o) => (typeof o === 'string' ? o : o?.value ?? o?.text)

export const esOpcionServicio = (o) => idDeServicio(valorDe(o)) !== null

/**
 * Separa las opciones de una pregunta en las del catálogo y las escritas a
 * mano. El textarea del panel solo edita las libres: si editara las del
 * catálogo las aplanaría a string y perdería el id.
 */
export function separarOpciones(opciones = []) {
  const servicios = []
  const libres = []
  for (const o of opciones) (esOpcionServicio(o) ? servicios : libres).push(o)
  return { servicios, libres }
}

/** Los servicios van primero para que el orden no baile al editar el textarea. */
export const unirOpciones = (servicios, libres) => [...servicios, ...libres]

/**
 * Refresca el texto de las opciones del catálogo contra los nombres actuales.
 *
 * El backend hace lo mismo al servir un tipo; acá es para que el constructor
 * muestre el nombre de hoy sin esperar a recargar. Un servicio borrado del
 * catálogo conserva el último texto conocido: es preferible a dejar la opción
 * en blanco en un formulario que está en uso.
 */
export function refrescarTextos(opciones = [], porId = {}) {
  return opciones.map((o) => {
    const id = idDeServicio(valorDe(o))
    const nombre = id === null ? null : porId[id]
    return nombre ? { value: valorDeServicio(id), text: nombre } : o
  })
}

// Check: `node frontend/src/components/form-builder/servicios.js`
if (globalThis.process?.argv?.[1]?.endsWith('servicios.js')) {
  const eq = (a, b) => {
    const [x, y] = [JSON.stringify(a), JSON.stringify(b)]
    if (x !== y) throw new Error(`${x} != ${y}`)
  }

  eq(idDeServicio('srv:12'), 12)
  eq(idDeServicio('srv:'), null)
  eq(idDeServicio('srv:1a'), null)
  eq(idDeServicio('Opción 1'), null)
  eq(idDeServicio(undefined), null)

  // Una opción libre puede ser string suelto o {value,text}: ambas formas conviven.
  const ops = [
    { value: 'srv:3', text: 'Coffee' },
    'Opción libre',
    { value: 'otra', text: 'Otra' },
    { value: 'srv:7', text: 'Almuerzo' },
  ]
  const { servicios, libres } = separarOpciones(ops)
  eq(servicios, [{ value: 'srv:3', text: 'Coffee' }, { value: 'srv:7', text: 'Almuerzo' }])
  eq(libres, ['Opción libre', { value: 'otra', text: 'Otra' }])
  eq(separarOpciones(), { servicios: [], libres: [] })

  // Editar el textarea no puede perder los servicios.
  eq(unirOpciones(servicios, ['Solo esta']), [
    { value: 'srv:3', text: 'Coffee' }, { value: 'srv:7', text: 'Almuerzo' }, 'Solo esta',
  ])

  // Renombrado en el catálogo: se refleja. Servicio ausente: conserva el texto.
  eq(refrescarTextos(ops, { 3: 'Coffee Básico' }), [
    { value: 'srv:3', text: 'Coffee Básico' },
    'Opción libre',
    { value: 'otra', text: 'Otra' },
    { value: 'srv:7', text: 'Almuerzo' },
  ])
  eq(refrescarTextos([], {}), [])

  console.log('ok')
}
