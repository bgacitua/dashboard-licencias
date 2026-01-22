import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import LicenciasVencidas from './pages/LicenciasVencidas';
import LicenciasPorVencer from './pages/LicenciasPorVencer';
import LicenciasVigentes from './pages/LicenciasVigentes';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/vencidas" element={<LicenciasVencidas />} />
          <Route path="/por-vencer" element={<LicenciasPorVencer />} />
          <Route path="/vigentes" element={<LicenciasVigentes />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;