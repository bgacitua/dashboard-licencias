import React, { useState } from "react";
import { Link } from "react-router-dom";
import SidebarLayout from "../components/SidebarLayout";
import { useRetornoSeguimiento } from "../hooks/useRetornoSeguimiento";

const EstadoBadge = ({ retorno }) => {
  if (retorno === true)
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
        <span className="w-1.5 h-1.5 rounded-full bg-app-ink"></span>
        Retornó
      </span>
    );
  if (retorno === false)
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
        Sin marcaje
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-app-surface text-app-muted">
      <span className="w-1.5 h-1.5 rounded-full bg-app-outline"></span>
      Sin datos
    </span>
  );
};

const RetornoSeguimiento = () => {
  const [dias, setDias] = useState(7);
  const [emailDestinatario, setEmailDestinatario] = useState("");
  const [mostrarEmailModal, setMostrarEmailModal] = useState(false);

  const {
    seguimiento,
    sinRetorno,
    conRetorno,
    loading,
    error,
    enviando,
    alertaResult,
    recargar,
    enviarAlerta,
  } = useRetornoSeguimiento(dias);

  const handleEnviarAlerta = async () => {
    if (!emailDestinatario.trim()) return;
    await enviarAlerta(emailDestinatario.trim());
    setMostrarEmailModal(false);
  };

  return (
    <SidebarLayout>
      <main className="p-8">
        {/* Header */}
        <header className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-2 text-sm text-app-muted">
            <span className="material-symbols-outlined text-lg">home</span>
            <span>/</span>
            <Link to="/dashboard" className="hover:text-app-muted">Torniquetes</Link>
            <span>/</span>
            <span className="text-app-ink font-medium">Retorno de Licencias</span>
          </div>
        </header>

        {/* Title */}
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-2xl font-bold text-app-ink mb-1">Seguimiento de Retorno</h1>
            <p className="text-app-muted">
              Empleados cuya licencia venció y deben haber regresado al trabajo.
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex flex-col">
              <label className="text-[10px] text-app-muted font-bold uppercase mb-1">
                Ventana de días
              </label>
              <select
                className="bg-white border border-app-line rounded px-3 py-2 text-sm text-app-muted focus:outline-none focus:ring-1 focus:ring-app-ink"
                value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
              >
                <option value={3}>Últimos 3 días</option>
                <option value={7}>Últimos 7 días</option>
                <option value={14}>Últimas 2 semanas</option>
                <option value={30}>Último mes</option>
              </select>
            </div>
            <button
              onClick={recargar}
              className="p-2 text-app-outline hover:text-app-brand hover:bg-app-surface rounded-full transition-colors"
              title="Actualizar"
            >
              <span className="material-symbols-outlined">refresh</span>
            </button>
            <button
              onClick={() => setMostrarEmailModal(true)}
              disabled={seguimiento.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-app-ink text-white rounded-lg text-sm font-medium hover:bg-app-ink/90 transition-colors  disabled:opacity-40 disabled:cursor-not-allowed h-[38px]"
            >
              <span className="material-symbols-outlined text-lg">mail</span>
              Enviar alerta
            </button>
          </div>
        </div>

        {/* Stats */}
        {!loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-xl p-5  border border-app-line">
              <p className="text-xs font-medium text-app-muted uppercase mb-1">Total seguimiento</p>
              <span className="text-3xl font-bold text-app-ink">{seguimiento.length}</span>
              <p className="text-xs text-app-outline mt-1">Licencias vencidas sin nueva licencia activa</p>
            </div>
            <div className="bg-white rounded-xl p-5  border border-red-100">
              <p className="text-xs font-medium text-red-500 uppercase mb-1">Sin marcaje</p>
              <span className="text-3xl font-bold text-red-600">{sinRetorno.length}</span>
              <p className="text-xs text-app-outline mt-1">No han registrado asistencia</p>
            </div>
            <div className="bg-white rounded-xl p-5  border border-green-100">
              <p className="text-xs font-medium text-green-500 uppercase mb-1">Retornaron</p>
              <span className="text-3xl font-bold text-app-brand">{conRetorno.length}</span>
              <p className="text-xs text-app-outline mt-1">Marcaje confirmado post-licencia</p>
            </div>
          </div>
        )}

        {/* Alert result */}
        {alertaResult && (
          <div
            className={`mb-6 px-4 py-3 rounded-lg border text-sm font-medium flex items-center gap-2 ${
              alertaResult.sent
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            <span className="material-symbols-outlined text-lg">
              {alertaResult.sent ? "check_circle" : "error"}
            </span>
            {alertaResult.message}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl  border border-app-line overflow-hidden">
          <div className="px-6 py-4 border-b border-app-line flex items-center justify-between">
            <h2 className="text-base font-semibold text-app-ink">Detalle de empleados</h2>
            <span className="text-sm text-app-outline">{seguimiento.length} registros</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-app-surface border-b border-app-line text-xs uppercase text-app-muted font-semibold">
                  <th className="px-6 py-3">RUT</th>
                  <th className="px-6 py-3">Trabajador</th>
                  <th className="px-6 py-3">Fin Licencia</th>
                  <th className="px-6 py-3">Retorno Esperado</th>
                  <th className="px-6 py-3">Días sin marcar</th>
                  <th className="px-6 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-line">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-8 text-center text-app-muted">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-app-ink mr-2"></div>
                      Cargando datos...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-8 text-center text-red-500">
                      {error}
                    </td>
                  </tr>
                ) : seguimiento.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-8 text-center text-app-muted">
                      No hay empleados con licencias vencidas en el período seleccionado.
                    </td>
                  </tr>
                ) : (
                  seguimiento.map((emp, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-app-surface transition-colors ${
                        emp.retorno_registrado === false ? "bg-red-50/30" : ""
                      }`}
                    >
                      <td className="px-6 py-4 text-sm text-app-muted font-mono">
                        {emp.rut}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-app-line flex items-center justify-center text-xs font-bold text-app-muted">
                            {emp.nombre?.charAt(0) || "?"}
                          </div>
                          <span className="text-sm font-medium text-app-ink">{emp.nombre}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-app-muted">
                        {emp.fecha_fin_licencia?.split("-").reverse().join("/")}
                      </td>
                      <td className="px-6 py-4 text-sm text-app-muted">
                        {emp.fecha_retorno_esperada?.split("-").reverse().join("/")}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {emp.retorno_registrado === false && emp.dias_sin_marcar > 0 ? (
                          <span className="font-semibold text-red-600">
                            {emp.dias_sin_marcar} día(s)
                          </span>
                        ) : (
                          <span className="text-app-outline">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <EstadoBadge retorno={emp.retorno_registrado} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Email modal */}
        {mostrarEmailModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl  p-6 w-full max-w-md mx-4">
              <h3 className="text-base font-semibold text-app-ink mb-1">Enviar alerta de retorno</h3>
              <p className="text-sm text-app-muted mb-4">
                Se enviará un resumen con {sinRetorno.length} empleado(s) sin marcaje y{" "}
                {conRetorno.length} con retorno confirmado.
              </p>
              <label className="block text-xs font-medium text-app-muted mb-1 uppercase">
                Correo destinatario
              </label>
              <input
                type="email"
                className="w-full border border-app-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-app-ink mb-4"
                placeholder="nombre@empresa.cl"
                value={emailDestinatario}
                onChange={(e) => setEmailDestinatario(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEnviarAlerta()}
                autoFocus
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setMostrarEmailModal(false)}
                  className="px-4 py-2 text-sm font-medium text-app-muted bg-white border border-app-line rounded-lg hover:bg-app-surface"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEnviarAlerta}
                  disabled={enviando || !emailDestinatario.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-app-ink rounded-lg hover:bg-app-ink/90 disabled:opacity-50 flex items-center gap-2"
                >
                  {enviando ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                      Enviando...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-base">send</span>
                      Enviar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </SidebarLayout>
  );
};

export default RetornoSeguimiento;
