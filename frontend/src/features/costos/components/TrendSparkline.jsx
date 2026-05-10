import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCLP, formatMesAbrev } from '../lib/formatters'

function MiniTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="cx-card p-2 text-[11px]">
      <div className="font-semibold cx-text-primary">{formatMesAbrev(label)}</div>
      <div className="cx-text-secondary tabular-nums">{formatCLP(payload[0].value)}</div>
    </div>
  )
}

export function TrendSparkline({ data = [], titulo = 'Tendencia mensual' }) {
  return (
    <div className="cx-card p-4">
      <div className="text-xs cx-text-secondary mb-1 uppercase tracking-wider font-medium">{titulo}</div>
      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <Tooltip content={<MiniTooltip />} cursor={{ stroke: 'var(--border-color)' }} />
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
