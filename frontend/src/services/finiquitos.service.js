import axios from "axios";

const API_URL = "http://localhost:8000/api/v1/finiquitos";

const FiniquitosService = {
  getTrabajadoresGeneral: async () => {
    const response = await axios.get(`${API_URL}/`);
    return response.data;
  },

  getItemsByRut: async (rut) => {
    const response = await axios.get(`${API_URL}/${rut}`);
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
