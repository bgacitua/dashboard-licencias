import React, { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MODULE_REGISTRY } from '../config/modules';

const Sidebar = () => {
  const { user, logout, hasModuleAccess, hasRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path) => location.pathname === path;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Generar items de menú dinámicamente
  const menuItems = useMemo(() => {
    const items = [];
    
    // Iterar sobre el registro de módulos
    Object.entries(MODULE_REGISTRY).forEach(([code, config]) => {
        // Verificar acceso basado en módulos asignados al rol del usuario
        let hasAccess = hasModuleAccess(code);

        if (hasAccess) {
            // Agregar todos los sub-items definidos en el módulo
            config.items.forEach(subItem => {
                items.push({
                    ...subItem,
                    category: config.category
                });
            });
        }
    });

    return items;
  }, [hasModuleAccess, hasRole]);

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
      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {menuItems.map((item, index) => (
          <React.Fragment key={item.path}>
             {/* Opcional: Separador de categorías si cambia respecto al anterior */}
             {index > 0 && item.category !== menuItems[index - 1].category && (
                 <div className="px-4 py-2 mt-4 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                     {item.category}
                 </div>
             )}
              {/* Primer item también lleva categoria si queremos ser explícitos */}
             {index === 0 && (
                 <div className="px-4 py-2 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                     {item.category}
                 </div>
             )}

             <Link
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
          </React.Fragment>
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
