import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Página de inicio de sesión.
 */
const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    const { login, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // Redirigir si ya está autenticado
    React.useEffect(() => {
        if (isAuthenticated) {
            const from = location.state?.from?.pathname || '/menu';
            navigate(from, { replace: true });
        }
    }, [isAuthenticated, navigate, location]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!username.trim() || !password.trim()) {
            setError('Por favor, completa todos los campos');
            return;
        }

        setIsLoading(true);
        
        const result = await login(username, password);
        
        if (result.success) {
            const from = location.state?.from?.pathname || '/menu';
            navigate(from, { replace: true });
        } else {
            setError(result.error);
        }
        
        setIsLoading(false);
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif"
        }}>
            {/* Card de Login */}
            <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderRadius: '16px',
                padding: '48px 40px',
                width: '100%',
                maxWidth: '420px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
                animation: 'fadeIn 0.5s ease-out'
            }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <div style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 20px',
                        fontSize: '2.5rem'
                    }}>
                        🏢
                    </div>
                    <h1 style={{ 
                        margin: '0 0 8px 0', 
                        color: '#1a1a2e',
                        fontSize: '1.75rem',
                        fontWeight: '700'
                    }}>
                        Portal RRHH
                    </h1>
                    <p style={{ 
                        margin: 0, 
                        color: '#64748b',
                        fontSize: '0.95rem'
                    }}>
                        Inicia sesión para continuar
                    </p>
                </div>

                {/* Formulario */}
                <form onSubmit={handleSubmit}>
                    {/* Campo Usuario */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            color: '#374151',
                            fontSize: '0.875rem',
                            fontWeight: '600'
                        }}>
                            Usuario
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Ingresa tu usuario"
                            disabled={isLoading}
                            style={{
                                width: '100%',
                                padding: '14px 16px',
                                border: '2px solid #e5e7eb',
                                borderRadius: '10px',
                                fontSize: '1rem',
                                outline: 'none',
                                transition: 'all 0.2s',
                                boxSizing: 'border-box',
                                backgroundColor: isLoading ? '#f9fafb' : 'white'
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                            onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                        />
                    </div>

                    {/* Campo Contraseña */}
                    <div style={{ marginBottom: '24px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            color: '#374151',
                            fontSize: '0.875rem',
                            fontWeight: '600'
                        }}>
                            Contraseña
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Ingresa tu contraseña"
                            disabled={isLoading}
                            style={{
                                width: '100%',
                                padding: '14px 16px',
                                border: '2px solid #e5e7eb',
                                borderRadius: '10px',
                                fontSize: '1rem',
                                outline: 'none',
                                transition: 'all 0.2s',
                                boxSizing: 'border-box',
                                backgroundColor: isLoading ? '#f9fafb' : 'white'
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                            onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                        />
                    </div>

                    {/* Mensaje de Error */}
                    {error && (
                        <div style={{
                            backgroundColor: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '8px',
                            padding: '12px 16px',
                            marginBottom: '20px',
                            color: '#dc2626',
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <span>⚠️</span>
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Botón Submit */}
                    <button
                        type="submit"
                        disabled={isLoading}
                        style={{
                            width: '100%',
                            padding: '14px',
                            background: isLoading 
                                ? '#94a3b8' 
                                : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '1rem',
                            fontWeight: '600',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: isLoading ? 'none' : '0 4px 14px rgba(99, 102, 241, 0.4)'
                        }}
                    >
                        {isLoading ? (
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                <span style={{
                                    width: '18px',
                                    height: '18px',
                                    border: '2px solid white',
                                    borderTopColor: 'transparent',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite'
                                }}></span>
                                Iniciando sesión...
                            </span>
                        ) : (
                            'Iniciar Sesión'
                        )}
                    </button>
                </form>
            </div>

            {/* Animaciones CSS */}
            <style>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                input::placeholder {
                    color: #9ca3af;
                }
            `}</style>
        </div>
    );
};

export default Login;
