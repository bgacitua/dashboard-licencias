import axios from "axios";

const API_URL = "http://localhost:8000/api/v1/employees";

const EmployeesService = {
  getVacationsAvailable: async (rut) => {
    const response = await axios.get(`${API_URL}/${rut}/vacations-available`);
    return response.data;
  },

  getSueldoBase: async (rut) => {
    const response = await axios.get(`${API_URL}/${rut}`);
    return response.data;
  },
};

export default EmployeesService;
