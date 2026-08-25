import { useCallback, useEffect, useState } from 'react'
import AsistenciaService from '../../services/asistencia.service'

/**
 * Carga una vista de asistencia.
 *
 * `vista` en null no consulta nada: las pestañas que traen sus propios datos
 * (Bono de asistencia) igual tienen que llamar al hook, porque no puede ser
 * condicional.
 */
export function useVista(vista, rango) {
  const [data, setData] = useState({ rows: [], columns: [], descartados: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const { desde, hasta, obraId } = rango

  const cargar = useCallback(async () => {
    if (!vista) {
      setLoading(false)
      return
    }
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

/**
 * Claves `rut|fecha` con marca en el reloj biométrico, o null si aún no llegan.
 *
 * Si el reloj registró una marca ese día, la inasistencia que reporta Buk es
 * dudosa. Fail-open: si Morpho no responde la tabla se muestra igual.
 */
export function useMorpho(desde, hasta, activo = true) {
  const [marcas, setMarcas] = useState(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!activo || !desde || !hasta) {
      setMarcas(null)
      return
    }
    let vigente = true
    setCargando(true)
    AsistenciaService.getMorphoMarcas({ desde, hasta })
      .then((s) => vigente && setMarcas(s))
      .catch(() => vigente && setMarcas(null))
      .finally(() => vigente && setCargando(false))
    return () => {
      vigente = false
    }
  }, [desde, hasta, activo])

  return { marcas, cargando }
}

export function useObras() {
  const [obras, setObras] = useState([])
  useEffect(() => {
    // Fail-open: sin obras configuradas el selector queda vacío y no se filtra.
    AsistenciaService.getObras().then(setObras).catch(() => setObras([]))
  }, [])
  return obras
}
