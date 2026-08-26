// features/costos/lib/formatters.js
// Helpers de formato compartidos por el módulo Costos.

const MESES_ABREV = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

// Cada país formatea en su propia moneda. No hay conversión entre ellas.
const MONEDA = {
  chile: { locale: 'es-CL', currency: 'CLP', simbolo: '$' },
  peru: { locale: 'es-PE', currency: 'PEN', simbolo: 'S/ ' },
}

export function formatMoneda(value, pais = 'chile') {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const m = MONEDA[pais] || MONEDA.chile
  return new Intl.NumberFormat(m.locale, {
    style: 'currency',
    currency: m.currency,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatMonedaCompact(value, pais = 'chile') {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const s = (MONEDA[pais] || MONEDA.chile).simbolo
  const abs = Math.abs(value)
  if (abs >= 1e9) return `${s}${(value / 1e9).toFixed(1)}MM`
  if (abs >= 1e6) return `${s}${(value / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${s}${(value / 1e3).toFixed(0)}K`
  return `${s}${Math.round(value)}`
}

export function formatPct(value) {
  if (value === null || value === undefined) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

export function formatMesAbrev(d) {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(`${d}T00:00:00`) : d
  return `${MESES_ABREV[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`
}

export function colorVariacion(value) {
  if (value === null || value === undefined || value === 0) return 'cx-delta-zero'
  return value > 0 ? 'cx-delta-pos' : 'cx-delta-neg'
}
