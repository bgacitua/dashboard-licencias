import axios from "axios";

// URL base de tu API (FastAPI)
// En desarrollo es localhost, en producción será la IP de tu servidor Linux
const API_URL = "http://localhost:8000/api/v1";

export const getLicencias = async () => {
  try {
    const response = await axios.get(`${API_URL}/licencias/`);
    return response.data;
  } catch (error) {
    console.error("Error al obtener licencias:", error);
    throw error;
  }
};

export const getLicenciasByRut = async (rut) => {
  try {
    const response = await axios.get(`${API_URL}/licencias/rut/${rut}`);
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
