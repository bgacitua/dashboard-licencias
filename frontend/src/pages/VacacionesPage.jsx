import React, { useState, useMemo } from 'react';
import Sidebar from '../components/Sidebar';
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
    <div className="flex min-h-screen bg-[#f8f9fa] font-['Public_Sans']">
      <Sidebar />
      
      <main className="flex-1 ml-64 p-8">
        {/* Header */}
        <header className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="material-symbols-outlined text-lg">home</span>
                <span>/</span>
                <span className="text-gray-900 font-medium">Vacaciones Activas</span>
            </div>
            <div className="flex items-center gap-4">
                <button className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors">
                    <span className="material-symbols-outlined">notifications</span>
                </button>
            </div>
        </header>

        <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Vacaciones Activas</h1>
            <p className="text-gray-500">Listado de trabajadores con vacaciones activas actualmente.</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
            <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs text-gray-500 font-semibold uppercase mb-1">Nombre</label>
                    <input 
                        type="text"
                        placeholder="Buscar por nombre..."
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={filterNombre}
                        onChange={(e) => setFilterNombre(e.target.value)}
                    />
                </div>
                <div className="flex-1 min-w-[150px]">
                    <label className="block text-xs text-gray-500 font-semibold uppercase mb-1">RUT</label>
                    <input 
                        type="text"
                        placeholder="Buscar por RUT..."
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={filterRut}
                        onChange={(e) => setFilterRut(e.target.value)}
                    />
                </div>
                <div className="min-w-[150px]">
                    <label className="block text-xs text-gray-500 font-semibold uppercase mb-1">Desde</label>
                    <input 
                        type="date"
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={filterFechaInicio}
                        onChange={(e) => setFilterFechaInicio(e.target.value)}
                    />
                </div>
                <div className="min-w-[150px]">
                    <label className="block text-xs text-gray-500 font-semibold uppercase mb-1">Hasta</label>
                    <input 
                        type="date"
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={filterFechaFin}
                        onChange={(e) => setFilterFechaFin(e.target.value)}
                    />
                </div>
                <button 
                    onClick={clearFilters}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    Limpiar filtros
                </button>
            </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Results count */}
            <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
                <span className="text-sm text-gray-500">
                    Mostrando <span className="font-semibold text-gray-900">{filteredVacaciones.length}</span> de {vacaciones.length} registros
                </span>
            </div>
            
            {/* Content Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                            <th className="px-6 py-3">RUT</th>
                            <th className="px-6 py-3">Trabajador</th>
                            <th className="px-6 py-3">Tipo</th>
                            <th className="px-6 py-3">Estado</th>
                            <th 
                                className="px-6 py-3 cursor-pointer hover:bg-gray-100 transition-colors select-none"
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
                    <tbody className="divide-y divide-gray-50">
                        {loading && (
                             <tr><td colSpan="8" className="px-6 py-8 text-center text-gray-500">Cargando datos...</td></tr>
                        )}

                        {!loading && (
                            filteredVacaciones.length > 0 ? filteredVacaciones.map((vac, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-mono text-gray-600">{vac.rut}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{vac.full_name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{vac.type || '-'}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                            vac.status === 'accepted' 
                                                ? 'bg-green-50 text-green-700' 
                                                : vac.status === 'pending' 
                                                    ? 'bg-amber-50 text-amber-700'
                                                    : 'bg-gray-100 text-gray-600'
                                        }`}>
                                            {vac.status === 'accepted' ? 'Aceptada' : vac.status === 'pending' ? 'Pendiente' : vac.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(vac.start_date)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(vac.end_date)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-900 font-medium text-center">
                                        {vac.working_days} días
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900 font-medium text-center">
                                        {vac.calendar_days} días
                                    </td>
                                </tr>
                            )) : <tr><td colSpan="8" className="px-6 py-8 text-center text-gray-500">No hay vacaciones activas</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      </main>
    </div>
  );
};

export default VacacionesPage;
