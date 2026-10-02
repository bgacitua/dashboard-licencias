import axios from "axios";
import { getToken } from "./auth";

const API_URL = "/api/v1/finiquitos";

const authHeaders = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const FiniquitosService = {
  getTrabajadoresGeneral: async () => {
    const response = await axios.get(`${API_URL}/`);
    return response.data;
  },

  getItemsByRut: async (rut, limit = 15) => {
    const response = await axios.get(`${API_URL}/${rut}`, {
      params: { limit },
    });
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

  // --- Estado del proceso de desvinculación ---

  getProcesos: async () => {
    const response = await axios.get(`${API_URL}/procesos`, {
      headers: authHeaders(),
    });
    return response.data;
  },

  // Devuelve null si aún no hay proceso guardado (404), en vez de reventar.
  getProceso: async (rut) => {
    try {
      const response = await axios.get(`${API_URL}/${rut}/proceso`, {
        headers: authHeaders(),
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  },

  // `total` se manda solo al generar la carta: omitirlo conserva el monto congelado.
  guardarProceso: async (rut, { causal, fechaTermino, payload, total }) => {
    const response = await axios.put(
      `${API_URL}/${rut}/proceso`,
      {
        causal,
        fecha_termino: fechaTermino || null,
        payload_json: payload,
        total_finiquito: total ?? null,
      },
      { headers: authHeaders() },
    );
    return response.data;
  },

  // hito: 'carta' | 'finiquito' | 'correo'
  marcarHito: async (rut, hito) => {
    const response = await axios.post(
      `${API_URL}/${rut}/proceso/hito`,
      { hito },
      { headers: authHeaders() },
    );
    return response.data;
  },

  // motivo: 'renuncia' | 'desvinculacion'. Sella el hito 'correo' en el backend.
  enviarCorreoSalida: async (rut, { nombre, cargo, fechaSalida, motivo }) => {
    const response = await axios.post(
      `${API_URL}/${rut}/correo-salida`,
      {
        nombre_trabajador: nombre,
        cargo: cargo || null,
        fecha_salida: fechaSalida,
        motivo,
      },
      { headers: authHeaders() },
    );
    return response.data;
  },

  // Pasa por nuestro backend, que lo cachea una hora y corta a los 5 segundos.
  // Antes iba directo a mindicador.cl desde el navegador: cuando ese servicio
  // se caia, la pantalla de finiquitos esperaba 2 minutos y terminaba en 502.
  getIndicatorUF: async () => {
    try {
      const response = await axios.get(`${API_URL}/indicadores/uf`);
      return response.data?.valor ?? null;
    } catch (error) {
      // Sin UF se sigue: el formulario deja escribirla a mano.
      console.error("Error fetching UF:", error);
      return null;
    }
  },
};

export default FiniquitosService;
