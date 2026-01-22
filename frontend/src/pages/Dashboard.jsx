import React from 'react';
import { useLicencias } from '../hooks/useLicencias';

// Componente de tarjeta de resumen
const Card = ({ titulo, cantidad, color, subtitulo }) => (
    <div style={{ 
        border: 'none',
        padding: '24px',
        borderRadius: '12px',
        textAlign: 'center',
        backgroundColor: '#ffffff',
        flex: 1,
        margin: '10px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        transition: 'transform 0.2s, box-shadow 0.2s',
        cursor: 'default'
    }}
    onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.15)';
    }}
    onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    }}
    >
        <h3 style={{ margin: '0 0 8px 0', color: '#666', fontSize: '0.9rem', fontWeight: '500' }}>{titulo}</h3>
        <p style={{ 
            fontSize: '2.5rem', 
            fontWeight: 'bold', 
            color: color,
            margin: '0'
        }}>{cantidad}</p>
        {subtitulo && <p style={{ margin: '8px 0 0 0', color: '#999', fontSize: '0.8rem' }}>{subtitulo}</p>}
    </div>
);

// Componente de tabla de licencias
const TablaLicencias = ({ titulo, licencias, colorHeader, mostrarDias, tipoDias }) => (
    <div style={{ 
        backgroundColor: '#ffffff', 
        borderRadius: '12px', 
        padding: '20px', 
        marginBottom: '20px',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
    }}>
        <h2 style={{ 
            margin: '0 0 16px 0', 
            color: '#333',
            fontSize: '1.1rem',
            borderLeft: `4px solid ${colorHeader}`,
            paddingLeft: '12px'
        }}>{titulo}</h2>
        
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
                        {mostrarDias && <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#555', borderBottom: '2px solid #eee' }}>{tipoDias}</th>}
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
                            {mostrarDias && (
                                <td style={{ 
                                    padding: '12px', 
                                    textAlign: 'center',
                                    borderBottom: '1px solid #eee',
                                    fontWeight: 'bold',
                                    color: colorHeader
                                }}>
                                    {lic.dias_restantes !== undefined ? lic.dias_restantes : lic.dias_vencida}
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
    </div>
);

const Dashboard = () => {
    const { vigentes, porVencer, vencidasRecientes, resumen, loading, error, recargar } = useLicencias();

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
                        borderTop: '4px solid #4f46e5',
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
                            backgroundColor: '#4f46e5',
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
            <div style={{ marginBottom: '30px' }}>
                <h1 style={{ 
                    margin: '0 0 8px 0', 
                    color: '#1a1a2e',
                    fontSize: '1.8rem',
                    fontWeight: '600'
                }}>
                    📋 Dashboard de Licencias Médicas
                </h1>
                <p style={{ margin: 0, color: '#666' }}>
                    Resumen de licencias vigentes y próximas a vencer
                </p>
            </div>
            
            {/* Sección de Resumen (Tarjetas) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
                <Card 
                    titulo="Vencidas (últimos 5 días)" 
                    cantidad={resumen.vencidasRecientes} 
                    color="#ef4444"
                    subtitulo="Requieren seguimiento"
                />
                <Card 
                    titulo="Por Vencer (próximos 5 días)" 
                    cantidad={resumen.porVencer} 
                    color="#f59e0b"
                    subtitulo="Próximos a terminar"
                />
                <Card 
                    titulo="Vigentes Hoy" 
                    cantidad={resumen.vigentes} 
                    color="#10b981"
                    subtitulo="Activas actualmente"
                />
            </div>

            {/* Tablas de Licencias */}
            <TablaLicencias 
                titulo="⚠️ Licencias Por Vencer (próximos 5 días)"
                licencias={porVencer}
                colorHeader="#f59e0b"
                mostrarDias={true}
                tipoDias="Días Restantes"
            />

            <TablaLicencias 
                titulo="🔴 Licencias Vencidas Recientemente (últimos 5 días)"
                licencias={vencidasRecientes}
                colorHeader="#ef4444"
                mostrarDias={true}
                tipoDias="Días Vencida"
            />

            <TablaLicencias 
                titulo="✅ Licencias Vigentes Actualmente"
                licencias={vigentes}
                colorHeader="#10b981"
                mostrarDias={false}
            />
        </div>
    );
};

export default Dashboard;