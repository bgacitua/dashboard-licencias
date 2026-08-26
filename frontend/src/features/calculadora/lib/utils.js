// features/calculadora/lib/utils.js

export const formatCLP = (value) => {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(value)
}

export const parseNumericInput = (value) => {
  const cleaned = String(value).replace(/[^\d]/g, "")
  return parseInt(cleaned) || 0
}

export const formatNumericInput = (value) => {
  const num = parseNumericInput(value)
  if (num === 0) return ""
  return new Intl.NumberFormat("es-CL").format(num)
}

export const cn = (...classes) => {
  return classes.filter((cls) => typeof cls === "string").join(" ")
}

export const formatUSD = (value) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export const formatPEN = (value) => {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export const formatBRL = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// ---------------------------------------------------------------------------
// Brasil — entrada numérica con separadores brasileños
// ---------------------------------------------------------------------------
// parseNumericInput() descarta todo lo que no sea dígito, así que "2.500,50"
// se convertiría en 250050. Chile y Perú siguen usándolo tal cual; Brasil usa
// estas dos funciones, que sí respetan los centavos.

/**
 * "25.500" → 25500 · "25.500,50" → 25500.5 · "25500,50" → 25500.5
 * "25500.50" → 25500.5 · "R$ 0,01" → 0.01 · vacío/ inválido → 0
 */
export const parseBRLInput = (value) => {
  const limpio = String(value ?? '').replace(/[^\d.,-]/g, '')
  if (limpio === '' || limpio === '-') return 0

  const negativo = limpio.startsWith('-')
  const cuerpo = limpio.replace(/-/g, '')

  let normalizado
  if (cuerpo.includes(',')) {
    // Formato brasileño: la coma es el decimal y los puntos son de miles.
    const [entero, ...resto] = cuerpo.split(',')
    normalizado = `${entero.replace(/\./g, '')}.${resto.join('')}`
  } else if (cuerpo.includes('.')) {
    // Sólo puntos: 3 dígitos al final = separador de miles ("25.500"),
    // cualquier otra cantidad = decimal ("25500.50").
    const partes = cuerpo.split('.')
    const ultima = partes[partes.length - 1]
    normalizado =
      ultima.length === 3 ? partes.join('') : `${partes.slice(0, -1).join('')}.${ultima}`
  } else {
    normalizado = cuerpo
  }

  const num = parseFloat(normalizado)
  if (!Number.isFinite(num)) return 0
  return negativo ? -num : num
}

/** Normaliza al perder foco: 25500.5 → "25.500,50". Vacío o 0 → "". */
export const formatBRLInput = (value) => {
  const num = parseBRLInput(value)
  if (num === 0) return ''
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}
