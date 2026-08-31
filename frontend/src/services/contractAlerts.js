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

// `days` debe ser el mismo override con que se listó: si no, el backend recalcula
// su propio rango y puede no encontrar las alertas que están en pantalla.
export const sendContractAlerts = async (bosses, days = null) => {
  try {
    const response = await axios.post(`${API_URL}/contract-alerts/send`, {
      bosses,
      days,
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
      { headers: getAuthHeaders(), timeout: 120000 } // el scraper abre un navegador
    );
    return response.data;
  } catch (error) {
    console.error("Error al sincronizar con BUK:", error);
    throw error;
  }
};

/**
 * Abre el consentimiento de Microsoft para autorizar el envío de correos.
 *
 * El endpoint exige sesión y rol, así que no se puede entrar con un <a href>:
 * hay que pedir la URL con el header Authorization y recién ahí navegar. La
 * ventana se abre ANTES del await porque si no el navegador la bloquea, al
 * dejar de ser una acción directa del usuario.
 */
export const abrirAutorizacionMicrosoft = async () => {
  const ventana = window.open("", "_blank", "noopener,noreferrer");
  try {
    const { data } = await axios.get(`${API_URL}/contract-alerts/auth/login`);
    if (ventana) ventana.location = data.auth_url;
    else window.location.assign(data.auth_url); // popups bloqueados: misma pestaña
  } catch (error) {
    if (ventana) ventana.close();
    console.error("Error al iniciar la autorización de Microsoft:", error);
    throw new Error(
      error.response?.status === 403
        ? "No tienes permisos para autorizar el envío de correos."
        : "No se pudo iniciar la autorización de Microsoft.",
    );
  }
};
