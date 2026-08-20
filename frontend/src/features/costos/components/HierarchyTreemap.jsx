import { useMemo } from 'react'
import { ResponsiveContainer, Tooltip, Treemap } from 'recharts'
import { formatCLP, formatCLPCompact } from '../lib/formatters'

// Paleta deterministica por empresa: acentos calidos, mismo peso visual.
const PALETTE = [
  '#B4291F', '#986718', '#4F6F37', '#8A5A3C',
  '#C73F31', '#6F5340', '#7A5314', '#3F592C',
]

function hashString(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function colorFor(empresa) {
  if (!empresa) return '#837B6D'
  return PALETTE[hashString(empresa) % PALETTE.length]
}

function buildTree(nodos) {
  const empresas = new Map()
  for (const n of nodos) {
    if (!n.costo || n.costo <= 0) continue
    const empresaKey = n.empresa || '(Sin empresa)'
    if (!empresas.has(empresaKey)) {
      empresas.set(empresaKey, { name: empresaKey, color: colorFor(empresaKey), children: new Map() })
    }
    const empresa = empresas.get(empresaKey)
    const areaKey = n.area || '(Sin área)'
    if (!empresa.children.has(areaKey)) {
      empresa.children.set(areaKey, { name: areaKey, color: empresa.color, children: [] })
    }
    empresa.children.get(areaKey).children.push({
      name: n.centro_costo || '(Sin CC)',
      size: n.costo,
      color: empresa.color,
      headcount: n.headcount,
      empresa: empresaKey,
      area: areaKey,
    })
  }

  return [...empresas.values()].map((e) => ({
    name: e.name,
    color: e.color,
    children: [...e.children.values()],
  }))
}

function CustomNode(props) {
  const { x, y, width, height, name, color, depth, size } = props
  if (depth === 0 || width <= 0 || height <= 0) return null

  const showLabel = depth >= 2 && width > 60 && height > 28
  const showAmount = depth >= 2 && width > 80 && height > 44

  // Borde fino con `var(--bg-base)` para separar claramente cada centro de costo.
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: color || '#B4291F',
          stroke: 'var(--bg-base)',
          strokeWidth: depth === 1 ? 2 : 1,
          opacity: depth === 1 ? 0.55 : 0.92,
        }}
      />
      {showLabel && (
        <text x={x + 8} y={y + 16} fontSize={11} fontWeight={500} fill="#FFFFFF" style={{ pointerEvents: 'none' }}>
          {name}
        </text>
      )}
      {showAmount && size != null && (
        <text x={x + 8} y={y + 32} fontSize={11} fill="#FFFFFF" opacity={0.85} style={{ pointerEvents: 'none' }}>
          {formatCLPCompact(size)}
        </text>
      )}
    </g>
  )
}

function TreemapTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  if (p.children) {
    return (
      <div className="cx-card p-2.5 text-xs">
        <div className="font-semibold cx-text-primary">{p.name}</div>
      </div>
    )
  }
  return (
    <div className="cx-card p-2.5 text-xs">
      <div className="font-semibold cx-text-primary">{p.name}</div>
      <div className="cx-text-muted">{p.empresa} · {p.area}</div>
      <div className="mt-1 cx-text-secondary">Costo: <span className="cx-text-primary tabular-nums font-medium">{formatCLP(p.size)}</span></div>
      {p.headcount != null && <div className="cx-text-secondary">HC: <span className="cx-text-primary tabular-nums font-medium">{p.headcount}</span></div>}
    </div>
  )
}

export function HierarchyTreemap({ nodos = [], onSelectArea }) {
  const data = useMemo(() => buildTree(nodos), [nodos])

  const hojasTotales = useMemo(
    () => data.reduce((acc, e) => acc + e.children.reduce((a, ar) => a + ar.children.length, 0), 0),
    [data],
  )

  if (data.length === 0 || hojasTotales <= 1) return null

  return (
    <div className="cx-card p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold cx-text-primary">Distribución empresa → área → centro de costo</h3>
        <span className="text-[11px] cx-text-muted">tamaño = costo del período</span>
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <Treemap
          data={data}
          dataKey="size"
          stroke="var(--bg-base)"
          aspectRatio={4 / 3}
          content={<CustomNode />}
          isAnimationActive={false}
          onClick={(node) => {
            if (!node?.payload) return
            const p = node.payload
            if (onSelectArea && p.empresa && p.area) {
              onSelectArea({ empresa: p.empresa, area: p.area })
            }
          }}
        >
          <Tooltip content={<TreemapTooltip />} />
        </Treemap>
      </ResponsiveContainer>
    </div>
  )
}
