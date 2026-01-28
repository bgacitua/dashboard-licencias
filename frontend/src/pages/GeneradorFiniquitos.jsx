import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import Sidebar from '../components/Sidebar';
import FiniquitosService from '../services/finiquitos.service';

const GeneradorFiniquitos = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState([]);

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
  };

  const toggleSelection = (rut) => {
    setSelectedEmployees(prev => 
      prev.includes(rut) ? prev.filter(id => id !== rut) : [...prev, rut]
    );
  };

  const toggleSelectAll = () => {
    if (selectedEmployees.length === filteredEmployees.length) {
      setSelectedEmployees([]);
    } else {
      setSelectedEmployees(filteredEmployees.map(e => e.rut_trabajador));
    }
  };

  const filteredEmployees = employees.filter(emp => 
    emp.nombre_trabajador.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.rut_trabajador.includes(searchTerm)
  );

  return (
    <div className="flex min-h-screen bg-[#f8f9fa] font-['Public_Sans']">
      <Sidebar />

      <main className="flex-1 ml-64 p-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Employee Management</h1>
            <p className="text-gray-500">Manage active employees, view details, and generate legal documents.</p>
          </div>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm shadow-blue-200">
            <span className="material-symbols-outlined">add</span>
            Add New Employee
          </button>
        </div>

        {/* Filters Bar */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-wrap gap-4 items-center justify-between">
          <div className="relative flex-1 min-w-[300px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
            <input 
              type="text" 
              placeholder="Search by name, RUT, or position..." 
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              value={searchTerm}
              onChange={handleSearch}
            />
          </div>
          <div className="flex gap-3">
            <select className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 focus:outline-none focus:border-blue-500 cursor-pointer">
              <option>Department</option>
              {/* Add dynamic departments if available */}
            </select>
            <select className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 focus:outline-none focus:border-blue-500 cursor-pointer">
              <option>Status</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
            <select className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 focus:outline-none focus:border-blue-500 cursor-pointer">
              <option>Location</option>
            </select>
          </div>
        </div>

        {/* Selection Action Bar */}
        {selectedEmployees.length > 0 && (
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-6 flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                <span className="material-symbols-outlined text-sm">check</span>
              </div>
              <span className="font-semibold text-gray-900">
                {selectedEmployees.length} Employee{selectedEmployees.length !== 1 ? 's' : ''} Selected
              </span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-600 text-sm">
                {filteredEmployees.find(e => e.rut_trabajador === selectedEmployees[0])?.nombre_trabajador}
                {selectedEmployees.length > 1 && ` + ${selectedEmployees.length - 1} more`}
              </span>
            </div>
            <div className="flex gap-3">
              <button 
                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                onClick={() => setSelectedEmployees([])}
              >
                Cancel
              </button>
              <button 
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
                onClick={() => navigate(`/finiquitos/crear/${selectedEmployees[0]}`)}
                disabled={selectedEmployees.length !== 1}
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
                  <th className="p-4 w-12 text-center">
                    <input 
                      type="checkbox" 
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={selectedEmployees.length === filteredEmployees.length && filteredEmployees.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="p-4">Name / Position</th>
                  <th className="p-4">RUT</th>
                  <th className="p-4">Supervisor</th>
                  <th className="p-4">Supervisor RUT</th>
                  <th className="p-4">Tenure</th>
                  <th className="p-4">Joined</th>
                  <th className="p-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan="8" className="p-8 text-center text-gray-500">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
                      Loading employees...
                    </td>
                  </tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="p-8 text-center text-gray-500">No employees found matching your search.</td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => (
                    <tr key={emp.rut_trabajador} className={`hover:bg-gray-50 transition-colors ${selectedEmployees.includes(emp.rut_trabajador) ? 'bg-blue-50/30' : ''}`}>
                      <td className="p-4 text-center">
                        <input 
                          type="checkbox" 
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={selectedEmployees.includes(emp.rut_trabajador)}
                          onChange={() => toggleSelection(emp.rut_trabajador)}
                        />
                      </td>
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
                      <td className="p-4 text-sm text-gray-500">{emp.fecha_ingreso}</td>
                      <td className="p-4 text-right">
                        <button className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100">
                          <span className="material-symbols-outlined">more_vert</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination (Static for now) */}
          <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
            <p className="text-sm text-gray-500">
              Showing <span className="font-bold text-gray-900">1</span> to <span className="font-bold text-gray-900">{filteredEmployees.length}</span> of <span className="font-bold text-gray-900">{employees.length}</span> employees
            </p>
            <div className="flex gap-2">
              <button className="p-2 border border-gray-300 rounded-lg bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50" disabled>
                <span className="material-symbols-outlined text-sm">chevron_left</span>
              </button>
              <button className="w-8 h-8 flex items-center justify-center bg-blue-600 text-white rounded-lg text-sm font-medium shadow-sm">1</button>
              <button className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors">2</button>
              <button className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors">3</button>
              <span className="flex items-end px-1 text-gray-400">...</span>
              <button className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors">12</button>
              <button className="p-2 border border-gray-300 rounded-lg bg-white text-gray-500 hover:bg-gray-50">
                <span className="material-symbols-outlined text-sm">chevron_right</span>
              </button>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
};

export default GeneradorFiniquitos;