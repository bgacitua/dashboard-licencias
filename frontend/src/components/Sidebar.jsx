import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const allMenuItems = [
  { icon: 'sensor_door',          label: 'Torniquetes',            path: '/dashboard',           module: 'dashboard' },
  { icon: 'description',          label: 'Generador Finiquitos',   path: '/finiquitos',          module: 'finiquitos' },
  { icon: 'calculate',            label: 'Calculadora Sueldos',    path: '/calculadora',         module: 'calculadora' },
  { icon: 'wallet',               label: 'Costos por Área',        path: '/costos',              module: 'costos' },
  { icon: 'notifications_active', label: 'Alertas de Contratos',   path: '/contract-alerts',     module: 'contract_alerts' },
  { icon: 'person_search',        label: 'Selección de Personal',  path: '/seleccion',           module: 'seleccion',      requiredRole: ['rrhh', 'admin', 'seleccion'] },
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
        bg-white border-r border-slate-200 flex flex-col h-screen
        fixed left-0 top-0 z-50
        transition-[width] duration-200 ease-in-out
        ${collapsed ? 'w-16' : 'w-64'}
      `}
    >
      {/* Header: logo + toggle */}
      <div className={`flex items-center border-b border-slate-100 h-[65px] flex-shrink-0 ${collapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
        {!collapsed && (
          <Link to="/menu" className="flex items-center gap-2.5 min-w-0 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-white text-[18px]">corporate_fare</span>
            </div>
            <div className="leading-tight min-w-0">
              <span className="block text-sm font-semibold text-slate-800 tracking-tight truncate">HR Portal</span>
              <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium">Recursos Humanos</span>
            </div>
          </Link>
        )}

        {collapsed && (
          <Link to="/menu" title="HR Portal" className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm hover:opacity-80 transition-opacity">
            <span className="material-symbols-outlined text-white text-[18px]">corporate_fare</span>
          </Link>
        )}

        <button
          onClick={onToggle}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          className={`
            flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center
            text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors
            ${collapsed ? 'absolute -right-3.5 top-5 bg-white border border-slate-200 shadow-sm rounded-full w-7 h-7' : ''}
          `}
        >
          <span className="material-symbols-outlined text-[18px]">
            {collapsed ? 'chevron_right' : 'chevron_left'}
          </span>
        </button>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden ${collapsed ? 'px-2' : 'px-3'}`}>
        {!collapsed && (
          <p className="px-3 pb-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
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
                group relative flex items-center gap-3 rounded-lg text-sm transition-colors
                ${collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'}
                ${active
                  ? 'bg-primary text-white font-semibold shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
              `}
            >
              {active && !collapsed && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-white/80" aria-hidden="true" />
              )}
              <span className={`material-symbols-outlined text-[20px] flex-shrink-0 ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`}>
                {item.icon}
              </span>
              {!collapsed && <span className="font-medium truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className={`border-t border-slate-100 bg-slate-50/40 flex-shrink-0 ${collapsed ? 'p-2' : 'p-3'}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              title={user?.nombre_completo || 'Usuario'}
              className="w-9 h-9 rounded-full bg-primary-soft text-primary flex items-center justify-center font-semibold text-sm ring-2 ring-white shadow-sm select-none"
            >
              {initials}
            </div>
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white transition-colors">
            <div className="w-9 h-9 rounded-full bg-primary-soft text-primary flex items-center justify-center font-semibold text-sm ring-2 ring-white shadow-sm select-none flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">
                {user?.nombre_completo || 'Usuario'}
              </p>
              <p className="text-xs text-slate-500 truncate capitalize">
                {user?.rol?.nombre || 'Admin. RRHH'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
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
