import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatMoneda, formatMesAbrev } from '../lib/formatters'

function MiniTooltip({ active, payload, label, pais }) {
  if (!active || !payload?.length) return null
  return (
    <div className="cx-card p-2 text-[11px]">
      <div className="font-semibold cx-text-primary">{formatMesAbrev(label)}</div>
      <div className="cx-text-secondary tabular-nums">{formatMoneda(payload[0].value, pais)}</div>
    </div>
  )
}

export function TrendSparkline({ data = [], titulo = 'Tendencia mensual', pais = 'chile' }) {
  return (
    <div className="cx-card p-4">
      <div className="text-xs cx-text-secondary mb-1 uppercase tracking-wider font-medium">{titulo}</div>
      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <Tooltip content={<MiniTooltip pais={pais} />} cursor={{ stroke: 'var(--border-color)' }} />
          <Line
            type="monotone"
            dataKey="costo"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
