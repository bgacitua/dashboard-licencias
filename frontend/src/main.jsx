import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
// Efecto de import: registra los interceptores de axios (JWT + manejo de 401).
import './lib/axiosAuth';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);