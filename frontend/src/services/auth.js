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
 * Paso 1 del login. Si el usuario tiene 2FA retorna { requires_2fa: true, pre_auth_token }.
 * Si no, almacena token y retorna datos completos.
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

    const data = await response.json();

    if (data.requires_2fa) {
        return data; // { requires_2fa: true, pre_auth_token }
    }

    setToken(data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('modules', JSON.stringify(data.modulos));
    return data;
};

/**
 * Paso 2: verifica código TOTP y completa el login.
 */
export const verify2FA = async (preAuthToken, code) => {
    const response = await fetch(`${API_URL}/auth/2fa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pre_auth_token: preAuthToken, code }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Código incorrecto');
    }

    const data = await response.json();
    setToken(data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('modules', JSON.stringify(data.modulos));
    return data;
};

/**
 * Setup obligatorio paso 1: inicializa 2FA con setup_token del login.
 * Retorna QR image y secret sin necesitar JWT completo.
 */
export const initialize2FA = async (setupToken) => {
    const response = await fetch(`${API_URL}/auth/2fa/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setup_token: setupToken }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Error al inicializar 2FA');
    }

    return response.json();
};

/**
 * Setup obligatorio paso 2: activa 2FA y retorna JWT completo.
 */
export const activate2FA = async (setupToken, code) => {
    const response = await fetch(`${API_URL}/auth/2fa/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setup_token: setupToken, code }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Código incorrecto');
    }

    const data = await response.json();
    setToken(data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('modules', JSON.stringify(data.modulos));
    return data;
};

/**
 * Inicia el proceso de reconfiguración de 2FA (usuario ya autenticado).
 */
export const setup2FA = async () => {
    const response = await fetch(`${API_URL}/auth/2fa/setup`, {
        method: 'POST',
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Error al configurar 2FA');
    }

    return response.json();
};

/**
 * Confirma el código TOTP para activar 2FA definitivamente.
 */
export const confirmSetup2FA = async (code) => {
    const response = await fetch(`${API_URL}/auth/2fa/verify-setup`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ code }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Código incorrecto');
    }

    return response.json();
};

/**
 * Desactiva 2FA. Requiere contraseña actual.
 */
export const disable2FA = async (password) => {
    const response = await fetch(`${API_URL}/auth/2fa/disable`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({ password }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Error al desactivar 2FA');
    }

    return response.json();
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
