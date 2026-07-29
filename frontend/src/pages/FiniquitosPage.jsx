import React, { useState, useEffect } from 'react';
import FiniquitosService from '../services/finiquitos.service';

const FiniquitosPage = () => {
  const [trabajadores, setTrabajadores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [workerDetails, setWorkerDetails] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    fetchTrabajadores();
  }, []);

  const fetchTrabajadores = async () => {
    try {
      const data = await FiniquitosService.getTrabajadoresGeneral();
      setTrabajadores(data);
    } catch (error) {
      console.error("Error fetching trabajadores:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectWorker = async (worker) => {
    setSelectedWorker(worker);
    setLoadingDetails(true);
    try {
      const details = await FiniquitosService.getItemsByRut(worker.rut_trabajador);
      setWorkerDetails(details);
    } catch (error) {
      console.error("Error fetching worker details:", error);
    } finally {
      setLoadingDetails(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Módulo de Finiquitos</h1>
      
      {/* Tabla de Trabajadores */}
      <div className="bg-white shadow-md rounded my-6 overflow-x-auto">
        <table className="min-w-full table-auto">
          <thead>
            <tr className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
              <th className="py-3 px-6 text-left">RUT</th>
              <th className="py-3 px-6 text-left">Nombre</th>
              <th className="py-3 px-6 text-left">Cargo</th>
              <th className="py-3 px-6 text-left">Fecha Ingreso</th>
              <th className="py-3 px-6 text-left">Duración (Años)</th>
              <th className="py-3 px-6 text-left">Estado</th>
              <th className="py-3 px-6 text-left">Sueldo Base</th>
              <th className="py-3 px-6 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="text-gray-600 text-sm font-light">
            {loading ? (
              <tr><td colSpan="8" className="text-center py-4">Cargando...</td></tr>
            ) : (
              trabajadores.map((worker) => (
                <tr key={worker.rut_trabajador} className="border-b border-gray-200 hover:bg-gray-100">
                  <td className="py-3 px-6 text-left whitespace-nowrap">{worker.rut_trabajador}</td>
                  <td className="py-3 px-6 text-left">{worker.nombre_trabajador}</td>
                  <td className="py-3 px-6 text-left">{worker.cargo}</td>
                  <td className="py-3 px-6 text-left">{worker.fecha_ingreso}</td>
                  <td className="py-3 px-6 text-left">{worker.duracion_empresa ? worker.duracion_empresa.toFixed(2) : '0.00'}</td>
                  <td className="py-3 px-6 text-left">
                    <span className={`py-1 px-3 rounded-full text-xs ${worker.estado === 'activo' ? 'bg-green-200 text-green-600' : 'bg-red-200 text-red-600'}`}>
                      {worker.estado}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-left">${worker.sueldo_base}</td>
                  <td className="py-3 px-6 text-center">
                    <button 
                      onClick={() => handleSelectWorker(worker)}
                      className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-xs"
                    >
                      Ver Detalle
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detalles del Trabajador Seleccionado */}
      {selectedWorker && (
        <div className="mt-8 bg-white shadow-md rounded p-6">
          <h2 className="text-xl font-bold mb-4">Detalle de Finiquito: {selectedWorker.nombre_trabajador}</h2>
          {loadingDetails ? (
            <p>Cargando detalles...</p>
          ) : (
            <div>
                <p className="mb-2"><strong>RUT:</strong> {selectedWorker.rut_trabajador}</p>
                <p className="mb-4"><strong>Jefe Directo:</strong> {selectedWorker.nombre_jefe}</p>
                
                <h3 className="text-lg font-semibold mb-2">Items de Remuneración</h3>
                {workerDetails.length > 0 ? (
                    <ul className="list-disc pl-5">
                        {workerDetails.map((item, index) => (
                            <li key={index}>
                                {item.nombre_item || item.concepto || 'Item sin nombre'}: ${item.monto}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p>No hay items registrados.</p>
                )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FiniquitosPage;
