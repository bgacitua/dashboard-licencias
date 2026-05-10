// features/costos/lib/formatters.js
// Helpers de formato compartidos por el módulo Costos.

const MESES_ABREV = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

export function formatCLP(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatCLPCompact(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}MM`
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}K`
  return `$${Math.round(value)}`
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
