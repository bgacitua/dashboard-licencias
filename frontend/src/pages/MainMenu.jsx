import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { MODULE_REGISTRY, getModuleColorStyles } from '../config/modules';

const MainMenu = () => {
  const { user, hasModuleAccess, hasRole } = useAuth();
  
  // Generar items dinámicamente basados en permisos
  const groupedModules = useMemo(() => {
    const groups = {};

    // Helper para procesar una entrada del registro
    const processModule = (code, config) => {
        // Verificar acceso basado en módulos asignados al rol del usuario
        let hasAccess = hasModuleAccess(code);

        if (hasAccess) {
            if (!groups[config.category]) {
                groups[config.category] = [];
            }
            groups[config.category].push({
                ...config,
                code,
                styles: getModuleColorStyles(config.color)
            });
        }
    };

    // Iterar sobre el registro completo
    Object.entries(MODULE_REGISTRY).forEach(([code, config]) => {
        processModule(code, config);
    });

    return groups;
  }, [hasModuleAccess, hasRole]);


  return (
    <div className="flex h-screen bg-[#f6f6f8] dark:bg-[#101622] font-['Public_Sans']">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            
            {/* Header Section */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-[#111318] dark:text-white mb-2">
                Bienvenido, {user?.nombre_completo || user?.username || 'Usuario'}
              </h1>
              <p className="text-[#616f89] dark:text-gray-400 text-lg">
                Selecciona un módulo para comenzar tus tareas de hoy.
              </p>
            </div>

            {/* Categorías Dinámicas */}
            {Object.entries(groupedModules).length > 0 ? (
                <div className="space-y-12">
                    {Object.entries(groupedModules).map(([categoryName, modules]) => (
                        <div key={categoryName}>
                            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
                                {categoryName}
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {modules.map((item) => (
                                    <Link 
                                        key={item.code}
                                        to={item.items[0].path} // Link al primer path definido
                                        className={`group bg-white dark:bg-[#1a202c] p-8 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 flex flex-col items-start gap-4 h-full border border-transparent ${item.styles.border}`}
                                    >
                                        <div className={`p-3 ${item.styles.bg} rounded-full mb-2`}>
                                            <span className={`material-symbols-outlined ${item.styles.icon} text-3xl`}>
                                                {item.icon}
                                            </span>
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-[#111318] dark:text-white mb-2">
                                                {item.title}
                                            </h2>
                                            <p className="text-[#616f89] dark:text-gray-400 leading-relaxed">
                                                {item.description}
                                            </p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12">
                    <span className="material-symbols-outlined text-gray-400 text-5xl mb-4">lock</span>
                    <p className="text-gray-500">No tienes módulos asignados. Contacta al administrador.</p>
                </div>
            )}
            
            {/* Gestión de desempeño (Próximamente) - Siempre visible al final */}
            <div className="mt-12 pt-8 border-t border-dashed border-gray-300">
                <div className="max-w-md mx-auto group bg-[#f6f6f8] dark:bg-[#1a202c] p-6 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 flex flex-col items-center gap-4 text-center relative overflow-hidden opacity-75 hover:opacity-100 transition-opacity">
                    <div className="absolute top-4 right-4 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold px-3 py-1 rounded-full">
                        Próximamente
                    </div>
                    <div className="p-3 bg-gray-200 dark:bg-gray-700 rounded-full mb-2">
                        <span className="material-symbols-outlined text-gray-500 dark:text-gray-400 text-3xl">lock_clock</span>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-500 dark:text-gray-400 mb-1">
                            Gestión de Desempeño
                        </h2>
                        <p className="text-sm text-gray-400 dark:text-gray-500">
                            Nuevo módulo de evaluación en construcción.
                        </p>
                    </div>
                </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
};

export default MainMenu;