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

  getSalaryHistory: async (rut, months = 48) => {
    // 1. Clean RUT (remove dots and hyphens)
    const cleanRut = rut.replace(/\./g, "").replace(/-/g, "").trim();
    
    // 2. Calculate Start Date (DD-MM-YYYY)
    const date = new Date();
    date.setMonth(date.getMonth() - months);
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const startObj = `${day}-${month}-${year}`;

    // 3. Call API with start param
    const response = await axios.get(`${API_URL}/${cleanRut}/salary-history`, {
      params: { start: startObj }
    });
    return response.data;
  },
};

export default EmployeesService;
