import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Componente para proteger rutas que requieren autenticación.
 * 
 * @param {object} props
 * @param {React.ReactNode} props.children - Componente a renderizar si está autenticado
 * @param {string} [props.requiredModule] - Código del módulo requerido (opcional)
 * @param {string|string[]} [props.requiredRoles] - Rol(es) requerido(s) (opcional)
 */
const ProtectedRoute = ({ children, requiredModule, requiredRoles }) => {
    const { isAuthenticated, loading, hasModuleAccess, hasRole } = useAuth();
    const location = useLocation();

    // Mostrar loading mientras se verifica la autenticación
    if (loading) {
        return (
            <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                height: '100vh',
                backgroundColor: '#f5f7fa'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        border: '4px solid #e0e0e0',
                        borderTop: '4px solid #6366f1',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 16px'
                    }}></div>
                    <p style={{ color: '#666' }}>Verificando sesión...</p>
                </div>
                <style>{`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        );
    }

    // Redirigir a login si no está autenticado
    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Verificar acceso al módulo si se especifica
    if (requiredModule && !hasModuleAccess(requiredModule)) {
        return (
            <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                height: '100vh',
                backgroundColor: '#f5f7fa'
            }}>
                <div style={{ 
                    textAlign: 'center',
                    backgroundColor: '#fff',
                    padding: '40px',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                }}>
                    <h2 style={{ color: '#ef4444', marginBottom: '16px' }}>⛔ Acceso Denegado</h2>
                    <p style={{ color: '#666' }}>No tienes permisos para acceder a este módulo.</p>
                    <a 
                        href="/menu" 
                        style={{
                            display: 'inline-block',
                            marginTop: '20px',
                            padding: '10px 20px',
                            backgroundColor: '#6366f1',
                            color: 'white',
                            textDecoration: 'none',
                            borderRadius: '8px'
                        }}
                    >
                        Volver al Menú
                    </a>
                </div>
            </div>
        );
    }

    // Verificar rol si se especifica
    if (requiredRoles && !hasRole(requiredRoles)) {
        return (
            <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                height: '100vh',
                backgroundColor: '#f5f7fa'
            }}>
                <div style={{ 
                    textAlign: 'center',
                    backgroundColor: '#fff',
                    padding: '40px',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                }}>
                    <h2 style={{ color: '#ef4444', marginBottom: '16px' }}>⛔ Acceso Restringido</h2>
                    <p style={{ color: '#666' }}>No tienes el rol necesario para acceder.</p>
                    <a 
                        href="/menu" 
                        style={{
                            display: 'inline-block',
                            marginTop: '20px',
                            padding: '10px 20px',
                            backgroundColor: '#6366f1',
                            color: 'white',
                            textDecoration: 'none',
                            borderRadius: '8px'
                        }}
                    >
                        Volver al Menú
                    </a>
                </div>
            </div>
        );
    }

    // Usuario autenticado y con permisos
    return children;
};

export default ProtectedRoute;
