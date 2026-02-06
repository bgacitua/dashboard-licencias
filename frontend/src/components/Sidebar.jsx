import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const { user, logout, hasModuleAccess } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path) => location.pathname === path;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Define menu items with required module access
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
      module: 'dashboard' 
    },
  ];

  // Filter items based on user access
  const menuItems = allMenuItems.filter(item => hasModuleAccess(item.module));

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen font-['Public_Sans'] fixed left-0 top-0 z-50">
      {/* Logo */}
      <Link to="/menu" className="p-6 flex items-center gap-3 hover:bg-gray-50 transition-colors">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
             <span className="material-symbols-outlined text-white text-xl">hexagon</span>
        </div>
        <span className="text-xl font-bold text-gray-800">HR Portal</span>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-1">
        {menuItems.map((item) => (
          <Link
            key={item.label}
            to={item.path}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive(item.path) || (item.path === '/dashboard' && location.pathname === '/dashboard')
                ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <span className={`material-symbols-outlined ${isActive(item.path) ? 'text-white' : 'text-gray-400 group-hover:text-gray-500'}`}>
              {item.icon}
            </span>
            <span className="font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
          <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden">
             {/* Placeholder Avatar */}
             <img 
                src={`https://ui-avatars.com/api/?name=${user?.nombre_completo || 'User'}&background=0D8ABC&color=fff`} 
                alt="User" 
                className="w-full h-full object-cover"
             />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {user?.nombre_completo || 'Usuario'}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {user?.rol?.nombre || 'Admin. RRHH'}
            </p>
          </div>
           <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 transition-colors">
            <span className="material-symbols-outlined">logout</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
