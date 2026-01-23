const API_BASE_URL = 'http://localhost:8000/api/v1';

export const getMarcas = async (params = {}) => {
    const { limit = 100, offset = 0, fechaInicio, fechaFin, nombre, rut, reloj, tipoMarca } = params;
    
    const queryParams = new URLSearchParams();
    queryParams.append('limit', limit);
    queryParams.append('offset', offset);
    
    if (fechaInicio) queryParams.append('fecha_inicio', fechaInicio);
    if (fechaFin) queryParams.append('fecha_fin', fechaFin);
    if (nombre) queryParams.append('nombre', nombre);
    if (rut) queryParams.append('rut', rut);
    if (reloj) queryParams.append('reloj', reloj);
    if (tipoMarca) queryParams.append('tipo_marca', tipoMarca);
    
    const response = await fetch(`${API_BASE_URL}/marcas?${queryParams.toString()}`);
    if (!response.ok) {
        throw new Error('Error al obtener las marcas');
    }
    return response.json();
};

export const getRelojes = async () => {
    const response = await fetch(`${API_BASE_URL}/marcas/relojes`);
    if (!response.ok) {
        throw new Error('Error al obtener los relojes');
    }
    return response.json();
};

// Función legacy para compatibilidad
export const getMarcasHoy = async (limit = 100, offset = 0) => {
    return getMarcas({ limit, offset });
};
