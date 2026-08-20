import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const allMenuItems = [
  { icon: 'sensor_door',          label: 'Torniquetes',            path: '/dashboard',           module: 'dashboard' },
  { icon: 'description',          label: 'Generador Finiquitos',   path: '/finiquitos',          module: 'finiquitos' },
  { icon: 'calculate',            label: 'Calculadora Sueldos',    path: '/calculadora',         module: 'calculadora' },
  { icon: 'wallet',               label: 'Costos por Área',        path: '/costos',              module: 'costos' },
  { icon: 'notifications_active', label: 'Alertas de Contratos',   path: '/contract-alerts',     module: 'contract_alerts' },
  { icon: 'more_time',            label: 'Horas Extras',           path: '/dashboard/horas-extras', module: 'dashboard' },
  { icon: 'person_search',        label: 'Selección de Personal',  path: '/seleccion',           module: 'seleccion',      requiredRole: ['rrhh', 'admin', 'seleccion'] },
  { icon: 'payments',             label: 'Créditos',               path: '/creditos',            module: 'creditos',       requiredRole: ['rrhh', 'admin'] },
  { icon: 'settings',             label: 'Administración',         path: '/admin',               module: 'admin',          requiredRole: ['admin'] },
];

const Sidebar = ({ collapsed = false, onToggle }) => {
  const { user, logout, hasModuleAccess, hasRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path) => location.pathname === path;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const menuItems = allMenuItems.filter(item => {
    if (item.requiredRole && !hasRole(item.requiredRole)) return false;
    return hasModuleAccess(item.module);
  });

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
          return (
            <Link
              key={item.label}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={`
                group flex items-center gap-3 rounded-lg text-[14px] transition-colors
                ${collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'}
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
