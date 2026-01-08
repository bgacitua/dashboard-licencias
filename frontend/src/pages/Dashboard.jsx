import React from 'react';
import { useLicencias } from '../hooks/useLicencias';

const Card = ({ titulo, cantidad, color }) => (
    <div style={{ 
        border: '1px solid #ddd', padding: '20px', borderRadius: '8px', 
        textAlign: 'center', backgroundColor: '#f9f9f9', flex: 1, margin: '10px' 
    }}>
        <h3>{titulo}</h3>
        <p style={{ fontSize: '2rem', fontWeight: 'bold', color: color }}>{cantidad}</p>
    </div>
);

const Dashboard = () => {
    const { licencias, resumen, loading } = useLicencias();

    if (loading) return <p>Cargando datos...</p>;

    return (
        <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
            <h1>Dashboard Licencias Médicas</h1>
            
            {/* Sección de Resumen (Tarjetas) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <Card titulo="Vencidas" cantidad={resumen.vencidas} color="red" />
                <Card titulo="Por Vencer (7 días)" cantidad={resumen.porVencer} color="orange" />
                <Card titulo="Activas" cantidad={resumen.activas} color="green" />
            </div>

            {/* Tabla de Detalle */}
            <h2>Listado de Trabajadores</h2>
            <table border="1" cellPadding="10" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ background: '#eee' }}>
                        <th>Trabajador</th>
                        <th>Inicio</th>
                        <th>Término</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody>
                    {licencias.map((lic) => (
                        <tr key={lic.id}>
                            <td>{lic.nombre_trabajador}</td>
                            <td>{lic.fecha_inicio}</td>
                            <td>{lic.fecha_fin}</td>
                            <td style={{ 
                                fontWeight: 'bold',
                                color: lic.estado === 'Vencida' ? 'red' : 
                                       lic.estado === 'Por Vencer' ? 'orange' : 'green' 
                            }}>
                                {lic.estado}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default Dashboard;