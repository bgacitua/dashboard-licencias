import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import SidebarLayout from '../components/SidebarLayout';
import FiniquitosService from '../services/finiquitos.service';

const ITEMS_PER_PAGE = 50;

const GeneradorFiniquitos = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRut, setSelectedRut] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  // ponytail: fecha_ingreso llega como 'YYYY-MM-DD' o ISO; sin librería de fechas
  const formatFecha = (fecha) => {
    if (!fecha) return 'N/A';
    const [y, m, d] = String(fecha).split('T')[0].split('-');
    return d ? `${d}-${m}-${y}` : fecha;
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const data = await FiniquitosService.getTrabajadoresGeneral();
      setEmployees(data);
    } catch (error) {
      console.error("Error fetching employees:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page on search
  };

  // Normalize search term for flexible matching
  const normalizeText = (text) => {
    if (!text) return '';
    return text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9]/g, ''); // Remove special chars
  };

  const filteredEmployees = employees.filter(emp => {
    // Flexible search (name, RUT, cargo)
    if (searchTerm) {
      const searchNormalized = normalizeText(searchTerm);
      const nameMatch = normalizeText(emp.nombre_trabajador).includes(searchNormalized);
      const rutMatch = emp.rut_trabajador?.replace(/[.-]/g, '').includes(searchTerm.replace(/[.-]/g, ''));
      const cargoMatch = normalizeText(emp.cargo).includes(searchNormalized);
      return nameMatch || rutMatch || cargoMatch;
    }
    
    return true;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredEmployees.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredEmployees.length);
  const paginatedEmployees = filteredEmployees.slice(startIndex, endIndex);

  // Build page numbers to display (smart range with ellipsis)
  const getPageNumbers = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    
    const pages = [];
    pages.push(1);
    
    if (currentPage > 3) pages.push('...');
    
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    
    if (currentPage < totalPages - 2) pages.push('...');
    
    pages.push(totalPages);
    return pages;
  };

  return (
    <SidebarLayout>
      <main className="p-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Generador de Finiquitos</h1>
            <p className="text-gray-500">Selecciona los trabajadores para generar su finiquito.</p>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-wrap gap-4 items-center justify-between">
          <div className="relative flex-1 min-w-[300px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
            <input 
              type="text" 
              placeholder="Buscar por nombre, RUT o cargo..." 
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              value={searchTerm}
              onChange={handleSearch}
            />
          </div>
        </div>

        {/* Selection Action Bar */}
        {selectedRut && (
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-6 flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                <span className="material-symbols-outlined text-sm">check</span>
              </div>
              <span className="font-semibold text-gray-900">Trabajador seleccionado</span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-600 text-sm">
                {employees.find(e => e.rut_trabajador === selectedRut)?.nombre_trabajador}
              </span>
            </div>
            <div className="flex gap-3">
              <button 
                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                onClick={() => setSelectedRut(null)}
              >
                Cancelar
              </button>
              <button 
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
                onClick={() => navigate(`/finiquitos/crear/${selectedRut}`)}
              >
                <span className="material-symbols-outlined text-lg">description</span>
                Generar finiquito
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                  <th className="p-4">Nombre / Cargo</th>
                  <th className="p-4">RUT</th>
                  <th className="p-4">Supervisor</th>
                  <th className="p-4">RUT Supervisor</th>
                  <th className="p-4">Antigüedad</th>
                  <th className="p-4">Ingreso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-gray-500">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
                      Cargando trabajadores...
                    </td>
                  </tr>
                ) : paginatedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-gray-500">No se encontraron trabajadores que coincidan con tu búsqueda.</td>
                  </tr>
                ) : (
                  paginatedEmployees.map((emp) => (
                    <tr
                      key={emp.rut_trabajador}
                      onClick={() => setSelectedRut(prev => prev === emp.rut_trabajador ? null : emp.rut_trabajador)}
                      className={`cursor-pointer hover:bg-gray-50 transition-colors ${selectedRut === emp.rut_trabajador ? 'bg-blue-50' : ''}`}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                            {emp.nombre_trabajador.split(' ').map(n => n[0]).join('').substring(0, 2)}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{emp.nombre_trabajador}</p>
                            <p className="text-xs text-gray-500">{emp.cargo}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-gray-600 font-mono">{emp.rut_trabajador}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">
                            {emp.nombre_jefe ? emp.nombre_jefe[0] : '?'}
                          </div>
                          <span className="text-sm text-gray-700">{emp.nombre_jefe || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-gray-500 font-mono">{emp.rut_jefe || 'N/A'}</td>
                      <td className="p-4">
                        <span className="inline-flex px-2 py-1 rounded bg-gray-100 text-gray-600 text-xs font-medium">
                          {emp.duracion_empresa ? `${emp.duracion_empresa.toFixed(1)}y` : '0y'}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-500">{formatFecha(emp.fecha_ingreso)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {!loading && filteredEmployees.length > 0 && (
            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
              <p className="text-sm text-gray-500">
                Mostrando <span className="font-bold text-gray-900">{startIndex + 1}</span> a <span className="font-bold text-gray-900">{endIndex}</span> de <span className="font-bold text-gray-900">{filteredEmployees.length}</span> trabajadores
              </p>
              <div className="flex gap-1">
                <button 
                  className="p-2 border border-gray-300 rounded-lg bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => prev - 1)}
                >
                  <span className="material-symbols-outlined text-sm">chevron_left</span>
                </button>
                {getPageNumbers().map((page, idx) => (
                  page === '...' ? (
                    <span key={`ellipsis-${idx}`} className="flex items-end px-1 text-gray-400">...</span>
                  ) : (
                    <button
                      key={page}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                        currentPage === page
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-600 hover:bg-gray-200'
                      }`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  )
                ))}
                <button 
                  className="p-2 border border-gray-300 rounded-lg bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                >
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            </div>
          )}
        </div>

      </main>
    </SidebarLayout>
  );
};

export default GeneradorFiniquitos;