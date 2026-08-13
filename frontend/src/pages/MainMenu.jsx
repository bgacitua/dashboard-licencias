import React from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';

const menuItems = [
  {
    id: 'dashboard',
    title: 'Torniquetes',
    description: 'Consulta y filtra los marcajes de entrada y salida registrados en los torniquetes.',
    path: '/dashboard',
    icon: 'sensor_door',
    accent: 'bg-blue-50 text-primary',
    bar: 'bg-primary',
    moduleCode: 'dashboard',
    requiredRole: ['rrhh', 'admin'],
  },
  {
    id: 'finiquitos',
    title: 'Generador de Finiquitos',
    description: 'Crea, valida y descarga documentos de término de contrato legales.',
    path: '/finiquitos',
    icon: 'description',
    accent: 'bg-violet-50 text-violet-600',
    bar: 'bg-violet-500',
    moduleCode: 'finiquitos',
    requiredRole: ['rrhh', 'admin'],
  },
  {
    id: 'calculadora',
    title: 'Calculadora de Sueldos',
    description: 'Simula sueldos líquidos, brutos y costos empresa con parámetros actualizados.',
    path: '/calculadora',
    icon: 'calculate',
    accent: 'bg-amber-50 text-amber-600',
    bar: 'bg-amber-500',
    moduleCode: 'calculadora',
    requiredRole: ['rrhh', 'admin'],
  },
  {
    id: 'costos',
    title: 'Costos por Área',
    description: 'Analiza el costo real ejecutado por empresa, área, jefatura, cargo o persona.',
    path: '/costos',
    icon: 'wallet',
    accent: 'bg-teal-50 text-teal-600',
    bar: 'bg-teal-500',
    moduleCode: 'costos',
    requiredRole: ['rrhh', 'admin'],
  },
  {
    id: 'contract_alerts',
    title: 'Alertas de Contratos',
    description: 'Visualiza vencimientos, envía notificaciones a jefaturas y gestiona renovaciones.',
    path: '/contract-alerts',
    icon: 'notifications_active',
    accent: 'bg-orange-50 text-orange-600',
    bar: 'bg-orange-500',
    moduleCode: 'contract_alerts',
    requiredRole: ['rrhh', 'admin'],
  },
  {
    id: 'seleccion',
    title: 'Selección de Personal',
    description: 'Administra candidatos, programa entrevistas y sigue procesos de reclutamiento.',
    path: '/seleccion',
    icon: 'person_search',
    accent: 'bg-emerald-50 text-emerald-600',
    bar: 'bg-emerald-500',
    moduleCode: 'seleccion',
    requiredRole: ['rrhh', 'admin', 'seleccion'],
  },
  {
    id: 'creditos',
    title: 'Créditos',
    description: 'Genera el pagaré, gestiona su firma en BUK y carga el crédito al trabajador.',
    path: '/creditos',
    icon: 'payments',
    accent: 'bg-indigo-50 text-indigo-600',
    bar: 'bg-indigo-500',
    moduleCode: 'creditos',
    requiredRole: ['rrhh', 'admin'],
  },
  {
    id: 'admin',
    title: 'Administración',
    description: 'Configura usuarios, roles y parámetros del sistema.',
    path: '/admin',
    icon: 'settings',
    accent: 'bg-slate-100 text-slate-500',
    bar: 'bg-slate-400',
    moduleCode: 'admin',
    requiredRole: ['admin'],
  },
];

const now = new Date();
const hour = now.getHours();
const greeting =
  hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

const MainMenu = () => {
  const { user, hasModuleAccess, hasRole } = useAuth();

  const visibleItems = menuItems.filter(item => {
    if (item.requiredRole && !hasRole(item.requiredRole)) return false;
    return hasModuleAccess(item.moduleCode);
  });

  const firstName = (user?.nombre_completo || user?.username || 'Usuario')
    .split(' ')[0];

  return (
    <div className="min-h-screen bg-slate-50 font-['Public_Sans']">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Header */}
        <header className="mb-10">
          <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-1">
            {greeting}
          </p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1.5 text-slate-500 text-base">
            Selecciona un módulo para comenzar.
          </p>
        </header>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

          {visibleItems.map(item => (
            <Link
              key={item.id}
              to={item.path}
              className="group relative bg-white rounded-2xl border border-slate-200 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col"
            >
              {/* Barra de color superior */}
              <span className={`block h-1 w-full ${item.bar} rounded-t-2xl`} aria-hidden="true" />

              <div className="flex flex-col gap-4 p-6 flex-1">
                {/* Icono */}
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${item.accent}`}>
                  <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
                </div>

                {/* Texto */}
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-slate-900 leading-snug mb-1.5">
                    {item.title}
                  </h2>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                {/* CTA inline */}
                <div className="flex items-center gap-1.5 text-sm font-semibold text-primary opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200">
                  <span>Abrir módulo</span>
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </div>
              </div>
            </Link>
          ))}

          {/* Próximamente */}
          <div className="relative bg-white rounded-2xl border border-dashed border-slate-200 overflow-hidden flex flex-col opacity-60">
            <span className="block h-1 w-full bg-slate-200 rounded-t-2xl" aria-hidden="true" />
            <div className="flex flex-col gap-4 p-6 flex-1">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-slate-100 text-slate-400">
                <span className="material-symbols-outlined text-[22px]">lock_clock</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <h2 className="text-base font-semibold text-slate-400 leading-snug">
                    Gestión de Desempeño
                  </h2>
                  <span className="text-[11px] font-bold uppercase tracking-wide bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">
                    Próximamente
                  </span>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Evaluación y seguimiento de objetivos en construcción.
                </p>
              </div>
            </div>
          </div>

          {/* Sin módulos */}
          {visibleItems.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-slate-400 text-3xl">lock</span>
              </div>
              <p className="text-slate-600 font-semibold">Sin módulos asignados</p>
              <p className="text-sm text-slate-400 mt-1">Contacta al administrador para solicitar acceso.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default MainMenu;
