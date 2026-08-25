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
  // El reporte de atrasos viaja en el cuerpo ya parseado: el backend no lee
  // binarios. `jc` acota el reporte a los cargos y empresas de la lista JC.
  getReporteBono: async (params, atrasos) => {
    const { data } = await axios.post(
      `${API_URL}/reportes/bono`,
      { ...params, atrasos },
      { headers: authHeaders() }
    )
    return data
  },

  getReporteBonoHojas: async (params, atrasos, jc = false) => {
    const { data } = await axios.post(
      `${API_URL}/reportes/bono/hojas`,
      { ...params, jc, atrasos },
      { headers: authHeaders() }
    )
    return data
  },

  // Registro de marcas: única escritura del módulo. Con ASISTENCIA_DRY_RUN=true
  // el backend loguea el payload y no envía nada a Buk; la respuesta lo dice.
  registrarMarcas: async (obraId, marcas) => {
    const { data } = await axios.post(
      `${API_URL}/marcas`,
      { obra_id: obraId, marcas },
      { headers: authHeaders() }
    )
    return data
  },

  getMorphoMarcas: async ({ desde, hasta }) => {
    const { data } = await axios.get(`${API_URL}/morpho-marcas`, {
      headers: authHeaders(),
      params: { desde, hasta },
    })
    return new Set(data.busquedas)
  },
}

export default AsistenciaService
