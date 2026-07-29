import axios from "axios";
import { getToken } from "./auth";

const API_URL = "/api/v1/finiquitos";

const authHeaders = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const FiniquitosService = {
  getTrabajadoresGeneral: async () => {
    const response = await axios.get(`${API_URL}/`);
    return response.data;
  },

  getItemsByRut: async (rut, limit = 15) => {
    const response = await axios.get(`${API_URL}/${rut}`, {
      params: { limit },
    });
    return response.data;
  },

  getItemsTresMeses: async () => {
    const response = await axios.get(`${API_URL}/meses-anteriores`);
    return response.data;
  },

  getDescuentosByRut: async (rut) => {
    const response = await axios.get(`${API_URL}/${rut}/descuentos`);
    return response.data;
  },

  // --- Estado del proceso de desvinculación ---

  // Devuelve null si aún no hay proceso guardado (404), en vez de reventar.
  getProceso: async (rut) => {
    try {
      const response = await axios.get(`${API_URL}/${rut}/proceso`, {
        headers: authHeaders(),
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  },

  // `total` se manda solo al generar la carta: omitirlo conserva el monto congelado.
  guardarProceso: async (rut, { causal, fechaTermino, payload, total }) => {
    const response = await axios.put(
      `${API_URL}/${rut}/proceso`,
      {
        causal,
        fecha_termino: fechaTermino || null,
        payload_json: payload,
        total_finiquito: total ?? null,
      },
      { headers: authHeaders() },
    );
    return response.data;
  },

  // hito: 'carta' | 'finiquito' | 'correo'
  marcarHito: async (rut, hito) => {
    const response = await axios.post(
      `${API_URL}/${rut}/proceso/hito`,
      { hito },
      { headers: authHeaders() },
    );
    return response.data;
  },

  getIndicatorUF: async () => {
    try {
      const response = await axios.get("https://mindicador.cl/api/uf");
      // mindicador return { serie: [ { fecha, valor } ... ] } usually, or just root object depending on endpoint
      // for /api/uf it returns object with serie array. The first one is today (or recent).
      // Actually standard mindicador /api/uf returns: { ... serie: [{fecha, valor}, ...] }
      if (response.data && response.data.serie && response.data.serie.length > 0) {
        return response.data.serie[0].valor;
      }
      return null;
    } catch (error) {
      console.error("Error fetching UF:", error);
      return null;
    }
  },
};

export default FiniquitosService;
