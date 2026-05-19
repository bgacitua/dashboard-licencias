import axios from "axios";

const API_URL = "/api/v1";

export const getSeguimientoRetorno = async (dias = 7) => {
  try {
    const response = await axios.get(`${API_URL}/retorno/seguimiento?dias=${dias}`);
    return response.data;
  } catch (error) {
    console.error("Error al obtener seguimiento de retorno:", error);
    throw error;
  }
};

export const enviarAlertaRetorno = async (recipientEmail, dias = 7) => {
  try {
    const params = new URLSearchParams({ recipient_email: recipientEmail, dias });
    const response = await axios.post(`${API_URL}/retorno/enviar-alerta?${params}`);
    return response.data;
  } catch (error) {
    console.error("Error al enviar alerta de retorno:", error);
    throw error;
  }
};
