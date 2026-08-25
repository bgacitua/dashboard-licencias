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

  // Manda correo real a la jefatura. EMAIL_TEST_REDIRECT en el backend lo
  // desvía a una casilla de prueba.
  notificarJefatura: async (obraId, avisos) => {
    const { data } = await axios.post(
      `${API_URL}/notificar-jefatura`,
      { obra_id: obraId, avisos },
      { headers: authHeaders() }
    )
    return data
  },

  getRespuestasJefatura: async ({ desde, hasta }) => {
    const { data } = await axios.get(`${API_URL}/respuestas-jefatura`, {
      headers: authHeaders(),
      params: { desde, hasta },
    })
    return { respuestas: data.respuestas, notificadas: new Set(data.notificadas) }
  },

  // Historial y operaciones de corrección: no tocan Buk.
  getHistorial: async ({ desde, hasta }) => {
    const { data } = await axios.get(`${API_URL}/historial`, {
      headers: authHeaders(),
      params: { desde, hasta },
    })
    return data
  },

  getOperaciones: async (obraId) => {
    const { data } = await axios.get(`${API_URL}/operaciones`, {
      headers: authHeaders(),
      params: obraId ? { obra_id: obraId } : {},
    })
    return data
  },

  getOperacion: async (id) => {
    const { data } = await axios.get(`${API_URL}/operaciones/${id}`, { headers: authHeaders() })
    return data
  },

  crearOperacion: async (payload) => {
    const { data } = await axios.post(`${API_URL}/operaciones`, payload, { headers: authHeaders() })
    return data
  },

  eliminarOperacion: (id) =>
    axios.delete(`${API_URL}/operaciones/${id}`, { headers: authHeaders() }),

  actualizarRegistros: (id, updates) =>
    axios.patch(`${API_URL}/operaciones/${id}/registros`, updates, { headers: authHeaders() }),

  getMorphoMarcas: async ({ desde, hasta }) => {
    const { data } = await axios.get(`${API_URL}/morpho-marcas`, {
      headers: authHeaders(),
      params: { desde, hasta },
    })
    return new Set(data.busquedas)
  },
}

export default AsistenciaService
