import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const allMenuItems = [
  { icon: 'sensor_door',          label: 'Torniquetes',            path: '/dashboard',           module: 'dashboard' },
  { icon: 'description',          label: 'Generador Finiquitos',   path: '/finiquitos',          module: 'finiquitos' },
  { icon: 'calculate',            label: 'Calculadora Sueldos',    path: '/calculadora',         module: 'calculadora' },
  { icon: 'wallet',               label: 'Costos por Área',        path: '/costos',              module: 'costos' },
  { icon: 'notifications_active', label: 'Alertas de Contratos',   path: '/contract-alerts',     module: 'contract_alerts' },
  { icon: 'more_time',            label: 'Horas Extras',           path: '/dashboard/horas-extras', module: 'dashboard' },
  { icon: 'person_search',        label: 'Selección de Personal',  path: '/seleccion',           module: 'seleccion' },
  { icon: 'payments',             label: 'Créditos',               path: '/creditos',            module: 'creditos' },
  { icon: 'fingerprint',          label: 'Asistencia',             path: '/asistencia',          module: 'asistencia',
    children: [
      { label: 'Gestión de asistencia', path: '/asistencia' },
      { label: 'Reportes',              path: '/asistencia/reportes' },
    ] },
  { icon: 'assignment',           label: 'Formularios',            path: '/formularios/gestor',  module: 'formularios' },
  { icon: 'confirmation_number',  label: 'Tickets',                path: '/tickets/admin',       module: 'tickets' },
  { icon: 'settings',             label: 'Administración',         path: '/admin',               module: 'admin' },
];

