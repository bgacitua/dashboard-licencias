/**
 * Servicio del módulo de tickets.
 *
 * Dos sesiones que no se mezclan: el portal usa su propio token (tk_token),
 * el panel usa el de la plataforma (getAuthHeaders). El token del portal no
 * sirve contra la plataforma ni al revés.
 */
import { getAuthHeaders } from '../../../services/auth';

const BASE = '/api/v1/tickets';
const CLAVE = 'tk_token';

// localStorage puede tirar en modo privado o con el storage bloqueado.
export const tokenPortal = {
    get: () => { try { return localStorage.getItem(CLAVE); } catch { return null; } },
    set: (t) => { try { localStorage.setItem(CLAVE, t); } catch { /* sin storage: sesión de una pestaña */ } },
    borrar: () => { try { localStorage.removeItem(CLAVE); } catch { /* nada que borrar */ } },
};

export class SesionVencida extends Error {}

const json = async (response) => {
    if (!response.ok) {
        const detalle = await response.json().catch(() => ({}));
        const msg = typeof detalle.detail === 'string' ? detalle.detail : 'Error de comunicación con el servidor.';
        if (response.status === 401) throw new SesionVencida(msg);
        throw new Error(msg);
    }
    return response.status === 204 ? null : response.json();
};

// === Portal ===

const portal = (path, { method = 'GET', body } = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    const t = tokenPortal.get();
    if (t) headers.Authorization = `Bearer ${t}`;
    return fetch(`${BASE}/portal${path}`, { method, headers, body: body && JSON.stringify(body) }).then(json);
};

export const registrarse = (email, password) => portal('/registro', { method: 'POST', body: { email, password } });
export const ingresar = async (email, password) => {
    const s = await portal('/login', { method: 'POST', body: { email, password } });
    tokenPortal.set(s.token);
    return s;
};
export const yo = () => portal('/me');
export const cambiarClave = (actual, nueva) => portal('/password', { method: 'POST', body: { actual, nueva } });
export const tiposPortal = () => portal('/tipos');
export const misTickets = () => portal('/tickets');
export const miTicket = (id) => portal(`/tickets/${id}`);
export const crearTicket = (datos) => portal('/tickets', { method: 'POST', body: datos });
export const editarTicket = (id, datos) => portal(`/tickets/${id}`, { method: 'PUT', body: datos });
export const comentarTicket = (id, texto) => portal(`/tickets/${id}/comentarios`, { method: 'POST', body: { texto } });

// === Panel ===

const admin = (path, { method = 'GET', body } = {}) =>
    fetch(`${BASE}/admin${path}`, { method, headers: getAuthHeaders(), body: body && JSON.stringify(body) }).then(json);

export const listarTickets = (filtros = {}) => {
    const qs = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v !== '' && v != null));
    return admin(`/tickets?${qs}`);
};
export const verTicket = (id) => admin(`/tickets/${id}`);
export const cambiarEstado = (id, estado, comentario) =>
    admin(`/tickets/${id}/estado`, { method: 'POST', body: { estado, comentario } });
export const comentarAdmin = (id, texto) => admin(`/tickets/${id}/comentarios`, { method: 'POST', body: { texto } });

export const listarTipos = () => admin('/tipos');
export const crearTipo = (datos) => admin('/tipos', { method: 'POST', body: datos });
export const actualizarTipo = (id, datos) => admin(`/tipos/${id}`, { method: 'PUT', body: datos });
export const eliminarTipo = (id) => admin(`/tipos/${id}`, { method: 'DELETE' });

export const subirImagen = async (archivo) => {
    const form = new FormData();
    form.append('archivo', archivo);
    // Sin Content-Type: el navegador pone el boundary del multipart.
    const { 'Content-Type': _, ...headers } = getAuthHeaders();
    const r = await fetch(`${BASE}/admin/archivos`, { method: 'POST', headers, body: form }).then(json);
    return r.url;
};

export const listarUsuarios = () => admin('/usuarios');
export const estadoUsuario = (id, estado) => admin(`/usuarios/${id}`, { method: 'PATCH', body: { estado } });
export const resetUsuario = (id) => admin(`/usuarios/${id}/reset`, { method: 'POST' });

// === Formato compartido ===

export const ESTADOS = {
    pendiente: { label: 'Pendiente', clase: 'bg-amber-100 text-amber-800' },
    en_curso: { label: 'En curso', clase: 'bg-blue-100 text-blue-800' },
    rechazado: { label: 'Rechazado', clase: 'bg-red-100 text-red-800' },
    cerrado: { label: 'Cerrado', clase: 'bg-gray-200 text-gray-700' },
};

export const fechaCorta = (iso) =>
    iso ? new Date(`${iso}`.length === 10 ? `${iso}T12:00:00` : iso)
        .toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' }) : '—';

export const fechaHora = (iso) =>
    iso ? new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/** Plazo de un tipo para una fecha, igual que el backend (logica.calcular_plazo). */
export const plazoPara = (tipo, fechaIso) => {
    if (!tipo?.hora_limite || !fechaIso) return null;
    const [h, m] = String(tipo.hora_limite).split(':').map(Number);
    const d = new Date(`${fechaIso}T00:00:00`);
    d.setDate(d.getDate() - tipo.dias_anticipacion);
    d.setHours(h, m, 0, 0);
    // ponytail: usa la zona del navegador; el backend usa America/Santiago. Es
    // solo el aviso previo — el que decide es el backend.
    return d;
};
