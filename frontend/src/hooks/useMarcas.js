import { useState, useEffect, useCallback } from 'react';
import { getMarcas } from '../services/marcas';

// El rango de fechas define cuántas marcas hay; se traen TODAS las del rango
// paginando contra el backend, para que la UI muestre exactamente lo consultado.
const PAGE_SIZE = 5000;

// Fecha local (no UTC): toISOString adelantaría un día en las tardes chilenas.
const isoHace = (dias) => {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const useMarcas = (diasIniciales = 14) => {
    const [marcas, setMarcas] = useState([]);
    const [desde, setDesde] = useState('');
    const [dias, setDias] = useState(diasIniciales);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const cargar = useCallback(async (rangoDias) => {
        const fechaInicio = isoHace(rangoDias);
        try {
            setLoading(true);
            setError(null);
            setDesde(fechaInicio);

            const todas = [];
            let offset = 0;
            let hayMas = true;
            while (hayMas) {
                const response = await getMarcas({ limit: PAGE_SIZE, offset, fechaInicio });
                todas.push(...response.data);
                offset += PAGE_SIZE;
                hayMas = response.has_more;
            }
            setMarcas(todas);
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
        desde,
        dias,
        setDias,
        loading,
        error,
        recargar: () => cargar(dias),
    };
};
