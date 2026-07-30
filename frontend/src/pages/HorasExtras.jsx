import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SidebarLayout from "../components/SidebarLayout";
import {
  getResumenHorasExtras,
  enviarConsolidado,
  enviarSolicitudes,
} from "../services/overtime";

const HorasExtras = () => {
  const [weekStart, setWeekStart] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async (semana) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getResumenHorasExtras(semana || undefined);
      setWeekStart(data.week_start);
      setRows(data.rows || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const accion = async (fn, okMsg) => {
    setEnviando(true);
    setMensaje(null);
    setError(null);
    try {
      const res = await fn();
      setMensaje(res.message || okMsg);
      await cargar(weekStart);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const seleccionados = rows.filter((r) => r.employee_rut);
  const totalSabado = seleccionados.filter((r) => r.sabado).length;
  const sinResponder = [
    ...new Set(rows.filter((r) => !r.responded_at).map((r) => r.boss_name || r.boss_rut)),
  ];

  return (
    <SidebarLayout>
      <main className="p-8">
        <header className="flex items-center gap-2 text-sm text-gray-500 mb-8">
          <span className="material-symbols-outlined text-lg">home</span>
          <span>/</span>
          <Link to="/dashboard" className="hover:text-gray-700">Dashboard</Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">Horas Extras</span>
        </header>

        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Horas Extras Fin de Semana</h1>
            <p className="text-gray-500">
              Respuestas de las jefaturas para la semana del {weekStart || "—"}.
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex flex-col">
              <label className="text-[10px] text-gray-500 font-bold uppercase mb-1">
                Semana (lunes)
              </label>
              <input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                onBlur={() => cargar(weekStart)}
                className="bg-white border border-gray-200 rounded px-3 py-2 text-sm text-gray-700"
              />
            </div>
            <button
              disabled={enviando}
              onClick={() => accion(() => enviarSolicitudes(), "Solicitudes enviadas")}
              className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Enviar solicitudes
            </button>
            <button
              disabled={enviando}
              onClick={() => accion(() => enviarConsolidado(weekStart), "Consolidado enviado")}
              className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Enviar consolidado
            </button>
          </div>
        </div>

        {mensaje && (
          <div className="mb-4 px-4 py-3 rounded bg-green-50 text-green-800 text-sm">{mensaje}</div>
        )}
        {error && (
          <div className="mb-4 px-4 py-3 rounded bg-red-50 text-red-800 text-sm">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase font-bold">Sábado</p>
            <p className="text-2xl font-bold text-gray-900">{totalSabado}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase font-bold">Jefaturas sin responder</p>
            <p className="text-2xl font-bold text-gray-900">{sinResponder.length}</p>
            <p className="text-xs text-gray-500 truncate">{sinResponder.join(", ")}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3">Trabajador</th>
                <th className="px-4 py-3">RUT</th>
                <th className="px-4 py-3">Cargo</th>
                <th className="px-4 py-3">Área</th>
                <th className="px-4 py-3">Jefatura</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-gray-500">Cargando…</td></tr>
              )}
              {!loading && seleccionados.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-gray-500">
                  Sin trabajadores seleccionados para esta semana.
                </td></tr>
              )}
              {!loading && seleccionados.map((r) => (
                <tr key={`${r.boss_rut}-${r.employee_rut}`} className="border-t border-gray-100">
                  <td className="px-4 py-3">{r.employee_name}</td>
                  <td className="px-4 py-3 text-gray-500">{r.employee_rut}</td>
                  <td className="px-4 py-3 text-gray-500">{r.cargo}</td>
                  <td className="px-4 py-3 text-gray-500">{r.area}</td>
                  <td className="px-4 py-3 text-gray-500">{r.boss_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </SidebarLayout>
  );
};

export default HorasExtras;
