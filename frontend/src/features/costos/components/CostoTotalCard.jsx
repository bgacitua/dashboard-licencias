import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatCLP, formatCLPCompact, formatPct, colorVariacion } from '../lib/formatters'

function Desplegable({ titulo, total, etiqueta, desglose, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const Icon = open ? ChevronDown : ChevronRight
  return (
    <div className="cx-border border-t pt-2.5 mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium cx-text-primary">
          <Icon className="size-4 cx-text-secondary" />
          {titulo}
          <span className="cx-text-secondary font-normal ml-1.5 tabular-nums">{formatCLPCompact(total)}</span>
        </span>
        <span className="text-xs cx-text-muted">{etiqueta}</span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1 pl-6 max-h-[280px] overflow-y-auto">
          {desglose.length === 0 && (
            <li className="text-xs cx-text-muted">Sin datos</li>
          )}
          {desglose.map((d, i) => (
            <li key={`${d.concepto || '_'}-${i}`} className="flex items-center justify-between text-xs">
              <span className="truncate cx-text-primary pr-2">{d.concepto || '(sin clasificar)'}</span>
              <span className="cx-text-secondary tabular-nums shrink-0">{formatCLP(d.monto)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function CostoTotalCard({ kpis, etiquetaPeriodo, className = '' }) {
  if (!kpis) {
    return (
      <div className={`cx-card p-5 ${className}`}>
        <div className="text-xs cx-text-muted">Cargando…</div>
      </div>
    )
  }

  const { costo_total_periodo, costo_mensual, costo_anual, mom, yoy } = kpis

  return (
    <div className={`cx-card p-5 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="text-xs cx-text-secondary uppercase tracking-wider font-medium">
          Costo total empresa · período filtrado
        </div>
        {etiquetaPeriodo && (
          <div className="text-[11px] cx-text-muted">{etiquetaPeriodo}</div>
        )}
      </div>

      <div className="mt-2 cx-kpi">{formatCLP(costo_total_periodo)}</div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <span>
          <span className="cx-text-secondary">{mom?.mes_referencia || '—'}: </span>
          <span className={`font-semibold ${colorVariacion(mom?.valor_pct)}`}>{formatPct(mom?.valor_pct)}</span>
          <span className="cx-text-muted"> MoM</span>
        </span>
        <span>
          <span className="cx-text-secondary">vs {yoy?.mes_comparacion || '—'}: </span>
          <span className={`font-semibold ${colorVariacion(yoy?.valor_pct)}`}>{formatPct(yoy?.valor_pct)}</span>
          <span className="cx-text-muted"> YoY</span>
        </span>
      </div>

      <Desplegable
        titulo="Costo mensual"
        total={costo_mensual?.valor_real || 0}
        etiqueta={costo_mensual?.etiqueta || ''}
        desglose={costo_mensual?.desglose_concepto || []}
      />
      <Desplegable
        titulo="Costo anual"
        total={costo_anual?.valor_real || 0}
        etiqueta={costo_anual?.etiqueta || 'últimos 12 meses'}
        desglose={costo_anual?.desglose_concepto || []}
      />
    </div>
  )
}