const Sidebar = ({ collapsed = false, onToggle }) => {
  const { user, logout, hasModuleAccess } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Qué submenús abrió o cerró el usuario a mano, por label. Lo que no tocó no
  // queda acá: cae al default de estar dentro de la ruta del módulo, así que
  // entrar a Asistencia lo sigue desplegando solo.
  const [toggles, setToggles] = useState({});

  const alternar = (label) => setToggles((prev) => ({
    ...prev,
    [label]: !(prev[label] ?? location.pathname.startsWith(
      allMenuItems.find((i) => i.label === label).path
    )),
  }));

  const isActive = (path) => location.pathname === path;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Los módulos del perfil son la única fuente de verdad, igual que en las
  // rutas (ninguna usa `requiredRoles`). Un `requiredRole` acá solo escondía
  // items que el usuario sí podía abrir escribiendo la URL.
  const menuItems = allMenuItems.filter(item => hasModuleAccess(item.module));

  const initials = (user?.nombre_completo || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase())
    .join('');

  return (
    <aside
      className={`
        fixed left-0 top-0 z-50 flex h-screen flex-col
        border-r border-app-line bg-white font-app text-app-ink
        transition-[width] duration-200 ease-in-out
        ${collapsed ? 'w-16' : 'w-64'}
      `}
    >
      {/* Header: logo + toggle */}
      <div className={`flex h-16 flex-shrink-0 items-center border-b border-app-line ${collapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
        {!collapsed && (
          <Link to="/menu" className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-80">
            <span className="material-symbols-outlined flex-shrink-0 text-[24px] text-app-brand">corporate_fare</span>
            <span className="truncate text-[15px] font-semibold tracking-tight">Plataforma de Personas</span>
          </Link>
        )}

        {collapsed && (
          <Link to="/menu" title="Plataforma de Personas" className="transition-opacity hover:opacity-80">
            <span className="material-symbols-outlined text-[24px] text-app-brand">corporate_fare</span>
          </Link>
        )}

        <button
          onClick={onToggle}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          className={`
            flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg
            text-app-muted transition-colors hover:bg-app-surface hover:text-app-ink
            ${collapsed ? 'absolute -right-3.5 top-4 rounded-full border border-app-line bg-white' : ''}
          `}
        >
          <span className="material-symbols-outlined text-[18px]">
            {collapsed ? 'chevron_right' : 'chevron_left'}
          </span>
        </button>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 space-y-1 overflow-y-auto overflow-x-hidden py-4 ${collapsed ? 'px-2' : 'px-3'}`}>
        {!collapsed && (
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-app-muted">
            Navegación
          </p>
        )}

        {menuItems.map((item) => {
          const active = isActive(item.path);
          // Por defecto se despliega al entrar al módulo, pero el chevron manda:
          // si el usuario lo tocó, gana su decisión. El menú colapsado no tiene
          // ancho para los hijos. Vale para cualquier item con `children`.
          const abierto = !collapsed && !!item.children
            && (toggles[item.label] ?? location.pathname.startsWith(item.path));
          const idSub = `submenu-${item.module}`;
          return (
            <React.Fragment key={item.label}>
            {/* El chevron es hermano del enlace, no va adentro: un <button>
                dentro de un <a> es HTML inválido y rompe el foco. */}
            <div className="relative">
              <Link
                to={item.path}
                title={collapsed ? item.label : undefined}
                className={`
                  group flex items-center gap-3 rounded-lg text-[14px] transition-colors duration-150
                  ${collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'}
                  ${!collapsed && item.children ? 'pr-10' : ''}
                  ${active
                    ? 'bg-app-brand font-semibold text-white'
                    : 'text-app-muted hover:bg-app-surface hover:text-app-ink'}
                `}
              >
                <span className={`material-symbols-outlined flex-shrink-0 text-[20px] ${active ? 'text-white' : 'text-app-outline group-hover:text-app-ink'}`}>
                  {item.icon}
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>

              {!collapsed && item.children && (
                <button
                  type="button"
                  onClick={() => alternar(item.label)}
                  aria-expanded={abierto}
                  aria-controls={idSub}
                  aria-label={`${abierto ? 'Ocultar' : 'Mostrar'} submódulos de ${item.label}`}
                  className={`
                    absolute right-1 top-1/2 -translate-y-1/2 flex h-7 w-7
                    items-center justify-center rounded-md transition-colors duration-150
                    ${active
                      ? 'text-white hover:bg-white/20'
                      : 'text-app-outline hover:bg-app-line hover:text-app-ink'}
                  `}
                >
                  <span
                    className={`
                      material-symbols-outlined text-[18px]
                      transition-transform duration-200 ease-out
                      ${abierto ? 'rotate-90' : ''}
                    `}
                  >
                    chevron_right
                  </span>
                </button>
              )}
            </div>

            {/* Despliegue animado sin medir alturas: la fila del grid va de 0fr
                a 1fr y el hijo con overflow-hidden se recorta solo. `invisible`
                saca los enlaces del tab order mientras está cerrado. */}
            {item.children && (
              <div
                id={idSub}
                className={`
                  grid transition-[grid-template-rows,opacity] duration-200 ease-out
                  ${abierto ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 invisible'}
                `}
                aria-hidden={!abierto}
              >
                <div className="overflow-hidden">
                  <div className="space-y-1 py-1">
                    {item.children.map((sub) => (
                      <Link
                        key={sub.path}
                        to={sub.path}
                        tabIndex={abierto ? undefined : -1}
                        className={`
                          ml-6 flex items-center rounded-lg px-3 py-2 text-[13px]
                          transition-colors duration-150
                          ${isActive(sub.path)
                            ? 'bg-app-surface font-semibold text-app-ink'
                            : 'text-app-muted hover:bg-app-surface hover:text-app-ink'}
                        `}
                      >
                        <span className="truncate">{sub.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* User footer */}
      <div className={`flex-shrink-0 border-t border-app-line ${collapsed ? 'p-2' : 'p-3'}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              title={user?.nombre_completo || 'Usuario'}
              className="flex h-9 w-9 select-none items-center justify-center rounded-lg bg-app-surface text-[13px] font-semibold text-app-brand"
            >
              {initials}
            </div>
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="rounded-lg p-1.5 text-app-muted transition-colors hover:bg-app-surface hover:text-app-ink"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-1 py-1">
            <div className="flex h-9 w-9 flex-shrink-0 select-none items-center justify-center rounded-lg bg-app-surface text-[13px] font-semibold text-app-brand">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-app-ink">
                {user?.nombre_completo || 'Usuario'}
              </p>
              <p className="truncate text-[12px] capitalize text-app-muted">
                {user?.rol?.nombre || 'Admin. RRHH'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="flex-shrink-0 rounded-lg p-1.5 text-app-muted transition-colors hover:bg-app-surface hover:text-app-ink"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
