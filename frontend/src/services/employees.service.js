import axios from "axios";

const API_URL = "http://localhost:8000/api/v1/employees";

const EmployeesService = {
  getVacationsAvailable: async (rut, date = null) => {
    let url = `${API_URL}/${rut}/vacations-available`;
    if (date) {
      url += `?date=${date}`;
    }
    const response = await axios.get(url);
    return response.data;
  },

  getSueldoBase: async (rut) => {
    const response = await axios.get(`${API_URL}/${rut}`);
    return response.data;
  },

  getDescuentos: async (rut) => {
    const response = await axios.get(`${API_URL}/${rut}/payroll_detail`);
    return response.data;
  },
};

export default EmployeesService;
