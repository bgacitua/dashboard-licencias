import { useCallback, useEffect, useState } from 'react'
import AsistenciaService from '../../services/asistencia.service'

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

  return { ...data, loading, error, recargar: cargar }
}

export function useObras() {
  const [obras, setObras] = useState([])
  useEffect(() => {
    // Fail-open: sin obras configuradas el selector queda vacío y no se filtra.
    AsistenciaService.getObras().then(setObras).catch(() => setObras([]))
  }, [])
  return obras
}
