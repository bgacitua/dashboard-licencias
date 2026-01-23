import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
    login as loginService, 
    logout as logoutService, 
    getCurrentUser,
    isAuthenticated as checkAuth,
    getStoredUser,
    getStoredModules
} from '../services/auth';

// Crear el contexto
const AuthContext = createContext(null);

/**
 * Provider de autenticación que envuelve la aplicación.
 */
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [modules, setModules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Verificar sesión existente al cargar
    useEffect(() => {
        const initAuth = async () => {
            if (checkAuth()) {
                try {
                    // Intentar obtener datos del servidor
                    const data = await getCurrentUser();
                    setUser(data.user);
                    setModules(data.modulos);
                } catch (err) {
                    // Si falla, usar datos almacenados localmente
                    const storedUser = getStoredUser();
                    const storedModules = getStoredModules();
                    
                    if (storedUser) {
                        setUser(storedUser);
                        setModules(storedModules);
                    } else {
                        // Sesión inválida, limpiar
                        await logoutService();
                    }
                }
            }
            setLoading(false);
        };

        initAuth();
    }, []);

    /**
     * Inicia sesión con username y password.
     */
    const login = useCallback(async (username, password) => {
        setError(null);
        setLoading(true);
        
        try {
            const data = await loginService(username, password);
            setUser(data.user);
            setModules(data.modulos);
            return { success: true };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Cierra la sesión actual.
     */
    const logout = useCallback(async () => {
        await logoutService();
        setUser(null);
        setModules([]);
        setError(null);
    }, []);

    /**
     * Verifica si el usuario tiene acceso a un módulo específico.
     */
    const hasModuleAccess = useCallback((moduleCode) => {
        return modules.some(m => m.codigo === moduleCode);
    }, [modules]);

    /**
     * Verifica si el usuario tiene uno de los roles especificados.
     */
    const hasRole = useCallback((roles) => {
        if (!user?.rol) return false;
        const roleArray = Array.isArray(roles) ? roles : [roles];
        return roleArray.includes(user.rol.nombre);
    }, [user]);

    const value = {
        user,
        modules,
        loading,
        error,
        isAuthenticated: !!user,
        login,
        logout,
        hasModuleAccess,
        hasRole,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

/**
 * Hook para acceder al contexto de autenticación.
 */
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth debe usarse dentro de un AuthProvider');
    }
    return context;
};

export default AuthContext;
