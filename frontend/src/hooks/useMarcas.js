import { useState, useEffect, useCallback } from 'react';
import { getMarcas } from '../services/marcas';

// El rango de fechas define cuántas marcas hay; se traen TODAS las del rango
// paginando contra el backend, para que la UI muestre exactamente lo consultado.
const PAGE_SIZE = 5000;

// ponytail: caché de módulo, se pierde al recargar la página. Si hace falta que
// sobreviva a F5 o compartirlo entre hooks, recién ahí TanStack Query.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // fechaInicio -> { marcas, ts }

// Fecha local (no UTC): toISOString adelantaría un día en las tardes chilenas.
const isoHace = (dias) => {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const vigente = (fechaInicio) => {
    const entrada = cache.get(fechaInicio);
    return entrada && Date.now() - entrada.ts < TTL_MS ? entrada : null;
};

export const useMarcas = (diasIniciales = 14) => {
    // Init desde el caché para no mostrar el spinner al volver al Dashboard.
    const [marcas, setMarcas] = useState(() => vigente(isoHace(diasIniciales))?.marcas ?? []);
    const [desde, setDesde] = useState(() => isoHace(diasIniciales));
    const [dias, setDias] = useState(diasIniciales);
    const [loading, setLoading] = useState(() => !vigente(isoHace(diasIniciales)));
    const [error, setError] = useState(null);

    const cargar = useCallback(async (rangoDias, { forzar = false } = {}) => {
        const fechaInicio = isoHace(rangoDias);
        setDesde(fechaInicio);

        const cacheado = vigente(fechaInicio);
        if (!forzar && cacheado) {
            setMarcas(cacheado.marcas);
            setError(null);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const todas = [];
            let offset = 0;
            let hayMas = true;
            while (hayMas) {
                const response = await getMarcas({ limit: PAGE_SIZE, offset, fechaInicio });
                todas.push(...response.data);
                offset += PAGE_SIZE;
                hayMas = response.has_more;
            }
            cache.set(fechaInicio, { marcas: todas, ts: Date.now() });
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
        recargar: () => cargar(dias, { forzar: true }),
    };
};
