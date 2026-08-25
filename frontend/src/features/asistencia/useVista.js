import { useCallback, useEffect, useState } from 'react'
import AsistenciaService from '../../services/asistencia.service'
import { claveMorpho } from './marcas'

export const COL_MORPHO = '¿Marca Morpho?'

/** Carga una vista de asistencia y expone {data, loading, error, recargar}. */
export function useVista(vista, rango) {
  const [data, setData] = useState({ rows: [], columns: [], descartados: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const { desde, hasta, obraId } = rango

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await AsistenciaService.getVista(vista, { desde, hasta, obraId }))
    } catch (e) {
      const status = e?.response?.status
      setError(
        status === 503
          ? 'Módulo de asistencia sin configurar en el servidor.'
          : e?.response?.data?.detail || 'No se pudo cargar la información.'
      )
      setData({ rows: [], columns: [], descartados: 0 })
    } finally {
      setLoading(false)
    }
  }, [vista, desde, hasta, obraId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const marcas = useMorpho(vista === 'inasistencias' ? rango : null)

  if (marcas) {
    return {
      ...data,
      columns: [COL_MORPHO, ...data.columns],
      rows: data.rows.map((r) => ({
        ...r,
        [COL_MORPHO]: marcas.has(claveMorpho(r)) ? 'Sí marca' : 'Sin marca',
      })),
      loading,
      error,
      recargar: cargar,
    }
  }

  return { ...data, loading, error, recargar: cargar }
}

/**
 * Set de claves con marca en el reloj biométrico, o null si no aplica/falla.
 *
 * Solo lo usa Inasistencias: si el reloj registró una marca ese día, la
 * inasistencia que reporta Buk es dudosa. Fail-open — sin Morpho la tabla se
 * muestra igual, sin la columna.
 */
function useMorpho(rango) {
  const [marcas, setMarcas] = useState(null)
  const { desde, hasta } = rango || {}

  useEffect(() => {
    if (!desde || !hasta) {
      setMarcas(null)
      return
    }
    let vigente = true
    AsistenciaService.getMorphoMarcas({ desde, hasta })
      .then((s) => vigente && setMarcas(s))
      .catch(() => vigente && setMarcas(null))
    return () => {
      vigente = false
    }
  }, [desde, hasta])

  return marcas
}

export function useObras() {
  const [obras, setObras] = useState([])
  useEffect(() => {
    // Fail-open: sin obras configuradas el selector queda vacío y no se filtra.
    AsistenciaService.getObras().then(setObras).catch(() => setObras([]))
  }, [])
  return obras
}
