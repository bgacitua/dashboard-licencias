import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Barra de navegación superior con info del usuario y logout.
 */
const Navbar = () => {
    const { user, logout, isAuthenticated } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    if (!isAuthenticated) return null;

    return (
        <nav style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 24px',
            backgroundColor: '#1a1a2e',
            color: 'white',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)'
        }}>
            {/* Logo / Título */}
            <Link 
                to="/menu" 
                style={{ 
                    textDecoration: 'none', 
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                }}
            >
                <span style={{ fontSize: '1.5rem' }}>🏢</span>
                <span style={{ 
                    fontSize: '1.1rem', 
                    fontWeight: '600',
                    letterSpacing: '0.5px'
                }}>
                    Portal RRHH
                </span>
            </Link>

            {/* Usuario y Logout */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ textAlign: 'right' }}>
                    <p style={{ 
                        margin: 0, 
                        fontSize: '0.9rem', 
                        fontWeight: '500' 
                    }}>
                        {user?.nombre_completo || user?.username}
                    </p>
                    <p style={{ 
                        margin: 0, 
                        fontSize: '0.75rem', 
                        color: '#a0aec0',
                        textTransform: 'capitalize'
                    }}>
                        {user?.rol?.nombre || 'Usuario'}
                    </p>
                </div>
                
                <button
                    onClick={handleLogout}
                    style={{
                        backgroundColor: 'transparent',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        color: 'white',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                    onMouseEnter={(e) => {
                        e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                        e.target.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                        e.target.style.backgroundColor = 'transparent';
                        e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    }}
                >
                    🚪 Cerrar Sesión
                </button>
            </div>
        </nav>
    );
};

export default Navbar;
