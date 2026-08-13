import { getAuthHeaders } from "./auth";

const API_URL = "/api/v1";

const request = async (path, options = {}) => {
  const response = await fetch(`${API_URL}/creditos${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...getAuthHeaders(), ...options.headers },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Error en la operación de créditos");
  }
  return response.status === 204 ? null : response.json();
};

export const listarCreditos = () => request("/");

export const buscarTrabajadores = (q) =>
  request(`/catalogo/trabajadores?q=${encodeURIComponent(q)}`);

export const crearCredito = (data) =>
  request("/", { method: "POST", body: JSON.stringify(data) });

export const eliminarCredito = (id) => request(`/${id}`, { method: "DELETE" });

export const subirDocumento = (id) => request(`/${id}/documento`, { method: "POST" });

export const iniciarFirma = (id) => request(`/${id}/firma`, { method: "POST" });

export const verificarFirma = (id) => request(`/${id}/firma`);

export const crearCreditoBuk = (id) => request(`/${id}/credito-buk`, { method: "POST" });

export const verificarCreditoBuk = (id) => request(`/${id}/credito-buk`);

// El PDF necesita el token en el header, así que se descarga como blob y se abre.
export const abrirPagare = async (id) => {
  const response = await fetch(`${API_URL}/creditos/${id}/pagare`, { headers: getAuthHeaders() });
  if (!response.ok) throw new Error("No se pudo generar el pagaré");
  const url = URL.createObjectURL(await response.blob());
  window.open(url, "_blank");
};
