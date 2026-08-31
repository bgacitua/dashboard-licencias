import { getAuthHeaders } from "./auth";

const API_URL = "/api/v1";

export const getSeguimientoRetorno = async (dias = 7) => {
  const response = await fetch(`${API_URL}/retorno/seguimiento?dias=${dias}`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error("Error al obtener seguimiento de retorno");
  return response.json();
};

export const enviarAlertaRetorno = async (recipientEmail, dias = 7) => {
  const params = new URLSearchParams({ recipient_email: recipientEmail, dias });
  const response = await fetch(`${API_URL}/retorno/enviar-alerta?${params}`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Error al enviar alerta de retorno");
  }
  return response.json();
};
