import { useState, useEffect, useCallback } from 'react';
import { getMarcas } from '../services/marcas';

// ponytail: 2000 últimas marcas, filtrado en cliente (TanStack Table).
// Si hace falta ver el histórico completo (~90k), volver a filtrar en backend.
const LIMIT = 2000;

export const useMarcas = () => {
    const [marcas, setMarcas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const recargar = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await getMarcas({ limit: LIMIT, offset: 0 });
            setMarcas(response.data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        recargar();
    }, [recargar]);

    return { marcas, loading, error, recargar };
};
