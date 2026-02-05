import axios from "axios";

const API_URL = "http://localhost:8000/api/v1";

export const getVacacionesActivas = async () => {
  try {
    const response = await axios.get(`${API_URL}/vacaciones`);
    return response.data;
  } catch (error) {
    console.error("Error al obtener vacaciones:", error);
    throw error;
  }
};

export default {
  getVacacionesActivas
};
