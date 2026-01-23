import React from 'react';
import Navbar from '../components/Navbar';

/**
 * Placeholder para el módulo de Generador de Finiquitos.
 * Este módulo se desarrollará posteriormente.
 */
const GeneradorFiniquitos = () => {
    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: '#f5f7fa',
            fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif"
        }}>
            <Navbar />

            <div style={{
                padding: '40px',
                maxWidth: '1000px',
                margin: '0 auto'
            }}>
                {/* Header */}
                <div style={{ marginBottom: '30px' }}>
                    <h1 style={{ 
                        margin: '0 0 8px 0', 
                        color: '#1a1a2e',
                        fontSize: '1.8rem',
                        fontWeight: '600'
                    }}>
                        📄 Generador de Finiquitos
                    </h1>
                    <p style={{ margin: 0, color: '#666' }}>
                        Módulo para generación de documentos de finiquito
                    </p>
                </div>

                {/* Placeholder Content */}
                <div style={{
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    padding: '60px',
                    textAlign: 'center',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)'
                }}>
                    <div style={{
                        width: '100px',
                        height: '100px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 24px',
                        fontSize: '3rem'
                    }}>
                        🚧
                    </div>
                    
                    <h2 style={{ 
                        color: '#374151',
                        marginBottom: '12px'
                    }}>
                        Módulo en Desarrollo
                    </h2>
                    
                    <p style={{ 
                        color: '#64748b',
                        maxWidth: '400px',
                        margin: '0 auto 24px',
                        lineHeight: 1.6
                    }}>
                        Este módulo está siendo desarrollado y estará disponible próximamente.
                        Podrás generar documentos de finiquito de manera automatizada.
                    </p>

                    <a 
                        href="/menu"
                        style={{
                            display: 'inline-block',
                            padding: '12px 24px',
                            backgroundColor: '#6366f1',
                            color: 'white',
                            textDecoration: 'none',
                            borderRadius: '8px',
                            fontWeight: '500',
                            transition: 'background-color 0.2s'
                        }}
                    >
                        ← Volver al Menú
                    </a>
                </div>

                {/* Próximas funcionalidades */}
                <div style={{
                    marginTop: '30px',
                    padding: '24px',
                    backgroundColor: '#e0f2fe',
                    borderRadius: '12px',
                    border: '1px solid #bae6fd'
                }}>
                    <h3 style={{ 
                        margin: '0 0 12px 0',
                        color: '#0369a1',
                        fontSize: '1rem'
                    }}>
                        💡 Próximas funcionalidades:
                    </h3>
                    <ul style={{ 
                        margin: 0,
                        paddingLeft: '20px',
                        color: '#0c4a6e'
                    }}>
                        <li>Formulario de datos del empleado</li>
                        <li>Cálculo automático de liquidación</li>
                        <li>Generación de PDF</li>
                        <li>Historial de finiquitos generados</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default GeneradorFiniquitos;
