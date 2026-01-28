import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useLicencias } from "../hooks/useLicencias";
import { useMarcas } from "../hooks/useMarcas";
import Sidebar from "../components/Sidebar";

// Stats Card Component
const StatCard = ({ title, value, subtext, icon, color, trend, trendValue, to }) => (
  <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between h-full relative overflow-hidden">
    <div className={`absolute top-0 right-0 p-4 opacity-10`}>
        <span className="material-symbols-outlined text-6xl" style={{ color }}>{icon}</span>
    </div>
    
    <div className="flex justify-between items-start mb-4">
      <div>
        <h3 className="text-gray-500 text-sm font-medium mb-1">{title}</h3>
        <span className="text-4xl font-bold text-gray-900">{value}</span>
      </div>
      <div className={`p-2 rounded-lg bg-${color}-50`}>
         {/* Icon placeholder if needed, or just use the background color */}
         <span className="material-symbols-outlined" style={{ color }}>{icon}</span>
      </div>
    </div>

    <div className="flex items-center gap-2 mt-auto">
      {trend && (
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${trend === 'up' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
          {trend === 'up' ? '↗' : '↘'} {trendValue}
        </span>
      )}
      <span className="text-xs text-gray-400">{subtext}</span>
    </div>
    
    {to && (
        <Link to={to} className="absolute inset-0" />
    )}
  </div>
);

// Table Component
const AsistenciaTable = ({ marcas, loading, hasMore, onLoadMore, loadingMore }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
              <th className="px-6 py-4">Reloj</th>
              <th className="px-6 py-4">Nombre</th>
              <th className="px-6 py-4">RUT</th>
              <th className="px-6 py-4">Hora Marca</th>
              <th className="px-6 py-4">Tipo de Marca</th>
              <th className="px-6 py-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
               <tr>
                 <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                   <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
                   Cargando datos...
                 </td>
               </tr>
            ) : marcas.length === 0 ? (
                <tr>
                    <td colSpan="6" className="px-6 py-8 text-center text-gray-500">No se encontraron registros.</td>
                </tr>
            ) : (
              marcas.map((marca, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-600 flex items-center gap-2">
                    <span className="material-symbols-outlined text-gray-400 text-lg">watch</span>
                    {marca.nombre_reloj}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                        {marca.nombre_completo.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{marca.nombre_completo}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 font-mono">{marca.rut}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium">{marca.hora_marca}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      marca.tipo_marca === 'IN' ? 'bg-green-50 text-green-700' : 
                      marca.tipo_marca === 'OUT' ? 'bg-gray-100 text-gray-700' : 'bg-blue-50 text-blue-700'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                         marca.tipo_marca === 'IN' ? 'bg-green-500' : 
                         marca.tipo_marca === 'OUT' ? 'bg-gray-500' : 'bg-blue-500'
                      }`}></span>
                      {marca.tipo_marca === 'IN' ? 'Entrada' : marca.tipo_marca === 'OUT' ? 'Salida' : marca.tipo_marca}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-gray-400 hover:text-gray-600">
                      <span className="material-symbols-outlined">more_vert</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination / Load More */}
      <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
        <span className="text-sm text-gray-500">
            Mostrando {marcas.length} resultados
        </span>
        <div className="flex gap-2">
            {hasMore && (
                <button 
                    onClick={onLoadMore}
                    disabled={loadingMore}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                    {loadingMore ? 'Cargando...' : 'Cargar más'}
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { resumen, loading: loadingLicencias } = useLicencias();
  const {
    marcas,
    loading: loadingMarcas,
    loadingMore,
    hasMore,
    cargarMas,
    filters,
    aplicarFiltros
  } = useMarcas();

  const [searchTerm, setSearchTerm] = useState("");

  const handleSearch = (e) => {
      e.preventDefault();
      aplicarFiltros({ ...filters, nombre: searchTerm }); // Simple search by name for now
  };

  return (
    <div className="flex min-h-screen bg-[#f8f9fa] font-['Public_Sans']">
      <Sidebar />
      
      <main className="flex-1 ml-64 p-8">
        {/* Top Header */}
        <header className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="material-symbols-outlined text-lg">home</span>
                <span>/</span>
                <span className="text-gray-900 font-medium">Dashboard</span>
            </div>
            <div className="flex items-center gap-4">
                <button className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors">
                    <span className="material-symbols-outlined">notifications</span>
                    <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                </button>
                <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                    <span className="material-symbols-outlined">help</span>
                </button>
            </div>
        </header>

        {/* Title Section */}
        <div className="flex justify-between items-end mb-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Gestión de Licencias y Asistencia</h1>
                <p className="text-gray-500">Monitoreo en tiempo real de licencias médicas y control de asistencia.</p>
            </div>
            <div className="flex gap-3">
                <div className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700">
                    <span className="material-symbols-outlined text-gray-500">calendar_today</span>
                    <span>Octubre 2023</span> {/* Placeholder date */}
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200">
                    <span className="material-symbols-outlined text-lg">download</span>
                    Exportar Reporte
                </button>
            </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatCard 
                title="Licencias vencidas (7 días)"
                value={resumen.vencidasRecientes}
                subtext="Requiere revisión"
                icon="warning"
                color="red" // Tailwind color name
                trend="up"
                trendValue="+2 desde ayer"
                to="/dashboard/vencidas"
            />
            <StatCard 
                title="Licencias activas"
                value={resumen.vigentes}
                subtext="Total del mes en curso"
                icon="check_circle"
                color="green"
                to="/dashboard/vigentes"
            />
            <StatCard 
                title="Por vencer (próximos 7 días)"
                value={resumen.porVencer}
                subtext="Requiere revisión"
                icon="hourglass_top"
                color="amber"
                to="/dashboard/por-vencer"
            />
        </div>

        {/* Assistance Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold text-gray-900">Registro de Asistencia</h2>
                <form onSubmit={handleSearch} className="relative w-96">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-xl">search</span>
                    <input 
                        type="text" 
                        placeholder="Buscar por Nombre o RUT..." 
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </form>
            </div>

            <AsistenciaTable 
                marcas={marcas} 
                loading={loadingMarcas} 
                hasMore={hasMore} 
                onLoadMore={cargarMas}
                loadingMore={loadingMore}
            />
        </div>

      </main>
    </div>
  );
};

export default Dashboard;
