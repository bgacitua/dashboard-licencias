import axios from "axios";

// URL base de tu API (FastAPI)
// En desarrollo es localhost, en producción será la IP de tu servidor Linux
const API_URL = "/api/v1";

export const getLicencias = async () => {
  try {
    const response = await axios.get(`${API_URL}/licencias/`);
    return response.data;
  } catch (error) {
    console.error("Error al obtener licencias:", error);
    throw error;
  }
};

/**
 * @param {string} rut - RUT del empleado
 * @param {{ limit?: number, order?: 'asc'|'desc' }} [opts] - limit: 1-100 (default 15), order: 'asc' | 'desc' (default 'desc')
 */
export const getLicenciasByRut = async (rut, opts = {}) => {
  try {
    const { limit = 15, order = "desc" } = opts;
    const params = new URLSearchParams();
    if (limit != null) params.set("limit", String(limit));
    if (order) params.set("order", order);
    const qs = params.toString();
    const url = `${API_URL}/licencias/rut/${rut}${qs ? `?${qs}` : ""}`;
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("Error al obtener licencias por RUT:", error);
    throw error;
  }
};

export const getLicenciasVigentes = async () => {
  try {
    const response = await axios.get(`${API_URL}/licencias/vigentes`);
    return response.data;
  } catch (error) {
    console.error("Error al obtener licencias vigentes:", error);
    throw error;
  }
};

export const getLicenciasPorVencer = async (dias = 5) => {
  try {
    const response = await axios.get(
      `${API_URL}/licencias/por-vencer?dias=${dias}`,
    );
    return response.data;
  } catch (error) {
    console.error("Error al obtener licencias por vencer:", error);
    throw error;
  }
};

export const getLicenciasVencidasRecientes = async (dias = 5) => {
  try {
    const response = await axios.get(
      `${API_URL}/licencias/vencidas-recientes?dias=${dias}`,
    );
    return response.data;
  } catch (error) {
    console.error("Error al obtener licencias vencidas recientes:", error);
    throw error;
  }
};

export const crearLicencia = async (licencia) => {
  try {
    const response = await axios.post(`${API_URL}/licencias/`, licencia);
    return response.data;
  } catch (error) {
    console.error("Error al crear licencia:", error);
    throw error;
  }
};
