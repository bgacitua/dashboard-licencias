import { useState, useEffect } from 'react';
import { getLicenciasVigentes, getLicenciasPorVencer, getLicenciasVencidasRecientes } from '../services/licencias';

export const useLicencias = () => {
    const [vigentes, setVigentes] = useState([]);
    const [porVencer, setPorVencer] = useState([]);
    const [vencidasRecientes, setVencidasRecientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        cargarDatos();
    }, []);

    const cargarDatos = async () => {
        try {
            setLoading(true);
            setError(null);
            
            // Cargar todos los datos en paralelo
            const [vigentesData, porVencerData, vencidasData] = await Promise.all([
                getLicenciasVigentes(),
                getLicenciasPorVencer(5),
                getLicenciasVencidasRecientes(5)
            ]);

            setVigentes(vigentesData);
            setPorVencer(porVencerData);
            setVencidasRecientes(vencidasData);
        } catch (err) {
            console.error("Error al cargar datos:", err);
            setError("Error al cargar los datos de licencias");
        } finally {
            setLoading(false);
        }
    };

    const resumen = {
        vigentes: vigentes.length,
        porVencer: porVencer.length,
        vencidasRecientes: vencidasRecientes.length
    };

    return { 
        vigentes, 
        porVencer, 
        vencidasRecientes, 
        resumen, 
        loading, 
        error,
        recargar: cargarDatos 
    };
};