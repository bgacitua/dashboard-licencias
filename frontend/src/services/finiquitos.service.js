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
};

export default FiniquitosService;
