import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoneda, formatMonedaCompact, formatMesAbrev } from '../lib/formatters'

function CtxTooltip({ active, payload, label, pais }) {
  if (!active || !payload?.length) return null
  return (
    <div className="cx-card p-2.5 text-xs">
      <div className="font-semibold mb-1 cx-text-primary">{formatMesAbrev(label)}</div>
      <div className="cx-text-secondary">Costo: <span className="cx-text-primary tabular-nums font-medium">{formatMoneda(payload[0].value, pais)}</span></div>
    </div>
  )
}

export function HistoricalContext({ data = [], pais = 'chile' }) {
  return (
    <div className="cx-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold cx-text-primary">Histórico — últimos 12 meses</h3>
        <span className="text-[10px] uppercase tracking-wider cx-text-secondary cx-bg-input cx-border border rounded-full px-2 py-0.5">
          no afectado por filtro de mes
        </span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
          <XAxis dataKey="pay_period" tickFormatter={formatMesAbrev} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} stroke="var(--border-color)" />
          <YAxis tickFormatter={(v) => formatMonedaCompact(v, pais)} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} stroke="var(--border-color)" />
          <Tooltip content={<CtxTooltip pais={pais} />} cursor={{ stroke: 'var(--border-color)' }} />
          <Line
            type="monotone"
            dataKey="costo"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 2, fill: 'var(--accent)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
