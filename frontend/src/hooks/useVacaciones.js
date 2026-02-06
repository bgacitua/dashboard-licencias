import { useState, useEffect } from 'react';
import { getVacacionesActivas } from '../services/vacaciones';

export const useVacaciones = () => {
  const [vacaciones, setVacaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchVacaciones = async () => {
      try {
        setLoading(true);
        const data = await getVacacionesActivas();
        setVacaciones(data || []);
      } catch (err) {
        console.error('Error fetching vacaciones:', err);
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchVacaciones();
  }, []);

  // Calculate summary
  const resumen = {
    total: vacaciones.length
  };

  return {
    vacaciones,
    resumen,
    loading,
    error
  };
};
