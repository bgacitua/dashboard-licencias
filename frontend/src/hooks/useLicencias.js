import { useState, useEffect } from 'react';
import { getLicencias } from '../services/licencias';

export const useLicencias = () => {
    const [licencias, setLicencias] = useState([]);
    const [resumen, setResumen] = useState({ vencidas: 0, porVencer: 0, activas: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        cargarDatos();
    }, []);

    const cargarDatos = async () => {
        try {
            const data = await getLicencias();
            procesarLicencias(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // Aquí está la lógica de negocio "Vencidas vs Activas"
    const procesarLicencias = (data) => {
        const hoy = new Date();
        // Normalizamos "hoy" para ignorar la hora y comparar solo fechas
        hoy.setHours(0, 0, 0, 0);

        // Definimos "Por vencer" como los próximos 7 días
        const margenAlerta = new Date(hoy);
        margenAlerta.setDate(margenAlerta.getDate() + 7);

        let countVencidas = 0;
        let countPorVencer = 0;
        let countActivas = 0;

        const dataClasificada = data.map(lic => {
            // Convertir string de fecha (YYYY-MM-DD) a objeto Date
            // Agregamos 'T00:00' para evitar problemas de zona horaria al parsear
            const fin = new Date(lic.fecha_fin + 'T00:00:00'); 
            
            let estado = 'Activa';

            if (fin < hoy) {
                estado = 'Vencida';
                countVencidas++;
            } else if (fin <= margenAlerta) {
                estado = 'Por Vencer';
                countPorVencer++;
            } else {
                estado = 'Activa';
                countActivas++;
            }

            return { ...lic, estado };
        });

        setLicencias(dataClasificada);
        setResumen({
            vencidas: countVencidas,
            porVencer: countPorVencer,
            activas: countActivas
        });
    };

    return { licencias, resumen, loading, recargar: cargarDatos };
};