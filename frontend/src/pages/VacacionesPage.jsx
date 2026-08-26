import React, { useState, useMemo } from 'react';
import SidebarLayout from '../components/SidebarLayout';
import { useVacaciones } from '../hooks/useVacaciones';

const VacacionesPage = () => {
  const { vacaciones, loading } = useVacaciones();
  
  // Filter states
  const [filterNombre, setFilterNombre] = useState('');
  const [filterRut, setFilterRut] = useState('');
  const [filterFechaInicio, setFilterFechaInicio] = useState('');
  const [filterFechaFin, setFilterFechaFin] = useState('');
  
  // Sort state: 'asc', 'desc', or null (no sort)
  const [sortOrder, setSortOrder] = useState('asc');

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  // Filtered and sorted vacaciones
  const filteredVacaciones = useMemo(() => {
    let result = vacaciones.filter(vac => {
      // Filter by name
      if (filterNombre && !vac.full_name?.toLowerCase().includes(filterNombre.toLowerCase())) {
        return false;
      }
      // Filter by RUT
      if (filterRut && !vac.rut?.toLowerCase().includes(filterRut.toLowerCase())) {
        return false;
      }
      // Filter by date range
      if (filterFechaInicio) {
        const startDate = new Date(vac.start_date);
        const filterStart = new Date(filterFechaInicio);
        if (startDate < filterStart) return false;
      }
      if (filterFechaFin) {
        const endDate = new Date(vac.end_date);
        const filterEnd = new Date(filterFechaFin);
        if (endDate > filterEnd) return false;
      }
      return true;
    });
    
    // Sort by start_date
    if (sortOrder) {
      result = [...result].sort((a, b) => {
        const dateA = new Date(a.start_date);
        const dateB = new Date(b.start_date);
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      });
    }
    
    return result;
  }, [vacaciones, filterNombre, filterRut, filterFechaInicio, filterFechaFin, sortOrder]);

  const clearFilters = () => {
    setFilterNombre('');
    setFilterRut('');
    setFilterFechaInicio('');
    setFilterFechaFin('');
  };
  
  const toggleSort = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  return (
    <SidebarLayout>
      <main className="p-8">
        {/* Header */}
        <header className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-2 text-sm text-app-muted">
                <span className="material-symbols-outlined text-lg">home</span>
                <span>/</span>
                <span className="text-app-ink font-medium">Vacaciones Activas</span>
            </div>
            <div className="flex items-center gap-4">
                <button className="relative p-2 text-app-outline hover:text-app-muted transition-colors">
                    <span className="material-symbols-outlined">notifications</span>
                </button>
            </div>
        </header>

        <div className="mb-8">
            <h1 className="text-2xl font-bold text-app-ink mb-1">Vacaciones Activas</h1>
            <p className="text-app-muted">Listado de trabajadores con vacaciones activas actualmente.</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl  border border-app-line p-4 mb-6">
            <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs text-app-muted font-semibold uppercase mb-1">Nombre</label>
                    <input 
                        type="text"
                        placeholder="Buscar por nombre..."
                        className="w-full p-2 border border-app-line rounded-lg text-sm focus:ring-2 focus:ring-app-ink outline-none"
                        value={filterNombre}
                        onChange={(e) => setFilterNombre(e.target.value)}
                    />
                </div>
                <div className="flex-1 min-w-[150px]">
                    <label className="block text-xs text-app-muted font-semibold uppercase mb-1">RUT</label>
                    <input 
                        type="text"
                        placeholder="Buscar por RUT..."
                        className="w-full p-2 border border-app-line rounded-lg text-sm focus:ring-2 focus:ring-app-ink outline-none"
                        value={filterRut}
                        onChange={(e) => setFilterRut(e.target.value)}
                    />
                </div>
                <div className="min-w-[150px]">
                    <label className="block text-xs text-app-muted font-semibold uppercase mb-1">Desde</label>
                    <input 
                        type="date"
                        className="w-full p-2 border border-app-line rounded-lg text-sm focus:ring-2 focus:ring-app-ink outline-none"
                        value={filterFechaInicio}
                        onChange={(e) => setFilterFechaInicio(e.target.value)}
                    />
                </div>
                <div className="min-w-[150px]">
                    <label className="block text-xs text-app-muted font-semibold uppercase mb-1">Hasta</label>
                    <input 
                        type="date"
                        className="w-full p-2 border border-app-line rounded-lg text-sm focus:ring-2 focus:ring-app-ink outline-none"
                        value={filterFechaFin}
                        onChange={(e) => setFilterFechaFin(e.target.value)}
                    />
                </div>
                <button 
                    onClick={clearFilters}
                    className="px-4 py-2 text-sm text-app-muted hover:text-app-muted hover:bg-app-surface rounded-lg transition-colors"
                >
                    Limpiar filtros
                </button>
            </div>
        </div>

        <div className="bg-white rounded-xl  border border-app-line overflow-hidden">
            {/* Results count */}
            <div className="px-6 py-3 border-b border-app-line bg-app-surface">
                <span className="text-sm text-app-muted">
                    Mostrando <span className="font-semibold text-app-ink">{filteredVacaciones.length}</span> de {vacaciones.length} registros
                </span>
            </div>
            
            {/* Content Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-app-surface border-b border-app-line text-xs uppercase text-app-muted font-semibold">
                            <th className="px-6 py-3">RUT</th>
                            <th className="px-6 py-3">Trabajador</th>
                            <th className="px-6 py-3">Tipo</th>
                            <th className="px-6 py-3">Estado</th>
                            <th 
                                className="px-6 py-3 cursor-pointer hover:bg-app-surface transition-colors select-none"
                                onClick={toggleSort}
                            >
                                <div className="flex items-center gap-1">
                                    Inicio
                                    <span className="material-symbols-outlined text-sm">
                                        {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                    </span>
                                </div>
                            </th>
                            <th className="px-6 py-3">Término</th>
                            <th className="px-6 py-3">Días Hábiles</th>
                            <th className="px-6 py-3">Días Calendario</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-app-line">
                        {loading && (
                             <tr><td colSpan="8" className="px-6 py-8 text-center text-app-muted">Cargando datos...</td></tr>
                        )}

                        {!loading && (
                            filteredVacaciones.length > 0 ? filteredVacaciones.map((vac, idx) => (
                                <tr key={idx} className="hover:bg-app-surface transition-colors">
                                    <td className="px-6 py-4 text-sm font-mono text-app-muted">{vac.rut}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-app-ink">{vac.full_name}</td>
                                    <td className="px-6 py-4 text-sm text-app-muted">{vac.type || '-'}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                            vac.status === 'accepted' 
                                                ? 'bg-green-50 text-green-700' 
                                                : vac.status === 'pending' 
                                                    ? 'bg-amber-50 text-amber-700'
                                                    : 'bg-app-surface text-app-muted'
                                        }`}>
                                            {vac.status === 'accepted' ? 'Aceptada' : vac.status === 'pending' ? 'Pendiente' : vac.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-app-muted">{formatDate(vac.start_date)}</td>
                                    <td className="px-6 py-4 text-sm text-app-muted">{formatDate(vac.end_date)}</td>
                                    <td className="px-6 py-4 text-sm text-app-ink font-medium text-center">
                                        {vac.working_days} días
                                    </td>
                                    <td className="px-6 py-4 text-sm text-app-ink font-medium text-center">
                                        {vac.calendar_days} días
                                    </td>
                                </tr>
                            )) : <tr><td colSpan="8" className="px-6 py-8 text-center text-app-muted">No hay vacaciones activas</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      </main>
    </SidebarLayout>
  );
};

export default VacacionesPage;
