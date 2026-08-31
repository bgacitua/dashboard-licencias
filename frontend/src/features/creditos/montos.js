/**
 * Lectura de montos tipeados y del error que devuelve el backend.
 *
 * `input[type=number]` acepta el separador decimal del locale del navegador, no
 * el de la app: con el navegador en inglés la coma se descartaba, el campo
 * llegaba vacío al submit y el backend respondía 422. Los montos son campos de
 * texto y la coma se normaliza acá, así el resultado no depende del idioma del
 * equipo del usuario.
 */

/** Número desde lo tipeado, con coma o con punto. null si no hay número. */
export const aNumero = (v) => {
  const t = String(v ?? '').trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Deja pasar solo dígitos, coma y punto mientras se escribe. */
export const soloDecimal = (v) => String(v ?? '').replace(/[^\d.,]/g, '')

/**
 * La columna es NUMERIC(12,2): más de dos decimales se redondean en la base sin
 * que nadie lo note. Estos dos avisan y muestran en la UI con qué valor va a
 * quedar guardado, antes de enviar.
 */
export const DECIMALES = 2

/** Redondeo a 2 decimales, el mismo que aplica NUMERIC(12,2). */
export const redondear = (n) =>
  n === null ? null : Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Aviso si lo tipeado se va a guardar distinto; null si entra tal cual.
 *
 * Compara contra el texto, no contra el número: `aNumero('24,500')` ya vale
 * 24.5 y el redondeo no se vería, pero tampoco hay nada que avisar ahí.
 */
export const avisoRedondeo = (v) => {
  const n = aNumero(v)
  if (n === null) return null
  const r = redondear(n)
  return r === n ? null : `Se guardará como ${formatear(r)}: la base admite ${DECIMALES} decimales.`
}

/** Número con coma decimal, como se escribe en Chile. */
export const formatear = (n) =>
  n === null ? '' : String(n).replace('.', ',')

/**
 * Texto legible desde el `detail` de FastAPI.
 *
 * En un 422 `detail` es una lista de objetos, y pasarla a `new Error()` la
 * imprimía como "[object Object]": el usuario veía eso en vez del campo que
 * falló.
 */
export const mensajeError = (detail, porDefecto = 'Error en la operación') => {
  if (typeof detail === 'string' && detail) return detail
  if (Array.isArray(detail) && detail.length) {
    const texto = detail
      .map((e) => {
        const campo = (e?.loc || []).filter((p) => p !== 'body').join('.')
        return campo ? `${campo}: ${e?.msg}` : e?.msg
      })
      .filter(Boolean)
      .join(' · ')
    if (texto) return texto
  }
  return porDefecto
}

// Check: `node frontend/src/features/creditos/montos.js`
if (globalThis.process?.argv?.[1]?.endsWith('montos.js')) {
  const a = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg) }

  a(aNumero('24,5') === 24.5, 'coma')
  a(aNumero('24.5') === 24.5, 'punto')
  a(aNumero(' 24,50 ') === 24.5, 'espacios alrededor')
  a(aNumero('3') === 3, 'entero')
  a(aNumero('') === null && aNumero(null) === null, 'vacío es null, no 0')
  a(aNumero('abc') === null, 'basura es null')
  a(aNumero('0') === 0, 'cero se distingue de vacío')

  a(soloDecimal('24,5') === '24,5', 'deja coma')
  a(soloDecimal('UF 24.5x') === '24.5', 'saca letras y espacios')

  a(mensajeError('Ya existe') === 'Ya existe', 'detail string')
  a(mensajeError([{ loc: ['body', 'amount'], msg: 'Input should be greater than 0' }])
    === 'amount: Input should be greater than 0', mensajeError([{ loc: ['body', 'amount'], msg: 'x' }]))
  a(mensajeError([
    { loc: ['body', 'amount'], msg: 'a' },
    { loc: ['body', 'duracion'], msg: 'b' },
  ]) === 'amount: a · duracion: b', 'varios campos')
  a(mensajeError(undefined, 'fallback') === 'fallback', 'sin detail usa el por defecto')
  a(mensajeError([], 'fallback') === 'fallback', 'lista vacía usa el por defecto')

  a(redondear(24.567) === 24.57, `redondea: ${redondear(24.567)}`)
  a(redondear(24.5) === 24.5, 'dos decimales pasan igual')
  a(redondear(1.005) === 1.01, `medio hacia arriba: ${redondear(1.005)}`)
  a(redondear(null) === null, 'null pasa')

  a(avisoRedondeo('24,5') === null, 'dos decimales no avisan')
  a(avisoRedondeo('24') === null, 'entero no avisa')
  a(avisoRedondeo('24,500') === null, 'ceros de más no cambian el valor')
  a(avisoRedondeo('') === null && avisoRedondeo('abc') === null, 'sin número no avisa')
  a(avisoRedondeo('24,567')?.includes('24,57'), avisoRedondeo('24,567'))

  a(formatear(24.57) === '24,57', 'coma al mostrar')
  a(formatear(24) === '24', 'entero sin coma')

  console.log('ok')
}
