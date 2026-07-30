import { getAuthHeaders } from "./auth";

const API_URL = "/api/v1";

export const getResumenHorasExtras = async (weekStart) => {
  const params = weekStart ? `?week_start=${weekStart}` : "";
  const response = await fetch(`${API_URL}/overtime/summary${params}`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error("Error al obtener el consolidado de horas extras");
  return response.json();
};

export const enviarConsolidado = async (weekStart) => {
  const params = weekStart ? `?week_start=${weekStart}` : "";
  const response = await fetch(`${API_URL}/overtime/summary/send${params}`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Error al enviar el consolidado");
  }
  return response.json();
};

export const enviarSolicitudes = async () => {
  const response = await fetch(`${API_URL}/overtime/send-requests`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Error al enviar las solicitudes");
  }
  return response.json();
};
