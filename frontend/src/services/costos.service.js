import axios from 'axios'
import { getToken } from './auth'

const API_URL = '/api/v1/costos'

const authHeaders = () => {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const CostosService = {
  getDimensiones: async ({ empresas = [], areas = [], subareas = [], pais = 'chile' } = {}) => {
    const params = new URLSearchParams()
    params.set('pais', pais)
    empresas.forEach((v) => params.append('empresa', v))
    areas.forEach((v) => params.append('area', v))
    subareas.forEach((v) => params.append('subarea', v))
    const qs = params.toString()
    const { data } = await axios.get(`${API_URL}/dimensiones?${qs}`, {
      headers: authHeaders(),
    })
    return data
  },

  getIncomeTypes: async (pais = 'chile') => {
    const { data } = await axios.get(`${API_URL}/income-types`, {
      params: { pais },
      headers: authHeaders(),
    })
    return data
  },

  getConceptos: async (pais = 'chile') => {
    const { data } = await axios.get(`${API_URL}/conceptos`, {
      params: { pais },
      headers: authHeaders(),
    })
    return data
  },

  buscarPersonas: async (q, { pais = 'chile', limit = 20 } = {}) => {
    const { data } = await axios.get(`${API_URL}/personas/buscar`, {
      params: { q, limit, pais },
      headers: authHeaders(),
    })
    return data
  },

  buscarJefes: async (q, opts = {}) => {
    const { limit = 20, empresas = [], areas = [], subareas = [], pais = 'chile' } = opts
    const params = new URLSearchParams()
    params.set('q', q)
    params.set('limit', String(limit))
    params.set('pais', pais)
    empresas.forEach((v) => params.append('empresa', v))
    areas.forEach((v) => params.append('area', v))
    subareas.forEach((v) => params.append('subarea', v))
    const { data } = await axios.get(`${API_URL}/jefes/buscar?${params}`, {
      headers: authHeaders(),
    })
    return data
  },

  getKpis: async (filtros) => {
    const { data } = await axios.post(`${API_URL}/kpis`, filtros, { headers: authHeaders() })
    return data
  },

  getTendencia: async (filtros) => {
    const { data } = await axios.post(`${API_URL}/tendencia`, filtros, { headers: authHeaders() })
    return data
  },

  getHistoricoContexto: async (filtros) => {
    const { data } = await axios.post(`${API_URL}/historico-contexto`, filtros, {
      headers: authHeaders(),
    })
    return data
  },

  getJerarquia: async (filtros) => {
    const { data } = await axios.post(`${API_URL}/jerarquia`, filtros, { headers: authHeaders() })
    return data
  },

  getJefaturasTop: async (filtros, limit = 10) => {
    const { data } = await axios.post(`${API_URL}/jefaturas-top`, filtros, {
      params: { limit },
      headers: authHeaders(),
    })
    return data
  },

  comparar: async (body) => {
    const { data } = await axios.post(`${API_URL}/comparar`, body, { headers: authHeaders() })
    return data
  },
}

export default CostosService
