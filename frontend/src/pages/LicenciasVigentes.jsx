import React from 'react';
import { Link } from 'react-router-dom';
import { useLicencias } from '../hooks/useLicencias';

// Componente de tabla de licencias
const TablaLicencias = ({ licencias, colorHeader }) => (
    <div style={{ 
        backgroundColor: '#ffffff', 
        borderRadius: '12px', 
        padding: '20px',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
    }}>
        {licencias.length === 0 ? (
            <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>
                No hay licencias en esta categoría
            </p>
        ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#555', borderBottom: '2px solid #eee' }}>RUT</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#555', borderBottom: '2px solid #eee' }}>Trabajador</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#555', borderBottom: '2px solid #eee' }}>Tipo</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#555', borderBottom: '2px solid #eee' }}>Inicio</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#555', borderBottom: '2px solid #eee' }}>Término</th>
                    </tr>
                </thead>
                <tbody>
                    {licencias.map((lic, index) => (
                        <tr key={index} style={{ 
                            backgroundColor: index % 2 === 0 ? '#fff' : '#fafafa',
                            transition: 'background-color 0.2s'
                        }}>
                            <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{lic.rut_empleado}</td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{lic.nombre_completo}</td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{lic.tipo_permiso}</td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{lic.fecha_inicio}</td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{lic.fecha_fin}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
    </div>
);

const LicenciasVigentes = () => {
    const { vigentes, loading, error, recargar } = useLicencias();

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
                        borderTop: '4px solid #10b981',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 16px'
                    }}></div>
                    <p style={{ color: '#666' }}>Cargando datos...</p>
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

    if (error) {
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
                    <p style={{ color: '#ef4444', fontSize: '1.2rem', marginBottom: '16px' }}>⚠️ {error}</p>
                    <button 
                        onClick={recargar}
                        style={{
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            padding: '12px 24px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '1rem'
                        }}
                    >
                        Reintentar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ 
            padding: '30px', 
            fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
            backgroundColor: '#f5f7fa',
            minHeight: '100vh'
        }}>
            {/* Header */}
            <div style={{ marginBottom: '30px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                <Link 
                    to="/"
                    style={{
                        backgroundColor: '#6b7280',
                        color: 'white',
                        textDecoration: 'none',
                        padding: '10px 20px',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#4b5563'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = '#6b7280'}
                >
                    ← Volver
                </Link>
                <div>
                    <h1 style={{ 
                        margin: '0 0 8px 0', 
                        color: '#1a1a2e',
                        fontSize: '1.8rem',
                        fontWeight: '600'
                    }}>
                        ✅ Licencias Vigentes
                    </h1>
                    <p style={{ margin: 0, color: '#666' }}>
                        Licencias activas actualmente
                    </p>
                </div>
            </div>

            {/* Contador */}
            <div style={{ 
                backgroundColor: '#ecfdf5', 
                border: '1px solid #6ee7b7',
                borderRadius: '12px', 
                padding: '20px', 
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '15px'
            }}>
                <span style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>
                    {vigentes.length}
                </span>
                <span style={{ color: '#065f46', fontSize: '1.1rem' }}>
                    licencias vigentes actualmente
                </span>
            </div>

            {/* Tabla */}
            <TablaLicencias 
                licencias={vigentes}
                colorHeader="#10b981"
            />
        </div>
    );
};

export default LicenciasVigentes;
