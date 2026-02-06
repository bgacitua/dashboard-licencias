import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Componente de loading para Suspense
const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-900">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-gray-400 text-sm">Cargando...</p>
    </div>
  </div>
);

// Páginas públicas (carga inmediata - críticas para el primer render)
import Login from './pages/Login';
import MainMenu from './pages/MainMenu';

// Páginas protegidas con lazy loading (carga bajo demanda)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const LicenciasVencidas = lazy(() => import('./pages/LicenciasVencidas'));
const LicenciasPorVencer = lazy(() => import('./pages/LicenciasPorVencer'));
const LicenciasVigentes = lazy(() => import('./pages/LicenciasVigentes'));
const LicenciasPage = lazy(() => import('./pages/LicenciasPage'));
const VacacionesPage = lazy(() => import('./pages/VacacionesPage'));
const GeneradorFiniquitos = lazy(() => import('./pages/GeneradorFiniquitos'));
const VisualizadorFiniquito = lazy(() => import('./pages/VisualizadorFiniquito'));
const CrearFiniquito = lazy(() => import('./pages/CrearFiniquito'));
const AdminPanel = lazy(() => import('./pages/admin/AdminPanel'));
const Calculadora = lazy(() => import('./pages/Calculadora'));

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
            {/* Rutas públicas */}
            <Route path="/login" element={<Login />} />
            
            {/* Redirigir raíz al menú */}
            <Route path="/" element={<Navigate to="/menu" replace />} />
            
            {/* Menú principal - requiere autenticación */}
            <Route 
              path="/menu" 
              element={
                <ProtectedRoute>
                  <MainMenu />
                </ProtectedRoute>
              } 
            />
            
            {/* Módulo Dashboard (Licencias + Marcas) */}
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute requiredModule="dashboard">
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/dashboard/vencidas" 
              element={
                <ProtectedRoute requiredModule="dashboard">
                  <LicenciasVencidas />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/dashboard/por-vencer" 
              element={
                <ProtectedRoute requiredModule="dashboard">
                  <LicenciasPorVencer />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/dashboard/vigentes" 
              element={
                <ProtectedRoute requiredModule="dashboard">
                  <LicenciasVigentes />
                </ProtectedRoute>
              } 
            />

            <Route 
              path="/dashboard/licencias" 
              element={
                <ProtectedRoute requiredModule="dashboard">
                  <LicenciasPage />
                </ProtectedRoute>
              } 
            />

            {/* Rutas legacy (redirigir a nuevas rutas) */}
            <Route path="/vencidas" element={<Navigate to="/dashboard/vencidas" replace />} />
            <Route path="/por-vencer" element={<Navigate to="/dashboard/por-vencer" replace />} />
            <Route path="/vigentes" element={<Navigate to="/dashboard/vigentes" replace />} />
            


            {/* Módulo Finiquitos - solo RRHH y Admin */}
            <Route 
              path="/finiquitos" 
              element={
                <ProtectedRoute requiredModule="finiquitos">
                  <GeneradorFiniquitos />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/finiquitos/crear/:rut" 
              element={
                <ProtectedRoute requiredModule="finiquitos">
                  <CrearFiniquito />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/finiquitos/visualizar/:rut" 
              element={
                <ProtectedRoute requiredModule="finiquitos">
                  <VisualizadorFiniquito />
                </ProtectedRoute>
              } 
            />
            
            {/* Panel de Administración - solo Admin */}
            <Route 
              path="/admin" 
              element={
                <ProtectedRoute requiredModule="admin">
                  <AdminPanel />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/calculadora" 
              element={
                <ProtectedRoute> {/*requiredModule="calculadora">*/}
                  <Calculadora />
                </ProtectedRoute>
              } 
            />

            {/* Ruta 404 - redirigir al menú */}
            <Route path="*" element={<Navigate to="/menu" replace />} />
            </Routes>
          </Suspense>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;