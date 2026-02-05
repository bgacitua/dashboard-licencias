import axios from "axios";

const API_URL = "http://localhost:8000/api/v1/calculadora";

const CalculadoraService = {
  getParametros: async () => {
    const response = await axios.get(`${API_URL}/parametros`);
    return response.data;
  },

  getAfps: async () => {
    const response = await axios.get(`${API_URL}/afps`);
    return response.data;
  },

  calcularSueldoBase: async (datos) => {
    const response = await axios.post(`${API_URL}/calcular`, datos);
    return response.data;
  },

  simularLiquido: async (datos) => {
    const response = await axios.post(`${API_URL}/simular`, datos);
    return response.data;
  },
};

export default CalculadoraService;