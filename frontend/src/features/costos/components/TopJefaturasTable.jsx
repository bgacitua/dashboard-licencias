import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { formatMoneda } from '../lib/formatters'

export function TopJefaturasTable({ items = [], onSelectJefatura, pais = 'chile' }) {
  const [sort, setSort] = useState({ key: 'rank', dir: 'asc' })

  const sorted = useMemo(() => {
    const arr = [...items]
    arr.sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') {
        return sort.dir === 'asc' ? av - bv : bv - av
      }
      const sa = String(av)
      const sb = String(bv)
      return sort.dir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
    })
    return arr
  }, [items, sort])

  const toggleSort = (key) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'costo' ? 'desc' : 'asc' },
    )
  }

  const SortIcon = ({ col }) => {
    if (sort.key !== col) return <ChevronsUpDown className="size-3 opacity-40" />
    return sort.dir === 'asc'
      ? <ArrowUp className="size-3" />
      : <ArrowDown className="size-3" />
  }

  const Th = ({ col, children, className = '' }) => (
    <th className={`text-left px-3 py-2.5 ${className}`}>
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className="cx-th inline-flex items-center gap-1 hover:cx-text-primary transition-colors"
      >
        {children}
        <SortIcon col={col} />
      </button>
    </th>
  )

  if (items.length === 0) {
    return (
      <div className="cx-card p-5">
        <h3 className="text-sm font-semibold cx-text-primary">Top gastos</h3>
        <div className="text-xs cx-text-muted mt-1">Sin datos en el filtro actual.</div>
      </div>
    )
  }

  const enableScroll = sorted.length > 10

  return (
    <div className="cx-card p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold cx-text-primary">
          Top gastos · personas
          <span className="text-[11px] cx-text-muted font-normal ml-2">({sorted.length})</span>
        </h3>
        <span className="text-[11px] cx-text-muted">
          Click en una fila para filtrar por su jefatura
        </span>
      </div>

      <div className={`overflow-x-auto ${enableScroll ? 'max-h-[420px] overflow-y-auto' : ''}`}>
        <table className="w-full text-sm border-collapse">
          <thead className={`cx-border border-b ${enableScroll ? 'sticky top-0 cx-bg-card z-10' : ''}`}>
            <tr>
              <Th col="rank" className="w-12">#</Th>
              <Th col="full_name">Persona</Th>
              <Th col="cargo">Cargo</Th>
              <Th col="jefatura_nombre">Jefatura</Th>
              <Th col="costo" className="text-right">
                <span className="ml-auto">Costo período</span>
              </Th>
              <Th col="concepto_principal">Concepto principal</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((it) => {
              const clickable = !!(onSelectJefatura && it.jefatura_nombre)
              return (
                <tr
                  key={`${it.rank}-${it.rut || it.full_name}`}
                  onClick={() => clickable && onSelectJefatura(it)}
                  className={`cx-border border-b last:border-0 cx-row-hover ${clickable ? 'cursor-pointer' : ''}`}
                >
                  <td className="px-3 py-2.5 cx-text-muted text-xs tabular-nums">{it.rank}</td>
                  <td className="px-3 py-2.5 cx-text-primary font-medium text-[13px]">{it.full_name || '—'}</td>
                  <td className="px-3 py-2.5 cx-text-secondary text-xs">{it.cargo || '—'}</td>
                  <td className="px-3 py-2.5 cx-text-secondary text-xs">{it.jefatura_nombre || '—'}</td>
                  <td className="px-3 py-2.5 text-right cx-text-primary tabular-nums font-medium text-[13px]">{formatMoneda(it.costo, pais)}</td>
                  <td className="px-3 py-2.5 cx-text-muted text-xs">{it.concepto_principal || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
