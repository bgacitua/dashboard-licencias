import React, { useState, useEffect } from 'react';
import FiniquitosService from '../services/finiquitos.service';

const FiniquitosPage = () => {
  const [trabajadores, setTrabajadores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [workerDetails, setWorkerDetails] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [procesos, setProcesos] = useState([]);
  // null = sin filtro; si no, la clave de la tarjeta activa.
  const [filtro, setFiltro] = useState(null);

  useEffect(() => {
    fetchTrabajadores();
    fetchProcesos();
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

  const fetchProcesos = async () => {
    try {
      setProcesos(await FiniquitosService.getProcesos());
    } catch (error) {
      console.error("Error fetching procesos:", error);
    }
  };

  const RESUMEN = [
    {
      clave: "activos",
      titulo: "Procesos activos",
      // Activo = le falta al menos uno de los tres hitos.
      test: (p) =>
        !(p.carta_generada_at && p.finiquito_generado_at && p.correo_enviado_at),
      color: "bg-blue-500",
    },
    {
      clave: "finiquitos",
      titulo: "Finiquitos pendientes",
      test: (p) => !p.finiquito_generado_at,
      color: "bg-amber-500",
    },
    {
      clave: "correos",
      titulo: "Correos no enviados",
      test: (p) => !p.correo_enviado_at,
      color: "bg-rose-500",
    },
  ];

  const nombrePorRut = Object.fromEntries(
    trabajadores.map((t) => [t.rut_trabajador, t.nombre_trabajador]),
  );

  const tarjetaActiva = RESUMEN.find((c) => c.clave === filtro);
  const procesosFiltrados = tarjetaActiva ? procesos.filter(tarjetaActiva.test) : [];

  const fmt = (ts) => (ts ? new Date(ts).toLocaleDateString("es-CL") : "—");

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
      
      {/* Tarjetas de resumen: clic para filtrar, clic de nuevo para quitar el filtro */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {RESUMEN.map((c) => (
          <button
            key={c.clave}
            onClick={() => setFiltro(filtro === c.clave ? null : c.clave)}
            aria-pressed={filtro === c.clave}
            className={`text-left bg-white shadow-md rounded p-4 border-l-4 hover:shadow-lg transition ${
              filtro === c.clave ? "ring-2 ring-blue-400" : ""
            } ${c.color.replace("bg-", "border-")}`}
          >
            <p className="text-sm text-gray-500">{c.titulo}</p>
            <p className="text-3xl font-bold text-gray-800">
              {procesos.filter(c.test).length}
            </p>
          </button>
        ))}
      </div>

      {tarjetaActiva && (
        <div className="bg-white shadow-md rounded mb-6 overflow-x-auto">
          <div className="flex items-center justify-between px-6 py-3 border-b">
            <h2 className="font-semibold">{tarjetaActiva.titulo}</h2>
            <button
              onClick={() => setFiltro(null)}
              className="text-sm text-blue-600 hover:underline"
            >
              Limpiar filtro
            </button>
          </div>
          <table className="min-w-full table-auto text-sm">
            <thead>
              <tr className="bg-gray-100 text-gray-600 uppercase text-xs">
                <th className="py-2 px-6 text-left">RUT</th>
                <th className="py-2 px-6 text-left">Nombre</th>
                <th className="py-2 px-6 text-left">Estado</th>
                <th className="py-2 px-6 text-left">Carta</th>
                <th className="py-2 px-6 text-left">Finiquito</th>
                <th className="py-2 px-6 text-left">Correo</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              {procesosFiltrados.length === 0 ? (
                <tr><td colSpan="6" className="text-center py-4">Sin registros.</td></tr>
              ) : (
                procesosFiltrados.map((p) => (
                  <tr key={p.rut} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="py-2 px-6 whitespace-nowrap">{p.rut}</td>
                    <td className="py-2 px-6">{nombrePorRut[p.rut] || "—"}</td>
                    <td className="py-2 px-6">{p.estado}</td>
                    <td className="py-2 px-6">{fmt(p.carta_generada_at)}</td>
                    <td className="py-2 px-6">{fmt(p.finiquito_generado_at)}</td>
                    <td className="py-2 px-6">{fmt(p.correo_enviado_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

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
