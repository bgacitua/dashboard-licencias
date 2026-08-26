import axios from 'axios'
import { getToken } from './auth'

const API_URL = '/api/v1/calculadora'

const authHeaders = () => {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const CalculadoraService = {
  /**
   * Obtiene la configuración del país (UF, dólar, AFP, tasas, tax_brackets, bonos).
   * @param {'chile'|'peru'|'brasil'} pais
   * @returns {Promise<{
   *   afpData: Record<string, number>,
   *   ufValue: number,
   *   dolarValue: number,
   *   taxBrackets: Array,
   *   bonosAnualesUF: { navidad: number, fiestaPatrias: number, escolaridad: number },
   *   bonosEmpresa: Array,
   *   tasas: object,
   *   _meta: { pais: string, warnings: string[], updated_at: string|null }
   * }>}
   */
  getCountryConfig: async (pais) => {
    const response = await axios.get(`${API_URL}/config/${pais}`, {
      headers: authHeaders(),
    })
    return response.data
  },

  /**
   * Perú: asignación familiar + canasta navideña (anual). Los factores salen de
   * calculadora.country_config.tasas.
   *
   * El reparto de utilidades está EN PAUSA: el backend lo devuelve en 0 y
   * renta_imponible_proyectada / porcentaje_utilidades viajan en 0.
   * @param {{
   *   sueldo_base_calculado: number,
   *   renta_imponible_proyectada: number,
   *   porcentaje_utilidades: number,
   *   tiene_asignacion_familiar: boolean
   * }} payload
   * @param {AbortSignal} [signal]
   */
  getProyeccionUtilidadesPeru: async (payload, signal) => {
    const response = await axios.post(`${API_URL}/peru/utilidades/proyeccion`, payload, {
      headers: authHeaders(),
      signal,
    })
    return response.data
  },
}

export default CalculadoraService
