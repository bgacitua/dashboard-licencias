/**
 * Manda el JWT en toda llamada de axios, y limpia la sesión si el backend la rechaza.
 *
 * Va en un interceptor global y no servicio por servicio: así un archivo nuevo
 * queda autenticado sin que su autor tenga que acordarse. Los servicios que ya
 * arman sus propias cabeceras siguen funcionando; el interceptor solo rellena
 * Authorization cuando falta.
 */
import axios from "axios";
import { getToken } from "../services/auth";

axios.interceptors.request.use((config) => {
  const token = getToken();
  if (token && !config.headers?.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    // Token vencido o revocado: dejar la sesión limpia y mandar al login. Sin
    // esto la app queda mostrando errores sueltos en cada pantalla.
    if (error.response?.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("user");
      localStorage.removeItem("modules");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  },
);
