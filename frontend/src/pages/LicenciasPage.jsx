import React, { useState } from 'react';
import SidebarLayout from '../components/SidebarLayout';
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
    <SidebarLayout>
      <main className="p-8">
        {/* Header */}
        <header className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-2 text-sm text-app-muted">
                <span className="material-symbols-outlined text-lg">home</span>
                <span>/</span>
                <span className="text-app-ink font-medium">Detalle Licencias</span>
            </div>
            <div className="flex items-center gap-4">
                <button className="relative p-2 text-app-outline hover:text-app-muted transition-colors">
                    <span className="material-symbols-outlined">notifications</span>
                </button>
            </div>
        </header>

        <div className="mb-8">
            <h1 className="text-2xl font-bold text-app-ink mb-1">Detalle de Licencias Médicas</h1>
            <p className="text-app-muted">Gestión y visualización completa del estado de licencias.</p>
        </div>

        <div className="bg-white rounded-xl  border border-app-line overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-app-line px-6">
                <button
                    onClick={() => setActiveTab('activas')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'activas'
                        ? 'border-app-ink text-app-brand'
                        : 'border-transparent text-app-muted hover:text-app-muted'
                    }`}
                >
                    Activas ({vigentes.length})
                </button>
                <button
                    onClick={() => setActiveTab('por_vencer')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'por_vencer'
                        ? 'border-app-ink text-app-brand'
                        : 'border-transparent text-app-muted hover:text-app-muted'
                    }`}
                >
                    Por Vencer ({porVencer.length})
                </button>
                <button
                    onClick={() => setActiveTab('vencidas')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'vencidas'
                        ? 'border-red-500 text-red-600'
                        : 'border-transparent text-app-muted hover:text-app-muted'
                    }`}
                >
                    Vencidas ({vencidasRecientes.length})
                </button>
            </div>

            {/* Content Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-app-surface border-b border-app-line text-xs uppercase text-app-muted font-semibold">
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
                    <tbody className="divide-y divide-app-line">
                        {loading && (
                             <tr><td colSpan="7" className="px-6 py-8 text-center text-app-muted">Cargando datos...</td></tr>
                        )}

                        {!loading && activeTab === 'activas' && (
                            vigentes.length > 0 ? vigentes.map((lic, idx) => (
                                <tr key={idx} className="hover:bg-app-surface transition-colors">
                                    <td className="px-6 py-4 text-sm font-mono text-app-muted">{lic.rut_empleado || lic.rut_trabajador}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-app-ink">{lic.nombre_completo || lic.nombre_trabajador}</td>
                                    <td className="px-6 py-4 text-sm text-app-muted">{lic.tipo_permiso || lic.motivo || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-app-muted">{formatDate(lic.fecha_inicio)}</td>
                                    <td className="px-6 py-4 text-sm text-app-muted">{formatDate(lic.fecha_fin)}</td>
                                    <td className="px-6 py-4 text-sm text-app-ink font-medium">
                                        {lic.dias_duracion || calculateDuration(lic.fecha_inicio, lic.fecha_fin)} días
                                    </td>
                                </tr>
                            )) : <tr><td colSpan="6" className="px-6 py-8 text-center text-app-muted">No hay licencias activas</td></tr>
                        )}

                        {!loading && activeTab === 'por_vencer' && (
                            porVencer.length > 0 ? porVencer.map((lic, idx) => (
                                <tr key={idx} className="hover:bg-app-surface transition-colors">
                                    <td className="px-6 py-4 text-sm font-mono text-app-muted">{lic.rut_empleado || lic.rut_trabajador}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-app-ink">{lic.nombre_completo || lic.nombre_trabajador}</td>
                                    <td className="px-6 py-4 text-sm text-app-muted">{lic.tipo_permiso || lic.motivo || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-app-muted">{formatDate(lic.fecha_inicio)}</td>
                                    <td className="px-6 py-4 text-sm text-app-muted">{formatDate(lic.fecha_fin)}</td>
                                    <td className="px-6 py-4 text-sm text-app-ink font-medium">
                                        {lic.dias_duracion || calculateDuration(lic.fecha_inicio, lic.fecha_fin)} días
                                    </td>
                                    <td className="px-6 py-4 text-sm font-bold text-app-brand text-right">
                                        {lic.dias_restantes !== undefined ? lic.dias_restantes : calculateDaysDiff(lic.fecha_fin)} días
                                    </td>
                                </tr>
                            )) : <tr><td colSpan="7" className="px-6 py-8 text-center text-app-muted">No hay licencias por vencer</td></tr>
                        )}

                        {!loading && activeTab === 'vencidas' && (
                             vencidasRecientes.length > 0 ? vencidasRecientes.map((lic, idx) => (
                                <tr key={idx} className="hover:bg-app-surface transition-colors">
                                    <td className="px-6 py-4 text-sm font-mono text-app-muted">{lic.rut_empleado || lic.rut_trabajador}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-app-ink">{lic.nombre_completo || lic.nombre_trabajador}</td>
                                    <td className="px-6 py-4 text-sm text-app-muted">{lic.tipo_permiso || lic.motivo || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-app-muted">{formatDate(lic.fecha_inicio)}</td>
                                    <td className="px-6 py-4 text-sm text-app-muted">{formatDate(lic.fecha_fin)}</td>
                                    <td className="px-6 py-4 text-sm text-app-ink font-medium">
                                        {lic.dias_duracion || calculateDuration(lic.fecha_inicio, lic.fecha_fin)} días
                                    </td>
                                    <td className="px-6 py-4 text-sm font-bold text-red-600 text-right">
                                        {lic.dias_vencida !== undefined ? lic.dias_vencida : calculateDaysOverdue(lic.fecha_fin)} días
                                    </td>
                                </tr>
                            )) : <tr><td colSpan="7" className="px-6 py-8 text-center text-app-muted">No hay licencias vencidas recientemente</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      </main>
    </SidebarLayout>
  );
};

export default LicenciasPage;
