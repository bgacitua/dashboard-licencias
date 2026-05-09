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
}

export default CalculadoraService
