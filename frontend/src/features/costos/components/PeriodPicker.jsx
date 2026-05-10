import { Button } from '../../calculadora/components/ui/button'
import { PRESETS } from '../lib/periodPresets'
import { formatMesAbrev } from '../lib/formatters'

/**
 * Selector de período: presets rápidos + inputs de mes (type="month").
 *
 * Props:
 * - fecha_inicio, fecha_fin (YYYY-MM-DD)
 * - onChange({fecha_inicio, fecha_fin})
 * - disabled?
 */
export function PeriodPicker({ fecha_inicio, fecha_fin, onChange, disabled = false }) {
  const ymStart = fecha_inicio?.slice(0, 7) || ''
  const ymEnd = fecha_fin?.slice(0, 7) || ''

  const setMonthInicio = (ym) => {
    if (!ym) return
    const [y, m] = ym.split('-').map(Number)
    onChange({
      fecha_inicio: `${y}-${String(m).padStart(2, '0')}-01`,
      fecha_fin,
    })
  }

  const setMonthFin = (ym) => {
    if (!ym) return
    const [y, m] = ym.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    onChange({
      fecha_inicio,
      fecha_fin: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs cx-text-secondary">Período:</span>

      <input
        type="month"
        value={ymStart}
        disabled={disabled}
        onChange={(e) => setMonthInicio(e.target.value)}
        className="cx-input h-8 px-2.5 text-xs"
      />
      <span className="text-xs cx-text-secondary">a</span>
      <input
        type="month"
        value={ymEnd}
        disabled={disabled}
        onChange={(e) => setMonthFin(e.target.value)}
        className="cx-input h-8 px-2.5 text-xs"
      />

      <span className="hidden md:inline text-xs cx-text-secondary ml-1">
        ({formatMesAbrev(fecha_inicio)} → {formatMesAbrev(fecha_fin)})
      </span>

      <span className="mx-1 h-4 w-px" style={{ backgroundColor: 'var(--border-color)' }} />

      {Object.entries(PRESETS).map(([k, p]) => (
        <Button
          key={k}
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => onChange(p.range())}
          className="h-7 px-2 text-xs"
        >
          {p.label}
        </Button>
      ))}
    </div>
  )
}
