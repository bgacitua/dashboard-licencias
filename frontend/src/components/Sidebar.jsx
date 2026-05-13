import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const { user, logout, hasModuleAccess, hasRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path) => location.pathname === path;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Define menu items with required module access and optional role
  const allMenuItems = [
    {
      icon: 'dashboard',
      label: 'Dashboard',
      path: '/dashboard',
      module: 'dashboard'
    },
    {
      icon: 'medical_services',
      label: 'Licencias Médicas',
      path: '/dashboard/licencias',
      module: 'dashboard'
    },
    {
      icon: 'beach_access',
      label: 'Vacaciones Activas',
      path: '/dashboard/vacaciones',
      module: 'dashboard'
    },
    {
      icon: 'description',
      label: 'Generador Finiquitos',
      path: '/finiquitos',
      module: 'finiquitos'
    },
    {
      icon: 'calculate',
      label: 'Calculadora Sueldos',
      path: '/calculadora',
      module: 'calculadora'
    },
    {
      icon: 'person_search',
      label: 'Selección de Personal',
      path: '/seleccion',
      module: 'seleccion',
      requiredRole: ['admin']
    },
    {
      icon: 'settings',
      label: 'Administración',
      path: '/admin',
      module: 'admin',
      requiredRole: ['admin']
    },
  ];

  // Filter items based on user access and role
  const menuItems = allMenuItems.filter(item => {
    if (item.requiredRole && !hasRole(item.requiredRole)) {
      return false;
    }
    return hasModuleAccess(item.module);
  });

  const initials = (user?.nombre_completo || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase())
    .join('');

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen font-['Public_Sans'] fixed left-0 top-0 z-50">
      {/* Logo */}
      <Link
        to="/menu"
        className="px-6 py-5 flex items-center gap-3 border-b border-slate-100 hover:bg-slate-50/60 transition-colors"
      >
        <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center shadow-sm">
          <span className="material-symbols-outlined text-white text-xl">corporate_fare</span>
        </div>
        <div className="leading-tight">
          <span className="block text-base font-semibold text-slate-800 tracking-tight">HR Portal</span>
          <span className="block text-[11px] uppercase tracking-wider text-slate-400 font-medium">Recursos Humanos</span>
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-3 pb-2 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
          Navegación
        </p>
        {menuItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.label}
              to={item.path}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-primary text-white font-semibold shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-white/80" aria-hidden="true" />
              )}
              <span className={`material-symbols-outlined text-[20px] ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`}>
                {item.icon}
              </span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/40">
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white transition-colors">
          <div className="w-10 h-10 rounded-full bg-primary-soft text-primary flex items-center justify-center font-semibold text-sm ring-2 ring-white shadow-sm select-none">
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
            className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
