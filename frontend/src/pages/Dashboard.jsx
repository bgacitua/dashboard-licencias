import React from 'react';
import { Link } from 'react-router-dom';
import { useLicencias } from '../hooks/useLicencias';
import { useMarcas } from '../hooks/useMarcas';

// Componente de tarjeta de resumen clickeable
const Card = ({ titulo, cantidad, color, subtitulo, to }) => (
    <Link 
        to={to}
        style={{ 
            border: 'none',
            padding: '24px',
            borderRadius: '12px',
            textAlign: 'center',
            backgroundColor: '#ffffff',
            flex: 1,
            margin: '10px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            transition: 'transform 0.2s, box-shadow 0.2s',
            cursor: 'pointer',
            textDecoration: 'none',
            display: 'block'
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
        <p style={{ margin: '12px 0 0 0', color: '#4f46e5', fontSize: '0.85rem', fontWeight: '500' }}>
            Ver detalles →
        </p>
    </Link>
);

// Componente de tabla de marcas
const TablaMarcas = ({ marcas, total, loading, loadingMore, error, hasMore, onLoadMore }) => {
    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{
                    width: '30px',
                    height: '30px',
                    border: '3px solid #e0e0e0',
                    borderTop: '3px solid #6366f1',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 12px'
                }}></div>
                <p style={{ color: '#666', fontSize: '0.9rem' }}>Cargando marcas...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>
                <p>⚠️ Error al cargar marcas: {error}</p>
            </div>
        );
    }

    if (marcas.length === 0) {
        return (
            <p style={{ color: '#999', textAlign: 'center', padding: '40px' }}>
                No hay marcas registradas hoy
            </p>
        );
    }

    return (
        <>
            {/* Contador */}
            <div style={{ 
                marginBottom: '12px', 
                padding: '8px 12px', 
                backgroundColor: '#f3f4f6', 
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span style={{ color: '#374151', fontSize: '0.9rem' }}>
                    Mostrando <strong>{marcas.length}</strong> de <strong>{total}</strong> marcas
                </span>
            </div>
            
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f9fa' }}>
                        <tr>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#555', borderBottom: '2px solid #eee' }}>Reloj</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#555', borderBottom: '2px solid #eee' }}>Nombre</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#555', borderBottom: '2px solid #eee' }}>RUT</th>
                            <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#555', borderBottom: '2px solid #eee' }}>Hora</th>
                            <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#555', borderBottom: '2px solid #eee' }}>Tipo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {marcas.map((marca, index) => (
                            <tr key={index} style={{ 
                                backgroundColor: index % 2 === 0 ? '#fff' : '#fafafa',
                                transition: 'background-color 0.2s'
                            }}>
                                <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{marca.nombre_reloj}</td>
                                <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{marca.nombre_completo}</td>
                                <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>{marca.rut}</td>
                                <td style={{ padding: '12px', borderBottom: '1px solid #eee', textAlign: 'center', fontWeight: '500' }}>{marca.hora_marca}</td>
                                <td style={{ 
                                    padding: '12px', 
                                    borderBottom: '1px solid #eee', 
                                    textAlign: 'center'
                                }}>
                                    <span style={{
                                        backgroundColor: marca.tipo_marca_texto?.toLowerCase().includes('entrada') ? '#dcfce7' : '#fef3c7',
                                        color: marca.tipo_marca_texto?.toLowerCase().includes('entrada') ? '#166534' : '#92400e',
                                        padding: '4px 12px',
                                        borderRadius: '12px',
                                        fontSize: '0.8rem',
                                        fontWeight: '500'
                                    }}>
                                        {marca.tipo_marca_texto || marca.tipo_marca}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {/* Botón Cargar Más */}
            {hasMore && (
                <div style={{ textAlign: 'center', marginTop: '16px' }}>
                    <button
                        onClick={onLoadMore}
                        disabled={loadingMore}
                        style={{
                            backgroundColor: loadingMore ? '#d1d5db' : '#6366f1',
                            color: 'white',
                            border: 'none',
                            padding: '10px 24px',
                            borderRadius: '8px',
                            cursor: loadingMore ? 'not-allowed' : 'pointer',
                            fontSize: '0.9rem',
                            transition: 'background-color 0.2s'
                        }}
                    >
                        {loadingMore ? 'Cargando...' : `Cargar más (${total - marcas.length} restantes)`}
                    </button>
                </div>
            )}
        </>
    );
};

const Dashboard = () => {
    const { resumen, loading: loadingLicencias, error: errorLicencias, recargar: recargarLicencias } = useLicencias();
    const { marcas, total, hasMore, loading: loadingMarcas, loadingMore, error: errorMarcas, recargar: recargarMarcas, cargarMas } = useMarcas();

    if (loadingLicencias) {
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

    if (errorLicencias) {
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
                    <p style={{ color: '#ef4444', fontSize: '1.2rem', marginBottom: '16px' }}>⚠️ {errorLicencias}</p>
                    <button 
                        onClick={recargarLicencias}
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
            
            {/* Sección de Resumen (Tarjetas Clickeables) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
                <Card 
                    titulo="Vencidas (últimos 5 días)" 
                    cantidad={resumen.vencidasRecientes} 
                    color="#ef4444"
                    subtitulo="Requieren seguimiento"
                    to="/vencidas"
                />
                <Card 
                    titulo="Por Vencer (próximos 5 días)" 
                    cantidad={resumen.porVencer} 
                    color="#f59e0b"
                    subtitulo="Próximos a terminar"
                    to="/por-vencer"
                />
                <Card 
                    titulo="Vigentes Hoy" 
                    cantidad={resumen.vigentes} 
                    color="#10b981"
                    subtitulo="Activas actualmente"
                    to="/vigentes"
                />
            </div>

            {/* Recuadro de Marcas de Empleados */}
            <div style={{ 
                backgroundColor: '#ffffff', 
                borderRadius: '12px', 
                padding: '20px',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
            }}>
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '16px'
                }}>
                    <h2 style={{ 
                        margin: 0, 
                        color: '#333',
                        fontSize: '1.1rem',
                        borderLeft: '4px solid #6366f1',
                        paddingLeft: '12px'
                    }}>
                        🕐 Marcas de Empleados - Hoy
                    </h2>
                    <button
                        onClick={recargarMarcas}
                        style={{
                            backgroundColor: '#f3f4f6',
                            color: '#374151',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#e5e7eb'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = '#f3f4f6'}
                    >
                        🔄 Actualizar
                    </button>
                </div>
                
                <TablaMarcas 
                    marcas={marcas}
                    total={total}
                    loading={loadingMarcas}
                    loadingMore={loadingMore}
                    error={errorMarcas}
                    hasMore={hasMore}
                    onLoadMore={cargarMas}
                />
            </div>

            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default Dashboard;