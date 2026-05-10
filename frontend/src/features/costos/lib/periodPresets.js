// features/costos/lib/periodPresets.js
// Helpers para construir rangos de período (siempre primer/último día del mes).

function firstDayOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function lastDayOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function shiftMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function toISO(d) {
  // YYYY-MM-DD
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Último mes cerrado = mes anterior al actual
function lastClosedMonth() {
  const now = new Date()
  return shiftMonths(firstDayOfMonth(now), -1)
}

export const PRESETS = {
  ULTIMO_MES: {
    label: 'Último mes cerrado',
    range: () => {
      const m = lastClosedMonth()
      return { fecha_inicio: toISO(m), fecha_fin: toISO(lastDayOfMonth(m)) }
    },
  },
  ULTIMOS_3M: {
    label: 'Últimos 3 meses',
    range: () => {
      const fin = lastClosedMonth()
      const inicio = shiftMonths(fin, -2)
      return { fecha_inicio: toISO(inicio), fecha_fin: toISO(lastDayOfMonth(fin)) }
    },
  },
  ULTIMOS_12M: {
    label: 'Últimos 12 meses',
    range: () => {
      const fin = lastClosedMonth()
      const inicio = shiftMonths(fin, -11)
      return { fecha_inicio: toISO(inicio), fecha_fin: toISO(lastDayOfMonth(fin)) }
    },
  },
  ANIO_CURSO: {
    label: 'Año en curso',
    range: () => {
      const now = new Date()
      const inicio = new Date(now.getFullYear(), 0, 1)
      const fin = lastClosedMonth()
      return { fecha_inicio: toISO(inicio), fecha_fin: toISO(lastDayOfMonth(fin)) }
    },
  },
  ANIO_ANTERIOR: {
    label: 'Año anterior',
    range: () => {
      const y = new Date().getFullYear() - 1
      return {
        fecha_inicio: toISO(new Date(y, 0, 1)),
        fecha_fin: toISO(new Date(y, 11, 31)),
      }
    },
  },
}

export function defaultRange() {
  return PRESETS.ULTIMO_MES.range()
}

export function monthsInRange(fecha_inicio, fecha_fin) {
  const a = new Date(`${fecha_inicio}T00:00:00`)
  const b = new Date(`${fecha_fin}T00:00:00`)
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1
}

export { firstDayOfMonth, lastDayOfMonth, shiftMonths, toISO }
