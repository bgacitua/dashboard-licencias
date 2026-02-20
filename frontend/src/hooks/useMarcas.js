import { useState, useEffect, useCallback, useRef } from 'react';
import { getMarcas, getRelojes } from '../services/marcas';

export const useMarcas = (initialLimit = 100) => {
    const [marcas, setMarcas] = useState([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [offset, setOffset] = useState(0);
    const [relojes, setRelojes] = useState([]);
    const [filters, setFilters] = useState({
        fechaInicio: '',
        fechaFin: '',
        nombre: '',
        rut: '',
        reloj: '',
        tipoMarca: ''
    });
    const limit = initialLimit;

    // Keep a ref to always have the latest filters (avoids stale closures)
    const filtersRef = useRef(filters);
    filtersRef.current = filters;

    // Cargar lista de relojes al iniciar
    useEffect(() => {
        const cargarRelojes = async () => {
            try {
                const data = await getRelojes();
                setRelojes(data);
            } catch (err) {
                console.error('Error cargando relojes:', err);
            }
        };
        cargarRelojes();
    }, []);

    const cargarMarcas = useCallback(async (filterOverride) => {
        const activeFilters = filterOverride || filtersRef.current;
        try {
            setLoading(true);
            setError(null);
            setOffset(0);
            const response = await getMarcas({ 
                limit, 
                offset: 0,
                fechaInicio: activeFilters.fechaInicio || undefined,
                fechaFin: activeFilters.fechaFin || undefined,
                nombre: activeFilters.nombre || undefined,
                rut: activeFilters.rut || undefined,
                reloj: activeFilters.reloj || undefined,
                tipoMarca: activeFilters.tipoMarca || undefined
            });
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
            const currentFilters = filtersRef.current;
            const response = await getMarcas({ 
                limit, 
                offset: newOffset,
                fechaInicio: currentFilters.fechaInicio || undefined,
                fechaFin: currentFilters.fechaFin || undefined,
                nombre: currentFilters.nombre || undefined,
                rut: currentFilters.rut || undefined,
                reloj: currentFilters.reloj || undefined,
                tipoMarca: currentFilters.tipoMarca || undefined
            });
            setMarcas(prev => [...prev, ...response.data]);
            setOffset(newOffset);
            setHasMore(response.has_more);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoadingMore(false);
        }
    }, [offset, limit, hasMore, loadingMore]);

    const aplicarFiltros = useCallback((newFilters) => {
        // Merge with current filters from ref to avoid stale state
        const merged = { ...filtersRef.current, ...newFilters };
        setFilters(merged);
        filtersRef.current = merged;
        cargarMarcas(merged);
    }, [cargarMarcas]);

    const limpiarFiltros = useCallback(() => {
        const emptyFilters = {
            fechaInicio: '',
            fechaFin: '',
            nombre: '',
            rut: '',
            reloj: '',
            tipoMarca: ''
        };
        setFilters(emptyFilters);
        filtersRef.current = emptyFilters;
        cargarMarcas(emptyFilters);
    }, [cargarMarcas]);

    useEffect(() => {
        cargarMarcas();
    }, []);

    return {
        marcas,
        total,
        hasMore,
        loading,
        loadingMore,
        error,
        filters,
        relojes,
        recargar: () => cargarMarcas(filtersRef.current),
        cargarMas,
        aplicarFiltros,
        limpiarFiltros
    };
};
