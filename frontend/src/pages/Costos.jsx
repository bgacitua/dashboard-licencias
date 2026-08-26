import { useEffect, useMemo, useState } from 'react'
import SidebarLayout from '../components/SidebarLayout'
import { Wallet, Moon, Sun } from 'lucide-react'

import { useCostosFilters } from '../features/costos/lib/useCostosFilters'
import { useViewportRules } from '../features/costos/lib/useViewportRules'
import { useCompareSlots } from '../features/costos/lib/useCompareSlots'
import { useDarkMode } from '../features/calculadora/lib/hooks'
import { FiltersBar } from '../features/costos/components/FiltersBar'
import { MultiSelectDropdown } from '../features/costos/components/MultiSelectDropdown'
import { CostoTotalCard } from '../features/costos/components/CostoTotalCard'
import { KpiSimpleCard } from '../features/costos/components/KpiSimpleCard'
import { TrendChart } from '../features/costos/components/TrendChart'
import { TrendSparkline } from '../features/costos/components/TrendSparkline'
import { HistoricalContext } from '../features/costos/components/HistoricalContext'
import { HierarchyTreemap } from '../features/costos/components/HierarchyTreemap'
import { TopJefaturasTable } from '../features/costos/components/TopJefaturasTable'
import { EmptyStateBanner } from '../features/costos/components/EmptyStateBanner'
import { CompareSlotsPanel } from '../features/costos/components/CompareSlotsPanel'
import { CompareCards } from '../features/costos/components/CompareCards'
import { CompareChart } from '../features/costos/components/CompareChart'
import { formatMesAbrev } from '../features/costos/lib/formatters'
import CostosService from '../services/costos.service'
import '../features/costos/costos.css'

