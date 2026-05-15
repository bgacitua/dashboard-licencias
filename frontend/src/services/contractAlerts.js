import axios from "axios";
import { getAuthHeaders } from "./auth";

const API_URL = "/api/v1";

export const getContractAlerts = async (days = null) => {
  try {
    const params = days ? { days } : {};
    const response = await axios.get(`${API_URL}/contract-alerts/`, { params });
    return response.data;
  } catch (error) {
    console.error("Error al obtener alertas de contratos:", error);
    throw error;
  }
};

export const getContractAlertsGrouped = async (days = null) => {
  try {
    const params = days ? { days } : {};
    const response = await axios.get(`${API_URL}/contract-alerts/grouped`, { params });
    return response.data;
  } catch (error) {
    console.error("Error al obtener alertas agrupadas:", error);
    throw error;
  }
};

export const getContractAlertStats = async (days = null) => {
  try {
    const params = days ? { days } : {};
    const response = await axios.get(`${API_URL}/contract-alerts/stats`, { params });
    return response.data;
  } catch (error) {
    console.error("Error al obtener estadísticas de alertas:", error);
    throw error;
  }
};

export const sendContractAlerts = async (bosses) => {
  try {
    const response = await axios.post(`${API_URL}/contract-alerts/send`, {
      bosses,
    });
    return response.data;
  } catch (error) {
    console.error("Error al enviar alertas:", error);
    throw error;
  }
};

export const getScheduleInfo = async () => {
  try {
    const response = await axios.get(`${API_URL}/contract-alerts/schedule-info`);
    return response.data;
  } catch (error) {
    console.error("Error al obtener info de programación:", error);
    throw error;
  }
};

export const getCalendario = async (year) => {
  try {
    const response = await axios.get(`${API_URL}/contract-alerts/calendario/${year}`);
    return response.data;
  } catch (error) {
    console.error("Error al obtener calendario:", error);
    throw error;
  }
};

export const saveCalendarioCierre = async (anio, mes, fecha_cierre) => {
  try {
    const response = await axios.post(`${API_URL}/contract-alerts/calendario`, {
      anio,
      mes,
      fecha_cierre,
    });
    return response.data;
  } catch (error) {
    console.error("Error al guardar cierre:", error);
    throw error;
  }
};

export const deleteCalendarioCierre = async (id) => {
  try {
    const response = await axios.delete(`${API_URL}/contract-alerts/calendario/${id}`);
    return response.data;
  } catch (error) {
    console.error("Error al eliminar cierre:", error);
    throw error;
  }
};

export const getTracking = async () => {
  try {
    const response = await axios.get(`${API_URL}/contract-alerts/tracking`, {
      headers: getAuthHeaders(),
    });
    return response.data;
  } catch (error) {
    console.error("Error al obtener seguimiento:", error);
    throw error;
  }
};

export const syncToBuk = async (trackingId) => {
  try {
    const response = await axios.post(
      `${API_URL}/contract-alerts/tracking/${trackingId}/sync-buk`,
      {},
      { headers: getAuthHeaders() }
    );
    return response.data;
  } catch (error) {
    console.error("Error al sincronizar con BUK:", error);
    throw error;
  }
};
