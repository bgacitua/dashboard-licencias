import React, { useState } from 'react';
import Sidebar from '../components/Sidebar';
import { useLicencias } from '../hooks/useLicencias';

const LicenciasPage = () => {
  const { 
    vigentes, 
    porVencer, 
    vencidasRecientes,
    loading 
  } = useLicencias();

  const [activeTab, setActiveTab] = useState('activas');

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  const calculateDaysDiff = (targetDate) => {
    if (!targetDate) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0); 
    const diffTime = target - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays; 
  };
    
  const calculateDaysOverdue = (targetDate) => {
      return Math.abs(calculateDaysDiff(targetDate));
  };

  const calculateDuration = (start, end) => {
      if (!start || !end) return 0;
      const startDate = new Date(start);
      const endDate = new Date(end);
      const diffTime = Math.abs(endDate - startDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      return diffDays + 1; // Inclusive count usually preferred for leave days
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
                <span className="text-gray-900 font-medium">Detalle Licencias</span>
            </div>
            <div className="flex items-center gap-4">
                <button className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors">
                    <span className="material-symbols-outlined">notifications</span>
                </button>
            </div>
        </header>

        <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Detalle de Licencias Médicas</h1>
            <p className="text-gray-500">Gestión y visualización completa del estado de licencias.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-6">
                <button
                    onClick={() => setActiveTab('activas')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'activas'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    Activas ({vigentes.length})
                </button>
                <button
                    onClick={() => setActiveTab('por_vencer')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'por_vencer'
                        ? 'border-amber-500 text-amber-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    Por Vencer ({porVencer.length})
                </button>
                <button
                    onClick={() => setActiveTab('vencidas')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'vencidas'
                        ? 'border-red-500 text-red-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    Vencidas ({vencidasRecientes.length})
                </button>
            </div>

            {/* Content Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                            <th className="px-6 py-3">RUT</th>
                            <th className="px-6 py-3">Trabajador</th>
                            <th className="px-6 py-3">Tipo</th>
                            <th className="px-6 py-3">Inicio</th>
                            <th className="px-6 py-3">Término</th>
                            <th className="px-6 py-3">Duración</th>
                            {activeTab !== 'activas' && (
                                <th className="px-6 py-3 text-right">
                                    {activeTab === 'por_vencer' ? 'Días Restantes' : 'Días Vencida'}
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading && (
                             <tr><td colSpan="7" className="px-6 py-8 text-center text-gray-500">Cargando datos...</td></tr>
                        )}

                        {!loading && activeTab === 'activas' && (
                            vigentes.length > 0 ? vigentes.map((lic, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-mono text-gray-600">{lic.rut_empleado || lic.rut_trabajador}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{lic.nombre_completo || lic.nombre_trabajador}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{lic.tipo_permiso || lic.motivo || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(lic.fecha_inicio)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(lic.fecha_fin)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                                        {lic.dias_duracion || calculateDuration(lic.fecha_inicio, lic.fecha_fin)} días
                                    </td>
                                </tr>
                            )) : <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-500">No hay licencias activas</td></tr>
                        )}

                        {!loading && activeTab === 'por_vencer' && (
                            porVencer.length > 0 ? porVencer.map((lic, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-mono text-gray-600">{lic.rut_empleado || lic.rut_trabajador}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{lic.nombre_completo || lic.nombre_trabajador}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{lic.tipo_permiso || lic.motivo || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(lic.fecha_inicio)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(lic.fecha_fin)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                                        {lic.dias_duracion || calculateDuration(lic.fecha_inicio, lic.fecha_fin)} días
                                    </td>
                                    <td className="px-6 py-4 text-sm font-bold text-amber-600 text-right">
                                        {lic.dias_restantes !== undefined ? lic.dias_restantes : calculateDaysDiff(lic.fecha_fin)} días
                                    </td>
                                </tr>
                            )) : <tr><td colSpan="7" className="px-6 py-8 text-center text-gray-500">No hay licencias por vencer</td></tr>
                        )}

                        {!loading && activeTab === 'vencidas' && (
                             vencidasRecientes.length > 0 ? vencidasRecientes.map((lic, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-mono text-gray-600">{lic.rut_empleado || lic.rut_trabajador}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{lic.nombre_completo || lic.nombre_trabajador}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{lic.tipo_permiso || lic.motivo || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(lic.fecha_inicio)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(lic.fecha_fin)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                                        {lic.dias_duracion || calculateDuration(lic.fecha_inicio, lic.fecha_fin)} días
                                    </td>
                                    <td className="px-6 py-4 text-sm font-bold text-red-600 text-right">
                                        {lic.dias_vencida !== undefined ? lic.dias_vencida : calculateDaysOverdue(lic.fecha_fin)} días
                                    </td>
                                </tr>
                            )) : <tr><td colSpan="7" className="px-6 py-8 text-center text-gray-500">No hay licencias vencidas recientemente</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      </main>
    </div>
  );
};

export default LicenciasPage;
