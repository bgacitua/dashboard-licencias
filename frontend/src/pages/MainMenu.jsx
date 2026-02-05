import React from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';

const MainMenu = () => {
  const { user } = useAuth();

  return (
    <div className="flex h-screen bg-[#f6f6f8] dark:bg-[#101622] font-['Public_Sans']">
      {/* Navbar (reusing existing component but it seems the design implies a top navbar which is already there) */}
      {/* The design shows a clean page with a top bar. The current Navbar component seems to be a top bar based on its code. */}
      
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
              
              {/* 1. Dashboard licencias médicas */}
              <Link to="/dashboard" className="group bg-white dark:bg-[#1a202c] p-8 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 flex flex-col items-start gap-4 h-full border border-transparent hover:border-blue-100">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-full mb-2">
                  <span className="material-symbols-outlined text-[#135bec] text-3xl">medical_services</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#111318] dark:text-white mb-2">
                    Dashboard licencias médicas
                  </h2>
                  <p className="text-[#616f89] dark:text-gray-400 leading-relaxed">
                    Gestiona y visualiza el estado de las licencias médicas de todos los empleados.
                  </p>
                </div>
              </Link>

              {/* 2. Generador de finiquitos */}
              <Link to="/finiquitos" className="group bg-white dark:bg-[#1a202c] p-8 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 flex flex-col items-start gap-4 h-full border border-transparent hover:border-purple-100">
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-full mb-2">
                  <span className="material-symbols-outlined text-purple-600 text-3xl">description</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#111318] dark:text-white mb-2">
                    Generador de finiquitos
                  </h2>
                  <p className="text-[#616f89] dark:text-gray-400 leading-relaxed">
                    Crea, valida y descarga documentos de término de contrato legales.
                  </p>
                </div>
              </Link>

              {/* 3. Selección de personal */}
              <Link to="#" className="group bg-white dark:bg-[#1a202c] p-8 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 flex flex-col items-start gap-4 h-full border border-transparent hover:border-emerald-100 cursor-default">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-full mb-2">
                  <span className="material-symbols-outlined text-emerald-600 text-3xl">person_search</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#111318] dark:text-white mb-2">
                    Selección de personal
                  </h2>
                  <p className="text-[#616f89] dark:text-gray-400 leading-relaxed">
                    Administra candidatos, programa entrevistas y sigue los procesos de reclutamiento.
                  </p>
                </div>
              </Link>

              {/* 4. Calculadora de sueldos */}
              <Link to="/calculadora" className="group bg-white dark:bg-[#1a202c] p-8 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 flex flex-col items-start gap-4 h-full border border-transparent hover:border-orange-100 cursor-default">
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-full mb-2">
                  <span className="material-symbols-outlined text-orange-600 text-3xl">calculate</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#111318] dark:text-white mb-2">
                    Calculadora de sueldos
                  </h2>
                  <p className="text-[#616f89] dark:text-gray-400 leading-relaxed">
                    Simula sueldos líquidos, brutos y costos empresa con parámetros actualizados.
                  </p>
                </div>
              </Link>



              {/* 5. Gestión de desempeño (Próximamente) */}
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