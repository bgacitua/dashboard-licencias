// features/costos/lib/useCostosFilters.js
import { useCallback, useMemo, useState } from 'react'
import { defaultRange } from './periodPresets'

const initial = () => {
  const r = defaultRange()
  return {
    fecha_inicio: r.fecha_inicio,
    fecha_fin: r.fecha_fin,
    empresas: [],
    areas: [],
    subareas: [],
    centros_costo: [],
    jefatura_rut: null,
    jefatura_label: null,        // sólo UI
    cargo: null,
    persona_rut: null,
    persona_label: null,         // sólo UI
    conceptos: [],               // [] = todos
  }
}

export function useCostosFilters() {
  const [filtros, setFiltrosState] = useState(initial)

  const setFiltros = useCallback((updater) => {
    setFiltrosState((prev) => (typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }))
  }, [])

  const reset = useCallback(() => setFiltrosState(initial()), [])

  // payload para el backend (sólo campos relevantes; sin labels de UI; listas vacías → null)
  const payload = useMemo(() => {
    const empty = (arr) => (Array.isArray(arr) && arr.length === 0 ? null : arr)
    return {
      fecha_inicio: filtros.fecha_inicio,
      fecha_fin: filtros.fecha_fin,
      empresas: empty(filtros.empresas),
      areas: empty(filtros.areas),
      subareas: empty(filtros.subareas),
      centros_costo: empty(filtros.centros_costo),
      jefatura_rut: filtros.jefatura_rut || null,
      cargo: filtros.cargo || null,
      persona_rut: filtros.persona_rut || null,
      conceptos: empty(filtros.conceptos),
    }
  }, [filtros])

  return { filtros, setFiltros, reset, payload }
}
