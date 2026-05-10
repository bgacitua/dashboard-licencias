import { X } from 'lucide-react'
import { formatCLP, formatPct, colorVariacion } from '../lib/formatters'
import { SLOT_COLORS } from '../lib/useCompareSlots'

const TIPO_LABEL = {
  area: 'Área',
  jefatura: 'Jefatura',
  cargo: 'Cargo',
  persona: 'Persona',
}

function deltaPct(actual, base) {
  if (base == null || base === 0 || actual == null) return null
  return ((actual - base) / base) * 100
}

/**
 * Grid 2x2 (o 1xN) de cards de comparación.
 * Cada card muestra: letra+color, tipo, label, costo total período, headcount,
 * costo prom/persona, MoM, YoY, y Δ vs slot A (excepto A).
 */
export function CompareCards({ resultados, onRemove }) {
  if (!resultados?.length) return null

  const baseline = resultados[0]
  const baseTotal = baseline.kpis?.costo_total_periodo
  const basePromedio = baseline.kpis?.costo_promedio_persona

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {resultados.map((r) => {
        const k = r.kpis || {}
        const isBaseline = r.slot_id === baseline.slot_id
        const dTotal = isBaseline ? null : deltaPct(k.costo_total_periodo, baseTotal)
        const dProm = isBaseline ? null : deltaPct(k.costo_promedio_persona, basePromedio)

        return (
          <div
            key={r.slot_id}
            className="cx-card p-5"
            style={{ borderTopWidth: 3, borderTopColor: SLOT_COLORS[r.slot_id] }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center justify-center size-6 rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: SLOT_COLORS[r.slot_id] }}
                >
                  {r.slot_id}
                </span>
                <div>
                  <div className="text-[11px] uppercase tracking-wider cx-text-secondary font-medium">
                    {TIPO_LABEL[r.tipo]}
                    {isBaseline && <span className="ml-1.5 cx-text-primary">· baseline</span>}
                  </div>
                  <div className="text-sm font-semibold leading-tight cx-text-primary">{r.label}</div>
                </div>
              </div>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(r.slot_id)}
                  className="cx-text-secondary hover:cx-text-primary transition-colors"
                  aria-label="quitar slot"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] cx-text-secondary">Costo total período</div>
                <div className="cx-kpi-sm">
                  {formatCLP(k.costo_total_periodo)}
                </div>
                {dTotal !== null && (
                  <div className={`text-[11px] ${colorVariacion(dTotal)}`}>
                    {formatPct(dTotal)} vs A
                  </div>
                )}
              </div>
              <div>
                <div className="text-[11px] cx-text-secondary">Headcount al cierre</div>
                <div className="cx-kpi-sm">
                  {k.headcount_cierre ?? '—'}
                </div>
                {k.headcount_delta_mom != null && (
                  <div className="text-[11px] cx-text-secondary">
                    {k.headcount_delta_mom > 0 ? '+' : ''}{k.headcount_delta_mom} MoM
                  </div>
                )}
              </div>

              <div>
                <div className="text-[11px] cx-text-secondary">Costo prom./persona</div>
                <div className="text-base font-semibold tabular-nums cx-text-primary">
                  {formatCLP(k.costo_promedio_persona)}
                </div>
                {dProm !== null && (
                  <div className={`text-[11px] ${colorVariacion(dProm)}`}>
                    {formatPct(dProm)} vs A
                  </div>
                )}
              </div>
              <div>
                <div className="text-[11px] cx-text-secondary">MoM · YoY</div>
                <div className="text-[12px]">
                  <span className={colorVariacion(k.mom?.valor_pct)}>{formatPct(k.mom?.valor_pct)}</span>
                  <span className="cx-text-secondary"> · </span>
                  <span className={colorVariacion(k.yoy?.valor_pct)}>{formatPct(k.yoy?.valor_pct)}</span>
                </div>
              </div>
            </div>

            {k.banner && (
              <div className="mt-2 text-[11px] cx-banner rounded px-2 py-1">
                {k.banner}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
