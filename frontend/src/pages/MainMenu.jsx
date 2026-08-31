import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { getEstadoSesionMicrosoft } from '../services/contractAlerts';

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
    id: 'asistencia',
    title: 'Asistencia',
    description: 'Revisa marcas, turnos y bonos de asistencia del personal.',
    path: '/asistencia',
    icon: 'schedule',
    moduleCode: 'asistencia',
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

// ponytail: ventana fija de 8 tarjetas que avanza de a 2; sin animacion ni virtualizacion
const PAGE = 8;
const STEP = 2;

const now = new Date();
const hour = now.getHours();
const greeting =
  hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

// Aviso del estado de la sesión de Microsoft. Sin ella no sale ningún correo
// automático, y hasta ahora eso solo se notaba al intentar enviar uno: se podían
// perder horas antes de que alguien se diera cuenta.
const EstadoCorreo = () => {
  // null = todavía consultando, o no se pudo verificar. En ambos casos no se
  // muestra nada: un aviso a medias preocupa sin decir qué hacer.
  const [autorizado, setAutorizado] = useState(null);

  useEffect(() => {
    getEstadoSesionMicrosoft()
      .then(data => setAutorizado(data.autorizado))
      .catch(() => setAutorizado(null));
  }, []);

  if (autorizado === null) return null;

  if (autorizado) {
    return (
      <p className="flex items-center gap-1.5 text-[12px] text-app-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        Correo automático activo
      </p>
    );
  }

  return (
    <Link
      to="/contract-alerts"
      className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-700 hover:underline"
    >
      <span className="material-symbols-outlined text-[16px]">warning</span>
      Sesión de Microsoft caída: no se están enviando correos
    </Link>
  );
};


const MainMenu = () => {
  const { user, hasModuleAccess, hasRole } = useAuth();
  const [offset, setOffset] = useState(0);

  const visibleItems = menuItems.filter(item => {
    if (item.requiredRole && !hasRole(item.requiredRole)) return false;
    return hasModuleAccess(item.moduleCode);
  });

  const maxOffset = Math.max(0, visibleItems.length - PAGE);
  const start = Math.min(offset, maxOffset);
  const pageItems = visibleItems.slice(start, start + PAGE);

  const firstName = (user?.nombre_completo || user?.username || 'Usuario')
    .split(' ')[0];

  return (
    <div className="min-h-screen bg-app-surface font-app text-app-ink">
      <Navbar />

      {/* 4rem = alto del Navbar: el contenido ocupa el resto sin desbordar */}
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1280px] flex-col justify-center px-4 py-8 md:px-10">

        {/* Header */}
        <header className="mb-6 flex items-end justify-between gap-4">
          <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-app-ink">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-[14px] text-app-muted">
            Selecciona un módulo para comenzar.
          </p>
          {/* Solo a quien tiene acceso a Alertas de Contratos: es quien puede
              reautorizar. Para el resto seria ruido que no puede accionar. */}
          {hasModuleAccess('contract_alerts') && (
            <div className="mt-2">
              <EstadoCorreo />
            </div>
          )}
          </div>

          {maxOffset > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Módulos anteriores"
                disabled={start === 0}
                onClick={() => setOffset(Math.max(0, start - STEP))}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-app-line text-app-ink transition-colors hover:border-app-ink disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-app-ink focus:ring-offset-2"
              >
                <span className="material-symbols-outlined text-[20px]">chevron_left</span>
              </button>
              <button
                type="button"
                aria-label="Módulos siguientes"
                disabled={start >= maxOffset}
                onClick={() => setOffset(Math.min(maxOffset, start + STEP))}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-app-line text-app-ink transition-colors hover:border-app-ink disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-app-ink focus:ring-offset-2"
              >
                <span className="material-symbols-outlined text-[20px]">chevron_right</span>
              </button>
            </div>
          )}
        </header>

        {/* Grid: 4 columnas en pantallas anchas para que 8 módulos entren en 2 filas */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">

          {pageItems.map(item => (
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
