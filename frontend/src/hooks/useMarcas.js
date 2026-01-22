import { useState, useEffect, useCallback } from 'react';
import { getMarcasHoy } from '../services/marcas';

export const useMarcas = (initialLimit = 100) => {
    const [marcas, setMarcas] = useState([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [offset, setOffset] = useState(0);
    const limit = initialLimit;

    const cargarMarcas = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            setOffset(0);
            const response = await getMarcasHoy(limit, 0);
            setMarcas(response.data);
            setTotal(response.total);
            setHasMore(response.has_more);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [limit]);

    const cargarMas = useCallback(async () => {
        if (loadingMore || !hasMore) return;
        
        try {
            setLoadingMore(true);
            const newOffset = offset + limit;
            const response = await getMarcasHoy(limit, newOffset);
            setMarcas(prev => [...prev, ...response.data]);
            setOffset(newOffset);
            setHasMore(response.has_more);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoadingMore(false);
        }
    }, [offset, limit, hasMore, loadingMore]);

    useEffect(() => {
        cargarMarcas();
    }, [cargarMarcas]);

    return {
        marcas,
        total,
        hasMore,
        loading,
        loadingMore,
        error,
        recargar: cargarMarcas,
        cargarMas
    };
};
