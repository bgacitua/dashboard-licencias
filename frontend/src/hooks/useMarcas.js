import { useState, useEffect, useCallback } from 'react';
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

    const cargarMarcas = useCallback(async (newFilters = filters) => {
        try {
            setLoading(true);
            setError(null);
            setOffset(0);
            const response = await getMarcas({ 
                limit, 
                offset: 0,
                fechaInicio: newFilters.fechaInicio || undefined,
                fechaFin: newFilters.fechaFin || undefined,
                nombre: newFilters.nombre || undefined,
                rut: newFilters.rut || undefined,
                reloj: newFilters.reloj || undefined,
                tipoMarca: newFilters.tipoMarca || undefined
            });
            setMarcas(response.data);
            setTotal(response.total);
            setHasMore(response.has_more);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [limit, filters]);

    const cargarMas = useCallback(async () => {
        if (loadingMore || !hasMore) return;
        
        try {
            setLoadingMore(true);
            const newOffset = offset + limit;
            const response = await getMarcas({ 
                limit, 
                offset: newOffset,
                fechaInicio: filters.fechaInicio || undefined,
                fechaFin: filters.fechaFin || undefined,
                nombre: filters.nombre || undefined,
                rut: filters.rut || undefined,
                reloj: filters.reloj || undefined,
                tipoMarca: filters.tipoMarca || undefined
            });
            setMarcas(prev => [...prev, ...response.data]);
            setOffset(newOffset);
            setHasMore(response.has_more);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoadingMore(false);
        }
    }, [offset, limit, hasMore, loadingMore, filters]);

    const aplicarFiltros = useCallback((newFilters) => {
        setFilters(newFilters);
        cargarMarcas(newFilters);
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
        recargar: () => cargarMarcas(filters),
        cargarMas,
        aplicarFiltros,
        limpiarFiltros
    };
};
