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
