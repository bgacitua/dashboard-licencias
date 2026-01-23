/**
 * Servicio de autenticación para comunicación con el backend.
 */

const API_URL = 'http://localhost:8000/api/v1';

/**
 * Almacena el token en localStorage
 */
const setToken = (token) => {
    localStorage.setItem('access_token', token);
};

/**
 * Obtiene el token de localStorage
 */
export const getToken = () => {
    return localStorage.getItem('access_token');
};

/**
 * Elimina el token de localStorage
 */
const clearToken = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('modules');
};

/**
 * Crea headers con autorización si hay token
 */
const getAuthHeaders = () => {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
};

/**
 * Inicia sesión con username y password.
 * @param {string} username 
 * @param {string} password 
 * @returns {Promise<{user: object, modules: array, access_token: string}>}
 */
export const login = async (username, password) => {
    // OAuth2 requiere form-data, no JSON
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Error al iniciar sesión');
    }

    const data = await response.json();
    
    // Guardar token y datos en localStorage
    setToken(data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('modules', JSON.stringify(data.modulos));

    return data;
};

/**
 * Cierra la sesión actual.
 */
export const logout = async () => {
    try {
        await fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            headers: getAuthHeaders(),
        });
    } catch (error) {
        // Ignorar errores de logout
    } finally {
        clearToken();
    }
};

/**
 * Obtiene información del usuario actual.
 * @returns {Promise<{user: object, modulos: array}>}
 */
export const getCurrentUser = async () => {
    const response = await fetch(`${API_URL}/auth/me`, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        if (response.status === 401) {
            clearToken();
            throw new Error('Sesión expirada');
        }
        throw new Error('Error al obtener usuario');
    }

    return response.json();
};

/**
 * Obtiene los módulos del usuario actual.
 * @returns {Promise<array>}
 */
export const getUserModules = async () => {
    const response = await fetch(`${API_URL}/auth/modules`, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        throw new Error('Error al obtener módulos');
    }

    return response.json();
};

/**
 * Verifica si hay una sesión activa.
 * @returns {boolean}
 */
export const isAuthenticated = () => {
    return !!getToken();
};

/**
 * Obtiene el usuario almacenado localmente.
 * @returns {object|null}
 */
export const getStoredUser = () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
};

/**
 * Obtiene los módulos almacenados localmente.
 * @returns {array}
 */
export const getStoredModules = () => {
    const modules = localStorage.getItem('modules');
    return modules ? JSON.parse(modules) : [];
};
