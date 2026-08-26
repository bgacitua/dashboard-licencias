/**
 * Servicio de autenticación para comunicación con el backend.
 */

const API_URL = '/api/v1';

const setToken = (token) => {
    localStorage.setItem('access_token', token);
};

export const getToken = () => {
    return localStorage.getItem('access_token');
};

const clearToken = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('modules');
};

export const getAuthHeaders = () => {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
};

/**
 * Paso 1 del login. Si las credenciales son correctas devuelve
 * { requires_2fa: true, duo_auth_url } y el navegador debe redirigirse ahí.
 */
export const loginStep1 = async (username, password) => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Error al iniciar sesión');
    }

    return response.json(); // { requires_2fa: true, duo_auth_url }
};

/**
 * Paso 2: canjea el state + duo_code del redirect de Duo por el JWT de sesión.
 */
export const completeDuoLogin = async (state, duoCode) => {
    const response = await fetch(`${API_URL}/auth/duo/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, duo_code: duoCode }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'No se pudo completar la verificación');
    }

    const data = await response.json();
    setToken(data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('modules', JSON.stringify(data.modulos));
    return data;
};

export const logout = async () => {
    try {
        await fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            headers: getAuthHeaders(),
        });
    } catch (_) {
        // ignorar errores de logout
    } finally {
        clearToken();
    }
};

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

export const getUserModules = async () => {
    const response = await fetch(`${API_URL}/auth/modules`, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        throw new Error('Error al obtener módulos');
    }

    return response.json();
};

export const isAuthenticated = () => !!getToken();

export const getStoredUser = () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
};

export const getStoredModules = () => {
    const modules = localStorage.getItem('modules');
    return modules ? JSON.parse(modules) : [];
};

// Alias backward-compat para AuthContext
export const login = loginStep1;
