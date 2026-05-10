// features/costos/lib/useViewportRules.js
// Implementa la matriz de visibilidad de §4.7.
//
// Jerarquía de filtros (ancho → fino): empresa → subárea → área → centro de costo.
import { useMemo } from 'react'
import { monthsInRange } from './periodPresets'

export function useViewportRules(filtros) {
  return useMemo(() => {
    const meses = monthsInRange(filtros.fecha_inicio, filtros.fecha_fin)

    const tienePersona = !!filtros.persona_rut
    const tieneJefatura = !!filtros.jefatura_rut
    const tieneCargo = !!filtros.cargo
    const tieneCC = (filtros.centros_costo?.length || 0) > 0
    const tieneArea = (filtros.areas?.length || 0) > 0
    const tieneSubarea = (filtros.subareas?.length || 0) > 0

    let trendMode = 'full'
    if (meses === 1) trendMode = 'none'
    else if (meses <= 3) trendMode = 'sparkline'

    // Treemap (empresa→área→CC): se oculta cuando se baja a área, CC o cualquier hoja.
    // Subárea sigue siendo nivel "amplio" → mantiene el treemap.
    const showTreemap = !tienePersona && !tieneJefatura && !tieneCargo && !tieneArea && !tieneCC

    // Top gastos: visible siempre EXCEPTO cuando se filtra por persona específica.
    // Para cargo/jefatura sigue teniendo sentido (ver desglose dentro del scope).
    const showTopJefaturas = !tienePersona

    return {
      meses,
      trendMode,
      showHistorical: meses === 1,
      showTreemap,
      showTopJefaturas,
      // Hint para limit dinámico: cuando es scope ancho → top 10; cuando es cargo/jefatura → top largo.
      topLimit: tieneCargo || tieneJefatura ? 200 : 10,
    }
  }, [filtros])
}
