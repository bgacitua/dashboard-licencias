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

  getSalaryHistory: async (rut, terminationDate) => {
    // 1. Clean RUT (remove dots and hyphens)
    const cleanRut = rut.replace(/\./g, "").replace(/-/g, "").trim();

    // 2. Convert termination date (YYYY-MM-DD) to DD-MM-YYYY for the backend
    // The backend uses this date to anchor the 48-month window
    let startParam = "";
    if (terminationDate) {
      const [year, month, day] = terminationDate.split("-");
      startParam = `${day}-${month}-${year}`; // DD-MM-YYYY
    } else {
      // Fallback: use today's date
      const today = new Date();
      const day = String(today.getDate()).padStart(2, "0");
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const year = today.getFullYear();
      startParam = `${day}-${month}-${year}`;
    }

    // 3. Call API - the backend computes the 48-month window from this date
    const response = await axios.get(`${API_URL}/${cleanRut}/salary-history`, {
      params: { start: startParam }
    });
    return response.data;
  },
};

export default EmployeesService;
