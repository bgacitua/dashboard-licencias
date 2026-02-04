import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Páginas públicas
import Login from './pages/Login';

// Páginas protegidas
import MainMenu from './pages/MainMenu';
import Dashboard from './pages/Dashboard';
import LicenciasVencidas from './pages/LicenciasVencidas';
import LicenciasPorVencer from './pages/LicenciasPorVencer';
import LicenciasVigentes from './pages/LicenciasVigentes';
import GeneradorFiniquitos from './pages/GeneradorFiniquitos';
import VisualizadorFiniquito from './pages/VisualizadorFiniquito';
import CrearFiniquito from './pages/CrearFiniquito';
import AdminPanel from './pages/admin/AdminPanel';
import Calculadora from './pages/Calculadora';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
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
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;