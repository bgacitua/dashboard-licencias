import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '../../calculadora/components/ui/button'
import { formatMoneda, formatMonedaCompact, formatMesAbrev } from '../lib/formatters'
import { SLOT_COLORS } from '../lib/useCompareSlots'

/**
 * Gráfico comparativo: una línea por slot, con toggle entre
 * "Costo total mensual" y "Costo prom./persona".
 *
 * Espera `resultados`: [{ slot_id, label, serie: [{pay_period, costo, headcount}] }]
 */
export function CompareChart({ resultados, pais = 'chile' }) {
  const [metric, setMetric] = useState('costo')   // 'costo' | 'prom'

  // Combina las series por pay_period en un único dataset:
  // [{ pay_period, A: 123, B: 456, ...}]
  const merged = useMemo(() => {
    const map = new Map()
    for (const r of resultados || []) {
      for (const p of r.serie || []) {
        const k = p.pay_period
        if (!map.has(k)) map.set(k, { pay_period: k })
        const valor = metric === 'costo'
          ? p.costo
          : (p.headcount > 0 ? p.costo / p.headcount : 0)
        map.get(k)[r.slot_id] = valor
      }
    }
    return [...map.values()].sort((a, b) =>
      String(a.pay_period).localeCompare(String(b.pay_period)),
    )
  }, [resultados, metric])

  if (!resultados?.length) return null

  return (
    <div className="cx-card p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold cx-text-primary">Tendencia comparada</h3>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={metric === 'costo' ? 'default' : 'outline'}
            onClick={() => setMetric('costo')}
            className="h-7 px-2 text-xs"
          >
            Costo total
          </Button>
          <Button
            type="button"
            size="sm"
            variant={metric === 'prom' ? 'default' : 'outline'}
            onClick={() => setMetric('prom')}
            className="h-7 px-2 text-xs"
          >
            Costo prom./persona
          </Button>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={merged} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
          <XAxis dataKey="pay_period" tickFormatter={formatMesAbrev} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} stroke="var(--border-color)" />
          <YAxis tickFormatter={(v) => formatMonedaCompact(v, pais)} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} stroke="var(--border-color)" />
          <Tooltip
            formatter={(v) => formatMoneda(v, pais)}
            labelFormatter={(l) => formatMesAbrev(l)}
            contentStyle={{
              fontSize: 11,
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 8,
              color: 'var(--text-primary)',
            }}
            cursor={{ stroke: 'var(--border-color)' }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
          {resultados.map((r) => (
            <Line
              key={r.slot_id}
              type="monotone"
              dataKey={r.slot_id}
              name={`${r.slot_id} · ${r.label}`}
              stroke={SLOT_COLORS[r.slot_id]}
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
