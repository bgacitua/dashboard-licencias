const API_BASE_URL = 'http://localhost:8000/api/v1';

export const getMarcasHoy = async (limit = 100, offset = 0) => {
    const response = await fetch(`${API_BASE_URL}/marcas/hoy?limit=${limit}&offset=${offset}`);
    if (!response.ok) {
        throw new Error('Error al obtener las marcas');
    }
    return response.json();
};