export default function Costos() {
  const { filtros, setFiltros, setPais, reset, payload } = useCostosFilters()
  const rules = useViewportRules(filtros)
  const { slots, add: addSlot, remove: removeSlot, clear: clearSlots, nextLetter, canAdd } = useCompareSlots()
  const { darkMode, toggleDarkMode } = useDarkMode()
  const isComparing = slots.length > 0

  const [conceptos, setConceptos] = useState([])
  const [kpis, setKpis] = useState(null)
  const [tendencia, setTendencia] = useState([])
  const [historico, setHistorico] = useState([])
  const [jerarquia, setJerarquia] = useState([])
  const [topItems, setTopItems] = useState([])
  const [compareResult, setCompareResult] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    CostosService.getConceptos(filtros.pais)
      .then((d) => { if (!cancelled) setConceptos(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [filtros.pais])

  // Cambiar de país: se descartan los resultados del país anterior para no
  // mostrar montos de un país con el símbolo del otro mientras carga.
  const cambiarPais = (p) => {
    if (p === filtros.pais) return
    clearSlots()
    setKpis(null)
    setTendencia([])
    setHistorico([])
    setJerarquia([])
    setTopItems([])
    setCompareResult([])
    setPais(p)
  }

  const payloadKey = useMemo(() => JSON.stringify(payload), [payload])
  const slotsKey = useMemo(() => JSON.stringify(slots), [slots])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    if (isComparing) {
      CostosService.comparar({
        pais: payload.pais,
        fecha_inicio: payload.fecha_inicio,
        fecha_fin: payload.fecha_fin,
        conceptos: payload.conceptos,
        slots: slots.map((s) => ({
          id: s.id,
          tipo: s.tipo,
          valor: s.valor,
          label: s.label,
        })),
      })
        .then((d) => { if (!cancelled) setCompareResult(d.slots || []) })
        .catch((err) => {
          if (cancelled) return
          setError(err?.response?.data?.detail || err.message || 'Error al comparar')
        })
        .finally(() => { if (!cancelled) setLoading(false) })

      return () => { cancelled = true }
    }

    const reqs = [CostosService.getKpis(payload)]
    reqs.push(rules.trendMode !== 'none'
      ? CostosService.getTendencia(payload)
      : Promise.resolve({ serie: [] }))
    reqs.push(rules.showHistorical
      ? CostosService.getHistoricoContexto(payload)
      : Promise.resolve({ serie: [] }))
    reqs.push(rules.showTreemap
      ? CostosService.getJerarquia(payload)
      : Promise.resolve({ nodos: [] }))
    reqs.push(rules.showTopJefaturas
      ? CostosService.getJefaturasTop(payload, rules.topLimit)
      : Promise.resolve({ items: [] }))

    Promise.all(reqs)
      .then(([k, t, h, j, top]) => {
        if (cancelled) return
        setKpis(k)
        setTendencia(t.serie || [])
        setHistorico(h.serie || [])
        setJerarquia(j.nodos || [])
        setTopItems(top.items || [])
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.response?.data?.detail || err.message || 'Error al cargar datos')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [payloadKey, slotsKey, isComparing, rules.trendMode, rules.showHistorical, rules.showTreemap, rules.showTopJefaturas, rules.topLimit])

  const subtitulo = `${formatMesAbrev(filtros.fecha_inicio)} → ${formatMesAbrev(filtros.fecha_fin)}`

  return (
    <SidebarLayout>
    <div className="costos-scope min-h-screen" data-theme={darkMode ? 'dark' : 'light'}>
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {/* Header del módulo */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2 cx-text-primary">
              <Wallet className="size-5 cx-text-secondary" />
              Costos por área y jefatura
            </h1>
            <p className="text-xs cx-text-secondary mt-1">
              Período: {subtitulo}
              {filtros.empresas?.length > 0 && ` · Empresas: ${filtros.empresas.join(', ')}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md overflow-hidden border cx-border">
            {[['chile', 'Chile'], ['peru', 'Perú']].map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                onClick={() => cambiarPais(valor)}
                aria-pressed={filtros.pais === valor}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filtros.pais === valor
                    ? 'bg-[var(--accent)] text-white'
                    : 'cx-text-secondary hover:cx-text-primary'
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={toggleDarkMode}
            className="cx-theme-btn"
            aria-label={darkMode ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          >
            {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
            <span>{darkMode ? 'Claro' : 'Oscuro'}</span>
          </button>
          </div>
        </div>

        <FiltersBar
          filtros={filtros}
          setFiltros={setFiltros}
          onReset={reset}
          disabled={isComparing}
        />

        {isComparing && (
          <div className="text-[11px] cx-text-muted -mt-2">
            Filtros organizacionales desactivados en modo comparación. Período y concepto sí aplican a todos los slots.
          </div>
        )}

        <CompareSlotsPanel
          pais={filtros.pais}
          slots={slots}
          onAdd={addSlot}
          onRemove={removeSlot}
          onClearAll={clearSlots}
          nextLetter={nextLetter}
          canAdd={canAdd}
        />

        <div className="flex flex-wrap items-center gap-3">
          <MultiSelectDropdown
            label="Concepto"
            options={conceptos}
            value={filtros.conceptos}
            onChange={(v) => setFiltros({ conceptos: v })}
            searchable
            width="w-[320px]"
          />
        </div>

        {error && <EmptyStateBanner message={`Error: ${error}`} />}

        {isComparing && (
          <>
            <CompareCards resultados={compareResult} onRemove={removeSlot} pais={filtros.pais} />
            <CompareChart resultados={compareResult} pais={filtros.pais} />
            {loading && <div className="text-xs cx-text-muted">Cargando…</div>}
          </>
        )}

        {!isComparing && (
        <>
        {kpis?.banner && <EmptyStateBanner message={kpis.banner} />}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <CostoTotalCard kpis={kpis} className="md:col-span-2" pais={filtros.pais} />
          <KpiSimpleCard
            label="Headcount al cierre"
            value={kpis?.headcount_cierre}
            delta={kpis?.headcount_delta_mom}
            sub={kpis?.mom?.mes_comparacion ? `vs ${kpis.mom.mes_comparacion}` : ''}
          />
          <KpiSimpleCard
            label="Costo prom./persona"
            value={kpis?.costo_promedio_persona}
            isCurrency
            pais={filtros.pais}
            sub={kpis?.costo_mensual?.etiqueta ? `Mensual · ${kpis.costo_mensual.etiqueta}` : ''}
          />
        </div>

        {rules.trendMode === 'full' && tendencia.length > 0 && (
          <TrendChart data={tendencia} pais={filtros.pais} />
        )}
        {rules.trendMode === 'sparkline' && tendencia.length > 0 && (
          <TrendSparkline data={tendencia} pais={filtros.pais} />
        )}
        {rules.showHistorical && historico.length > 0 && (
          <HistoricalContext data={historico} pais={filtros.pais} />
        )}

        {rules.showTreemap && jerarquia.length > 0 && (
          <HierarchyTreemap
            pais={filtros.pais}
            nodos={jerarquia}
            onSelectArea={({ empresa, area }) =>
              setFiltros({ empresas: [empresa], areas: [area] })
            }
          />
        )}

        {rules.showTopJefaturas && (
          <TopJefaturasTable
            pais={filtros.pais}
            items={topItems}
            onSelectJefatura={(it) => {
              if (!it?.jefatura_rut) return
              setFiltros({
                jefatura_rut: it.jefatura_rut,
                jefatura_label: it.jefatura_nombre,
              })
            }}
          />
        )}

        {loading && <div className="text-xs cx-text-muted">Cargando…</div>}
        </>
        )}
      </main>
    </div>
    </SidebarLayout>
  )
}
