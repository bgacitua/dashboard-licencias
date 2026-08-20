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
    moduleCode: 'dashboard',
    requiredRole: ['rrhh', 'admin'],
  },
  {
    id: 'finiquitos',
    title: 'Generador de Finiquitos',
    description: 'Crea, valida y descarga documentos de término de contrato legales.',
    path: '/finiquitos',
    icon: 'description',
    moduleCode: 'finiquitos',
    requiredRole: ['rrhh', 'admin'],
  },
  {
    id: 'calculadora',
    title: 'Calculadora de Sueldos',
    description: 'Simula sueldos líquidos, brutos y costos empresa con parámetros actualizados.',
    path: '/calculadora',
    icon: 'calculate',
    moduleCode: 'calculadora',
    requiredRole: ['rrhh', 'admin'],
  },
  {
    id: 'costos',
    title: 'Costos por Área',
    description: 'Analiza el costo real ejecutado por empresa, área, jefatura, cargo o persona.',
    path: '/costos',
    icon: 'wallet',
    moduleCode: 'costos',
    requiredRole: ['rrhh', 'admin'],
  },
  {
    id: 'contract_alerts',
    title: 'Alertas de Contratos',
    description: 'Visualiza vencimientos, envía notificaciones a jefaturas y gestiona renovaciones.',
    path: '/contract-alerts',
    icon: 'notifications_active',
    moduleCode: 'contract_alerts',
    requiredRole: ['rrhh', 'admin'],
  },
  {
    id: 'seleccion',
    title: 'Selección de Personal',
    description: 'Administra candidatos, programa entrevistas y sigue procesos de reclutamiento.',
    path: '/seleccion',
    icon: 'person_search',
    moduleCode: 'seleccion',
    requiredRole: ['rrhh', 'admin', 'seleccion'],
  },
  {
    id: 'creditos',
    title: 'Créditos',
    description: 'Genera el pagaré, gestiona su firma en BUK y carga el crédito al trabajador.',
    path: '/creditos',
    icon: 'payments',
    moduleCode: 'creditos',
    requiredRole: ['rrhh', 'admin'],
  },
  {
    id: 'admin',
    title: 'Administración',
    description: 'Configura usuarios, roles y parámetros del sistema.',
    path: '/admin',
    icon: 'settings',
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
    <div className="min-h-screen bg-app-surface font-app text-app-ink">
      <Navbar />

      {/* 4rem = alto del Navbar: el contenido ocupa el resto sin desbordar */}
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1280px] flex-col justify-center px-4 py-8 md:px-10">

        {/* Header */}
        <header className="mb-6">
          <h1 className="text-[20px] font-semibold tracking-tight text-app-ink">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-[14px] text-app-muted">
            Selecciona un módulo para comenzar.
          </p>
        </header>

        {/* Grid: 4 columnas en pantallas anchas para que 8 módulos entren en 2 filas */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">

          {visibleItems.map(item => (
            <Link
              key={item.id}
              to={item.path}
              className="group flex flex-col rounded-xl border border-app-line bg-white p-5 transition-colors hover:border-app-ink focus:outline-none focus:ring-2 focus:ring-app-ink focus:ring-offset-2"
            >
              <div className="mb-3 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-app-surface">
                <span className="material-symbols-outlined text-[20px] text-app-brand">{item.icon}</span>
              </div>

              <h2 className="mb-1.5 text-[16px] font-semibold leading-snug text-app-ink">
                {item.title}
              </h2>
              <p className="flex-1 text-[13px] leading-relaxed text-app-muted">
                {item.description}
              </p>

              <div className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-app-brand">
                <span>Abrir módulo</span>
                <span className="material-symbols-outlined text-[16px] transition-transform group-hover:translate-x-0.5">arrow_forward</span>
              </div>
            </Link>
          ))}

          {/* Sin módulos */}
          {visibleItems.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-app-surface">
                <span className="material-symbols-outlined text-[22px] text-app-outline">lock</span>
              </div>
              <p className="font-semibold text-app-ink">Sin módulos asignados</p>
              <p className="mt-1 text-[14px] text-app-muted">Contacta al administrador para solicitar acceso.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default MainMenu;
