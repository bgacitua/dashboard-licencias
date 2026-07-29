import { useState, useEffect, useCallback } from 'react';
import { getMarcas } from '../services/marcas';

// ponytail: se traen las marcas de los últimos N días (máx. 2000, las más recientes)
// y TanStack Table filtra en cliente. Si hace falta el histórico completo (~90k),
// volver a filtrar en backend.
const LIMIT = 2000;

// Fecha local (no UTC): toISOString adelantaría un día en las tardes chilenas.
const isoHace = (dias) => {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const useMarcas = (diasIniciales = 14) => {
    const [marcas, setMarcas] = useState([]);
    const [total, setTotal] = useState(0);
    const [dias, setDias] = useState(diasIniciales);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const cargar = useCallback(async (rango) => {
        try {
            setLoading(true);
            setError(null);
            const response = await getMarcas({
                limit: LIMIT,
                offset: 0,
                fechaInicio: isoHace(rango),
                fechaFin: isoHace(0),
            });
            setMarcas(response.data);
            setTotal(response.total);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        cargar(dias);
    }, [cargar, dias]);

    return {
        marcas,
        total,
        truncado: total > marcas.length,
        dias,
        setDias,
        loading,
        error,
        recargar: () => cargar(dias),
    };
};
