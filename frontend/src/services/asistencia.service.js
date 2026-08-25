import axios from 'axios'
import { getToken } from './auth'

const API_URL = '/api/v1/asistencia'

const authHeaders = () => {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const qs = ({ desde, hasta, obraId }) => {
  const params = new URLSearchParams()
  if (desde) params.set('desde', desde)
  if (hasta) params.set('hasta', hasta)
  if (obraId) params.set('obra_id', obraId)
  const s = params.toString()
  return s ? `?${s}` : ''
}

const AsistenciaService = {
  getObras: async () => {
    const { data } = await axios.get(`${API_URL}/obras`, { headers: authHeaders() })
    return data
  },

  // Todas las vistas comparten forma de respuesta {rows, total, columns, descartados},
  // así que un solo getter sirve para las cuatro pestañas.
  getVista: async (vista, rango = {}) => {
    const { data } = await axios.get(`${API_URL}/${vista}${qs(rango)}`, {
      headers: authHeaders(),
    })
    return data
  },

  // Set de claves `rut|fecha` con marca en el reloj biométrico. Se pide el
  // rango completo de una vez: son pocas decenas de miles de claves y evita
  // una consulta por cada inasistencia.
  getMorphoMarcas: async ({ desde, hasta }) => {
    const { data } = await axios.get(`${API_URL}/morpho-marcas`, {
      headers: authHeaders(),
      params: { desde, hasta },
    })
    return new Set(data.busquedas)
  },

  // El CSV lo arma el backend (mismo filtro de recinto que la tabla). Se
  // descarga como blob para poder mandar el header de autorización.
  descargarCsv: async (rango = {}) => {
    const { data } = await axios.get(`${API_URL}/marcajes/export.csv${qs(rango)}`, {
      headers: authHeaders(),
      responseType: 'blob',
    })
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = 'asistencia.csv'
    a.click()
    URL.revokeObjectURL(url)
  },
}

export default AsistenciaService
