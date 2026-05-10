import { formatCLP, colorVariacion } from '../lib/formatters'

export function KpiSimpleCard({ label, value, sub, isCurrency = false, delta = null }) {
  const display =
    value === null || value === undefined
      ? '—'
      : isCurrency
        ? formatCLP(value)
        : new Intl.NumberFormat('es-CL').format(value)

  let deltaNode = null
  if (delta !== null && delta !== undefined) {
    const sign = delta > 0 ? '+' : ''
    deltaNode = (
      <span className={`text-[11px] ${colorVariacion(delta)}`}>
        {sign}{delta} {sub || ''}
      </span>
    )
  }

  return (
    <div className="cx-card p-5 flex flex-col gap-2">
      <div className="text-xs cx-text-secondary">{label}</div>
      <div className="cx-kpi-sm">{display}</div>
      {deltaNode || (sub && <div className="text-[11px] cx-text-muted">{sub}</div>)}
    </div>
  )
}
