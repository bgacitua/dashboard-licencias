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
import { formatCLP, formatCLPCompact, formatMesAbrev } from '../lib/formatters'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  const c = payload.find((p) => p.dataKey === 'costo')
  const h = payload.find((p) => p.dataKey === 'headcount')
  return (
    <div className="cx-card p-2.5 text-xs">
      <div className="font-semibold mb-1 cx-text-primary">{formatMesAbrev(label)}</div>
      {c && <div className="cx-text-secondary">Costo: <span className="cx-text-primary tabular-nums font-medium">{formatCLP(c.value)}</span></div>}
      {h && <div className="cx-text-secondary">HC: <span className="cx-text-primary tabular-nums font-medium">{h.value}</span></div>}
    </div>
  )
}

export function TrendChart({ data = [], height = 280 }) {
  const serie = data.map((p) => ({
    pay_period: p.pay_period,
    costo: p.costo,
    headcount: p.headcount,
  }))

  return (
    <div className="cx-card p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold cx-text-primary">Tendencia mensual</h3>
        <span className="text-[11px] cx-text-muted">Costo total · headcount</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={serie} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
          <XAxis
            dataKey="pay_period"
            tickFormatter={formatMesAbrev}
            tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
            stroke="var(--border-color)"
          />
          <YAxis
            yAxisId="left"
            tickFormatter={formatCLPCompact}
            tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
            stroke="var(--border-color)"
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
            stroke="var(--border-color)"
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border-color)' }} />
          <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="costo"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 2, fill: 'var(--accent)' }}
            activeDot={{ r: 4, fill: 'var(--accent)' }}
            name="Costo"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="headcount"
            stroke="var(--success)"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={{ r: 2, fill: 'var(--success)' }}
            name="Headcount"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
