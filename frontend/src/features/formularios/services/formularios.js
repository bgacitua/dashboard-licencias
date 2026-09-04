/**
 * Servicio del módulo de formularios.
 *
 * Los endpoints bajo /publico van SIN cabecera de autenticación: quien abre el
 * formulario llega por un QR y no tiene sesión. Los de administración sí.
 */
import { getAuthHeaders } from '../../../services/auth';

const API_URL = '/api/v1';
const BASE = `${API_URL}/formularios`;

const json = async (response) => {
    if (!response.ok) {
        const detalle = await response.json().catch(() => ({}));
        throw new Error(detalle.detail || 'Error de comunicación con el servidor.');
    }
    return response.status === 204 ? null : response.json();
};

// === Público ===

export const validarRut = async (slug, rut) =>
    json(await fetch(`${BASE}/publico/validar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, rut }),
    }));

export const getFormularioPublico = async (slug, token) =>
    json(await fetch(`${BASE}/publico/f/${slug}?token=${encodeURIComponent(token)}`));

export const enviarRespuesta = async (slug, token, datos) =>
    json(await fetch(`${BASE}/publico/f/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, datos }),
    }));

// === Administración ===

export const listarFormularios = async () =>
    json(await fetch(`${BASE}/`, { headers: getAuthHeaders() }));

export const crearFormulario = async (datos) =>
    json(await fetch(`${BASE}/`, {
        method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(datos),
    }));

export const actualizarFormulario = async (id, datos) =>
    json(await fetch(`${BASE}/${id}`, {
        method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(datos),
    }));

export const eliminarFormulario = async (id) =>
    json(await fetch(`${BASE}/${id}`, { method: 'DELETE', headers: getAuthHeaders() }));

export const duplicarFormulario = async (id) =>
    json(await fetch(`${BASE}/${id}/duplicar`, { method: 'POST', headers: getAuthHeaders() }));

export const buscarPersonas = async (q) =>
    json(await fetch(`${BASE}/personas?q=${encodeURIComponent(q)}`, { headers: getAuthHeaders() }));

export const enviarFormulario = async (id, rut) =>
    json(await fetch(`${BASE}/${id}/enviar`, {
        method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ rut }),
    }));

export const listarRespuestas = async (id) =>
    json(await fetch(`${BASE}/${id}/respuestas`, { headers: getAuthHeaders() }));
