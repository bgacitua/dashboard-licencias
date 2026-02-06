import React from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';

const MainMenu = () => {
  const { user, hasModuleAccess, hasRole } = useAuth();

  // Definir los módulos del menú con sus códigos de acceso
  const menuItems = [
    {
      id: 'dashboard',
      title: 'Dashboard licencias médicas',
      description: 'Gestiona y visualiza el estado de las licencias médicas de todos los empleados.',
      path: '/dashboard',
      icon: 'medical_services',
      iconColor: 'text-[#135bec]',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      borderHover: 'hover:border-blue-100',
      moduleCode: 'dashboard', // Código del módulo requerido
      requiredRole: ['rrhh', 'admin'],
    },
    {
      id: 'finiquitos',
      title: 'Generador de finiquitos',
      description: 'Crea, valida y descarga documentos de término de contrato legales.',
      path: '/finiquitos',
      icon: 'description',
      iconColor: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      borderHover: 'hover:border-purple-100',
      moduleCode: 'finiquitos',
      requiredRole: ['rrhh', 'admin'],
    },
    {
      id: 'calculadora',
      title: 'Calculadora de sueldos',
      description: 'Simula sueldos líquidos, brutos y costos empresa con parámetros actualizados.',
      path: '/calculadora',
      icon: 'calculate',
      iconColor: 'text-orange-600',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      borderHover: 'hover:border-orange-100',
      moduleCode: 'calculadora',
      requiredRole: ['rrhh', 'admin'],
    },
    {
      id: 'seleccion',
      title: 'Selección de personal',
      description: 'Administra candidatos, programa entrevistas y sigue los procesos de reclutamiento.',
      path: '#',
      icon: 'person_search',
      iconColor: 'text-emerald-600',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
      borderHover: 'hover:border-emerald-100',
      moduleCode: 'seleccion',
      requiredRole: ['rrhh', 'admin'],
    },
    {
      id: 'admin',
      title: 'Configuración de administrador',
      description: 'Configura los parámetros del sistema.',
      path: '/admin',
      icon: 'settings',
      iconColor: 'text-gray-600',
      bgColor: 'bg-gray-100 dark:bg-gray-700',
      borderHover: 'hover:border-gray-200',
      moduleCode: 'admin',
      requiredRole: ['admin'],
    },
  ];

  // Filtrar módulos según permisos del usuario
  const visibleItems = menuItems.filter(item => {
    // Si requiere un rol específico, verificar
    if (item.requiredRole && !hasRole(item.requiredRole)) {
      return false;
    }
    // Verificar acceso al módulo
    return hasModuleAccess(item.moduleCode);
  });

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

            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              {/* Renderizar módulos visibles */}
              {visibleItems.map(item => (
                <Link 
                  key={item.id}
                  to={item.path} 
                  className={`group bg-white dark:bg-[#1a202c] p-8 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 flex flex-col items-start gap-4 h-full border border-transparent ${item.borderHover}`}
                >
                  <div className={`p-3 ${item.bgColor} rounded-full mb-2`}>
                    <span className={`material-symbols-outlined ${item.iconColor} text-3xl`}>{item.icon}</span>
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

              {/* Mensaje si no hay módulos disponibles */}
              {visibleItems.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <span className="material-symbols-outlined text-gray-400 text-5xl mb-4">lock</span>
                  <p className="text-gray-500">No tienes módulos asignados. Contacta al administrador.</p>
                </div>
              )}

              {/* Gestión de desempeño (Próximamente) - Siempre visible */}
              <div className="group bg-[#f6f6f8] dark:bg-[#1a202c] p-8 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 flex flex-col items-start gap-4 h-full relative overflow-hidden">
                <div className="absolute top-4 right-4 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold px-3 py-1 rounded-full">
                  Próximamente
                </div>
                <div className="p-3 bg-gray-200 dark:bg-gray-700 rounded-full mb-2">
                  <span className="material-symbols-outlined text-gray-500 dark:text-gray-400 text-3xl">lock_clock</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-500 dark:text-gray-400 mb-2">
                    Gestión de desempeño
                  </h2>
                  <p className="text-gray-400 dark:text-gray-500 leading-relaxed">
                    Nuevo módulo de evaluación y seguimiento de objetivos en construcción.
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