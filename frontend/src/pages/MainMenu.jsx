import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';

/**
 * Tarjeta de módulo para el menú principal.
 */
const ModuleCard = ({ modulo }) => {
    // Mapeo de iconos por código de módulo
    const iconMap = {
        'dashboard': '📋',
        'finiquitos': '📄',
        'admin': '⚙️'
    };

    // Mapeo de colores por código de módulo
    const colorMap = {
        'dashboard': { bg: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', shadow: 'rgba(99, 102, 241, 0.3)' },
        'finiquitos': { bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', shadow: 'rgba(16, 185, 129, 0.3)' },
        'admin': { bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', shadow: 'rgba(245, 158, 11, 0.3)' }
    };

    const colors = colorMap[modulo.codigo] || { bg: 'linear-gradient(135deg, #64748b 0%, #475569 100%)', shadow: 'rgba(100, 116, 139, 0.3)' };
    const icon = iconMap[modulo.codigo] || modulo.icono || '📦';

    return (
        <Link
            to={modulo.ruta}
            style={{
                textDecoration: 'none',
                display: 'block'
            }}
        >
            <div
                style={{
                    background: colors.bg,
                    borderRadius: '16px',
                    padding: '32px',
                    color: 'white',
                    transition: 'all 0.3s ease',
                    boxShadow: `0 10px 30px ${colors.shadow}`,
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-8px)';
                    e.currentTarget.style.boxShadow = `0 20px 40px ${colors.shadow}`;
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = `0 10px 30px ${colors.shadow}`;
                }}
            >
                {/* Círculo decorativo de fondo */}
                <div style={{
                    position: 'absolute',
                    top: '-30px',
                    right: '-30px',
                    width: '120px',
                    height: '120px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)'
                }}></div>

                {/* Icono */}
                <div style={{
                    fontSize: '3rem',
                    marginBottom: '16px'
                }}>
                    {icon}
                </div>

                {/* Nombre */}
                <h3 style={{
                    margin: '0 0 8px 0',
                    fontSize: '1.4rem',
                    fontWeight: '700'
                }}>
                    {modulo.nombre}
                </h3>

                {/* Descripción */}
                <p style={{
                    margin: 0,
                    fontSize: '0.9rem',
                    opacity: 0.9,
                    lineHeight: 1.5
                }}>
                    {modulo.descripcion}
                </p>

                {/* Flecha */}
                <div style={{
                    marginTop: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.9rem',
                    fontWeight: '500'
                }}>
                    Acceder <span style={{ fontSize: '1.1rem' }}>→</span>
                </div>
            </div>
        </Link>
    );
};

/**
 * Menú principal con los módulos disponibles para el usuario.
 */
const MainMenu = () => {
    const { user, modules } = useAuth();

    // Ordenar módulos por orden
    const sortedModules = [...modules].sort((a, b) => a.orden - b.orden);

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: '#f5f7fa',
            fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif"
        }}>
            <Navbar />

            <div style={{
                padding: '40px',
                maxWidth: '1200px',
                margin: '0 auto'
            }}>
                {/* Header de bienvenida */}
                <div style={{
                    marginBottom: '40px',
                    animation: 'fadeIn 0.5s ease-out'
                }}>
                    <h1 style={{
                        margin: '0 0 8px 0',
                        color: '#1a1a2e',
                        fontSize: '2rem',
                        fontWeight: '700'
                    }}>
                        👋 ¡Hola, {user?.nombre_completo?.split(' ')[0] || user?.username}!
                    </h1>
                    <p style={{
                        margin: 0,
                        color: '#64748b',
                        fontSize: '1.1rem'
                    }}>
                        Selecciona un módulo para comenzar
                    </p>
                </div>

                {/* Grid de módulos */}
                {sortedModules.length > 0 ? (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                        gap: '24px',
                        animation: 'fadeIn 0.6s ease-out'
                    }}>
                        {sortedModules.map((modulo) => (
                            <ModuleCard key={modulo.id} modulo={modulo} />
                        ))}
                    </div>
                ) : (
                    <div style={{
                        textAlign: 'center',
                        padding: '60px',
                        backgroundColor: 'white',
                        borderRadius: '16px',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)'
                    }}>
                        <span style={{ fontSize: '3rem' }}>📭</span>
                        <h2 style={{ color: '#374151', marginTop: '16px' }}>
                            Sin módulos asignados
                        </h2>
                        <p style={{ color: '#64748b' }}>
                            Contacta al administrador para obtener acceso a los módulos.
                        </p>
                    </div>
                )}

                {/* Info de rol */}
                <div style={{
                    marginTop: '40px',
                    padding: '16px 24px',
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '12px',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
                }}>
                    <span style={{
                        backgroundColor: '#e0e7ff',
                        color: '#4338ca',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        textTransform: 'capitalize'
                    }}>
                        {user?.rol?.nombre || 'Sin rol'}
                    </span>
                    <span style={{ color: '#64748b', fontSize: '0.9rem' }}>
                        Tienes acceso a <strong>{modules.length}</strong> módulo{modules.length !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {/* Animaciones CSS */}
            <style>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
        </div>
    );
};

export default MainMenu;
