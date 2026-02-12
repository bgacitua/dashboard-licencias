import React from 'react';

/**
 * Registro Central de Módulos
 * 
 * Mapea los códigos de módulo (backend) a su configuración visual y de navegación.
 * Permite agrupar por categorías y definir sub-items de menú.
 */
export const MODULE_REGISTRY = {
  // --- GESTIÓN DE PERSONAL ---
  'dashboard': {
    category: 'Gestión de Personal',
    title: 'Panel de Control',
    description: 'Visualiza indicadores clave, licencias médicas y estado de vacaciones.',
    icon: 'dashboard',
    color: 'blue',
    items: [
      { label: 'Panel Principal', path: '/dashboard', icon: 'dashboard' },
      { label: 'Licencias Médicas', path: '/dashboard/licencias', icon: 'medical_services' },
      { label: 'Vacaciones', path: '/dashboard/vacaciones', icon: 'beach_access' }
    ]
  },
  'seleccion': {
    category: 'Gestión de Personal',
    title: 'Selección',
    description: 'Administra procesos de reclutamiento y base de talentos.',
    icon: 'person_search',
    color: 'emerald',
    items: [
      { label: 'Procesos Activos', path: '/seleccion', icon: 'person_search' }
    ]
  },

  // --- REMUNERACIONES Y LEGAL ---
  'finiquitos': {
    category: 'Remuneraciones y Legal',
    title: 'Finiquitos',
    description: 'Generación, cálculo y gestión de documentos de término de contrato.',
    icon: 'description',
    color: 'purple',
    items: [
      { label: 'Generar Finiquito', path: '/finiquitos', icon: 'description' }
    ]
  },
  'calculadora': {
    category: 'Remuneraciones y Legal',
    title: 'Calculadora de Sueldos',
    description: 'Simulador de sueldos líquidos y cálculo de costos empresa.',
    icon: 'calculate',
    color: 'orange',
    items: [
      { label: 'Calculadora', path: '/calculadora', icon: 'calculate' }
    ]
  },

  // --- ADMINISTRACIÓN ---
  'admin': {
    category: 'Sistema',
    title: 'Configuración',
    description: 'Administración de usuarios, roles y parámetros del sistema.',
    icon: 'settings',
    color: 'gray',
    items: [
      { label: 'Panel Admin', path: '/admin', icon: 'settings' }
    ]
  }
};

/**
 * Helper para obtener el color de Tailwind basado en el nombre del color
 */
export const getModuleColorStyles = (colorName) => {
  const colors = {
    blue: {
      icon: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'hover:border-blue-100'
    },
    purple: {
      icon: 'text-purple-600',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      border: 'hover:border-purple-100'
    },
    orange: {
      icon: 'text-orange-600',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      border: 'hover:border-orange-100'
    },
    emerald: {
      icon: 'text-emerald-600',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      border: 'hover:border-emerald-100'
    },
    gray: {
      icon: 'text-gray-600',
      bg: 'bg-gray-100 dark:bg-gray-700',
      border: 'hover:border-gray-200'
    }
  };
  
  return colors[colorName] || colors.gray;
};
