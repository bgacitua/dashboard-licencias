import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

import SidebarLayout from '../components/SidebarLayout';
import FiniquitosService from '../services/finiquitos.service';

const ITEMS_PER_PAGE = 50;

// Mismas claves que MOTIVOS_SALIDA en el backend; alimenta el select y el historial.
const MOTIVOS_SALIDA = {
  renuncia: "Ha renunciado",
  desvinculacion: "Se ha desvinculado a",
  mutuo_acuerdo: "Se ha acogido al beneficio del mutuo acuerdo",
  jubilacion: "Se ha acogido al beneficio de jubilación don/a",
};

const GeneradorFiniquitos = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRut, setSelectedRut] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [procesos, setProcesos] = useState([]);
  // null = sin filtro; si no, la clave de la tarjeta activa.
  const [filtro, setFiltro] = useState(null);
  // Modo comparendo: oculta listado, deja solo buscador y genera un .docx por plantilla.
  const [modoComparendo, setModoComparendo] = useState(false);
  const [fechaComparendo, setFechaComparendo] = useState("");
  const [docBlob, setDocBlob] = useState(null);
  const [generando, setGenerando] = useState(false);
  // Modo salida: mismo buscador, pero envía el correo de aviso de salida de personal.
  const [modoSalida, setModoSalida] = useState(false);
  const [fechaSalida, setFechaSalida] = useState("");
  const [motivoSalida, setMotivoSalida] = useState("renuncia");
  const [enviando, setEnviando] = useState(false);

  // Modos que ocultan tablas y usan el buscador con autocompletado.
  const modoBusqueda = modoComparendo || modoSalida;

  // ponytail: para sumar documentos, agregar la ruta de la plantilla a este array.
  const PLANTILLAS_COMPARENDO = [
    "/Poder Simple Empleador Cramer Formato.docx",
    "/Declaraciones Juradas Cramer Formato.docx",
  ];

  // Tarjetas de resumen sobre los procesos de desvinculación guardados.
  const RESUMEN = [
    {
      clave: "activos",
      titulo: "Procesos activos",
      // Activo = le falta al menos uno de los tres hitos (carta, finiquito, correo).
      test: (p) =>
        !(p.carta_generada_at && p.finiquito_generado_at && p.correo_enviado_at),
      color: "border-blue-500",
      icono: "pending_actions",
    },
    {
      clave: "finiquitos",
      titulo: "Finiquitos pendientes",
      test: (p) => !p.finiquito_generado_at,
      color: "border-amber-500",
      icono: "description",
    },
    {
      clave: "correos",
      titulo: "Correos no enviados",
      test: (p) => !p.correo_enviado_at,
      color: "border-rose-500",
      icono: "mail",
    },
  ];

  // ponytail: fecha_ingreso llega como 'YYYY-MM-DD' o ISO; sin librería de fechas
  const formatFecha = (fecha) => {
    if (!fecha) return 'N/A';
    const [y, m, d] = String(fecha).split('T')[0].split('-');
    return d ? `${d}-${m}-${y}` : fecha;
  };

  useEffect(() => {
    fetchEmployees();
    fetchProcesos();
  }, []);

  const fetchProcesos = async () => {
    try {
      setProcesos(await FiniquitosService.getProcesos());
    } catch (error) {
      console.error("Error fetching procesos:", error);
    }
  };

  const fetchEmployees = async () => {
    try {
      const data = await FiniquitosService.getTrabajadoresGeneral();
      setEmployees(data);
    } catch (error) {
      console.error("Error fetching employees:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page on search
  };

  // Normalize search term for flexible matching
  const normalizeText = (text) => {
    if (!text) return '';
    return text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9]/g, ''); // Remove special chars
  };

  const filteredEmployees = employees.filter(emp => {
    // Flexible search (name, RUT, cargo)
    if (searchTerm) {
      const searchNormalized = normalizeText(searchTerm);
      const nameMatch = normalizeText(emp.nombre_trabajador).includes(searchNormalized);
      const rutMatch = emp.rut_trabajador?.replace(/[.-]/g, '').includes(searchTerm.replace(/[.-]/g, ''));
      const cargoMatch = normalizeText(emp.cargo).includes(searchNormalized);
      return nameMatch || rutMatch || cargoMatch;
    }
    
    return true;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredEmployees.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredEmployees.length);
  const paginatedEmployees = filteredEmployees.slice(startIndex, endIndex);

  // Build page numbers to display (smart range with ellipsis)
  const getPageNumbers = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    
    const pages = [];
    pages.push(1);
    
    if (currentPage > 3) pages.push('...');
    
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    
    if (currentPage < totalPages - 2) pages.push('...');
    
    pages.push(totalPages);
    return pages;
  };

  const nombrePorRut = Object.fromEntries(
    employees.map((e) => [e.rut_trabajador, e.nombre_trabajador]),
  );
  const tarjetaActiva = RESUMEN.find((c) => c.clave === filtro);
  const procesosFiltrados = tarjetaActiva ? procesos.filter(tarjetaActiva.test) : [];
  const fmtHito = (ts) => (ts ? new Date(ts).toLocaleDateString("es-CL") : "—");

  const empleadoSeleccionado = employees.find((e) => e.rut_trabajador === selectedRut);

  // ponytail: el historial sale de correo_enviado_at; no hay tabla de envíos.
  // Si hace falta motivo/fecha de salida por envío, hay que persistirlos en el backend.
  const historialCorreos = procesos
    .filter((p) => p.correo_enviado_at)
    .sort((a, b) => new Date(b.correo_enviado_at) - new Date(a.correo_enviado_at));

  const salirModoComparendo = () => {
    setModoComparendo(false);
    setSelectedRut(null);
    setFechaComparendo("");
    setDocBlob(null);
  };

  const salirModoSalida = () => {
    setModoSalida(false);
    setSelectedRut(null);
    setFechaSalida("");
    setMotivoSalida("renuncia");
  };

  const enviarCorreoSalida = async () => {
    if (!empleadoSeleccionado || !fechaSalida) return;
    setEnviando(true);
    try {
      await FiniquitosService.enviarCorreoSalida(empleadoSeleccionado.rut_trabajador, {
        nombre: empleadoSeleccionado.nombre_trabajador,
        cargo: empleadoSeleccionado.cargo,
        fechaSalida,
        motivo: motivoSalida,
      });
      alert("Correo de salida enviado.");
      fetchProcesos();
      setSelectedRut(null);
      setFechaSalida("");
    } catch (err) {
      console.error("Error al enviar el correo de salida:", err);
      alert(err?.response?.data?.detail || err?.message || String(err));
    } finally {
      setEnviando(false);
    }
  };

  // Rellena las plantillas .docx con los datos del trabajador y la fecha elegida.
  const generarComparendo = async () => {
    if (!empleadoSeleccionado || !fechaComparendo) return;
    setGenerando(true);
    try {
      const [anio, mes, dia] = fechaComparendo.split("-");
      const contexto = {
        nombre_trabajador: empleadoSeleccionado.nombre_trabajador || "",
        rut_trabajador: empleadoSeleccionado.rut_trabajador || "",
        cargo: empleadoSeleccionado.cargo || "",
        nombre_empresa: empleadoSeleccionado.nombre_empresa || "",
        nombre_jefe: empleadoSeleccionado.nombre_jefe || "",
        rut_jefe: empleadoSeleccionado.rut_jefe || "",
        fecha_ingreso: formatFecha(empleadoSeleccionado.fecha_ingreso),
        fecha: `${dia}-${mes}-${anio}`,
        fecha_comparendo: `${dia}-${mes}-${anio}`,
        dia,
        mes,
        anio,
      };

      const generados = [];
      for (const url of PLANTILLAS_COMPARENDO) {
        const res = await fetch(encodeURI(`${url}?v=${Date.now()}`), { cache: "no-store" });
        if (!res.ok) throw new Error(`No se pudo cargar la plantilla ${url}. Debe existir en /public.`);
        const arrayBuffer = await res.arrayBuffer();
        // Un .docx es un ZIP; un .doc renombrado no lo es y rompe docxtemplater.
        const b = new Uint8Array(arrayBuffer);
        const esZip = b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b;
        if (!esZip) throw new Error(`${url} no es un .docx válido. Guárdalo desde Word como Word 2007+.`);

        const doc = new Docxtemplater(new PizZip(arrayBuffer), {
          paragraphLoop: true,
          linebreaks: true,
          nullGetter: () => "",
          delimiters: { start: "{{", end: "}}" }, // mismas llaves que las plantillas de finiquito
        });
        doc.setData(contexto);
        doc.render();

        const blob = doc.getZip().generate({
          type: "blob",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        const base = url.split("/").pop().replace(/\s*Formato\.docx$/i, "").replace(/\.docx$/i, "");
        generados.push({ nombre: `${base} - ${contexto.rut_trabajador}.docx`, blob });
      }
      setDocBlob(generados);
    } catch (err) {
      console.error("Error al generar documentos:", err);
      alert(err?.message || String(err));
    } finally {
      setGenerando(false);
    }
  };

  const descargarComparendo = () => {
    (docBlob || []).forEach(({ nombre, blob }) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nombre;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  };

  return (
    <SidebarLayout>
      <main className="p-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Generador de Finiquitos</h1>
            <p className="text-gray-500">
              {modoComparendo
                ? "Busca al trabajador y genera sus documentos de comparendo."
                : modoSalida
                ? "Busca al trabajador y envía el aviso de salida de personal."
                : "Selecciona los trabajadores para generar su finiquito."}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (modoSalida) return salirModoSalida();
                salirModoComparendo();
                setModoSalida(true);
              }}
              aria-pressed={modoSalida}
              className={`px-4 py-2 rounded-lg font-medium border transition-colors flex items-center gap-2 ${
                modoSalida
                  ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              <span className="material-symbols-outlined text-lg">mail</span>
              Correo de salida
            </button>
            <button
              onClick={() => {
                if (modoComparendo) return salirModoComparendo();
                salirModoSalida();
                setModoComparendo(true);
              }}
              aria-pressed={modoComparendo}
              className={`px-4 py-2 rounded-lg font-medium border transition-colors flex items-center gap-2 ${
                modoComparendo
                  ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              <span className="material-symbols-outlined text-lg">gavel</span>
              Modo Comparendo
            </button>
          </div>
        </div>

        {/* ponytail: colapso con max-height; sin librería de animación */}
        <div
          className={`transition-all duration-300 overflow-hidden ${
            modoBusqueda ? "max-h-0 opacity-0" : "max-h-[4000px] opacity-100"
          }`}
        >
        {/* Tarjetas de resumen: clic filtra, clic de nuevo quita el filtro */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {RESUMEN.map((c) => (
            <button
              key={c.clave}
              onClick={() => setFiltro(filtro === c.clave ? null : c.clave)}
              aria-pressed={filtro === c.clave}
              className={`text-left bg-white p-4 rounded-xl shadow-sm border border-gray-100 border-l-4 ${c.color} hover:shadow-md transition-all ${
                filtro === c.clave ? "ring-2 ring-blue-500" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 font-medium">{c.titulo}</p>
                <span className="material-symbols-outlined text-gray-400">{c.icono}</span>
              </div>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {procesos.filter(c.test).length}
              </p>
            </button>
          ))}
        </div>

        {/* Listado del filtro activo */}
        {tarjetaActiva && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-900">
                {tarjetaActiva.titulo}{" "}
                <span className="text-gray-400 font-normal">({procesosFiltrados.length})</span>
              </h2>
              <button
                onClick={() => setFiltro(null)}
                className="text-sm text-blue-600 hover:underline"
              >
                Limpiar filtro
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                    <th className="p-3">Nombre</th>
                    <th className="p-3">RUT</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Carta</th>
                    <th className="p-3">Finiquito</th>
                    <th className="p-3">Correo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {procesosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-6 text-center text-gray-500">
                        Sin registros en esta categoría.
                      </td>
                    </tr>
                  ) : (
                    procesosFiltrados.map((p) => (
                      <tr
                        key={p.rut}
                        onClick={() => navigate(`/finiquitos/crear/${p.rut}`)}
                        className="cursor-pointer hover:bg-gray-50 transition-colors text-sm"
                      >
                        <td className="p-3 font-medium text-gray-900">
                          {nombrePorRut[p.rut] || "—"}
                        </td>
                        <td className="p-3 font-mono text-gray-600">{p.rut}</td>
                        <td className="p-3 text-gray-600">{p.estado}</td>
                        <td className="p-3 text-gray-500">{fmtHito(p.carta_generada_at)}</td>
                        <td className="p-3 text-gray-500">{fmtHito(p.finiquito_generado_at)}</td>
                        <td className="p-3 text-gray-500">{fmtHito(p.correo_enviado_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </div>

        {/* Filters Bar */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-wrap gap-4 items-center justify-between">
          <div className="relative flex-1 min-w-[300px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
            <input 
              type="text" 
              placeholder="Buscar por nombre, RUT o cargo..." 
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              value={searchTerm}
              onChange={handleSearch}
            />
            {/* En modo comparendo no hay tabla: se elige desde los resultados del buscador */}
            {modoBusqueda && searchTerm && !selectedRut && (
              <ul className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                {filteredEmployees.slice(0, 20).map((emp) => (
                  <li key={emp.rut_trabajador}>
                    <button
                      onClick={() => setSelectedRut(emp.rut_trabajador)}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50"
                    >
                      <p className="font-medium text-gray-900 text-sm">{emp.nombre_trabajador}</p>
                      <p className="text-xs text-gray-500 font-mono">{emp.rut_trabajador} · {emp.cargo}</p>
                    </button>
                  </li>
                ))}
                {filteredEmployees.length === 0 && (
                  <li className="px-4 py-3 text-sm text-gray-500">Sin coincidencias.</li>
                )}
              </ul>
            )}
          </div>
        </div>

        {/* Selection Action Bar */}
        {selectedRut && (
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-6 flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                <span className="material-symbols-outlined text-sm">check</span>
              </div>
              <span className="font-semibold text-gray-900">Trabajador seleccionado</span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-600 text-sm">
                {employees.find(e => e.rut_trabajador === selectedRut)?.nombre_trabajador}
              </span>
            </div>
            <div className="flex gap-3 items-center">
              {modoComparendo && (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  Fecha:
                  <input
                    type="date"
                    value={fechaComparendo}
                    onChange={(e) => { setFechaComparendo(e.target.value); setDocBlob(null); }}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
              )}
              {modoSalida && (
                <>
                  <select
                    value={motivoSalida}
                    onChange={(e) => setMotivoSalida(e.target.value)}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.entries(MOTIVOS_SALIDA).map(([valor, texto]) => (
                      <option key={valor} value={valor}>{texto}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    Fecha de salida:
                    <input
                      type="date"
                      value={fechaSalida}
                      onChange={(e) => setFechaSalida(e.target.value)}
                      className="px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                </>
              )}
              <button
                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                onClick={() => { setSelectedRut(null); setDocBlob(null); }}
              >
                Cancelar
              </button>
              {modoSalida ? (
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!fechaSalida || enviando}
                  onClick={enviarCorreoSalida}
                >
                  <span className="material-symbols-outlined text-lg">send</span>
                  {enviando ? "Enviando..." : "Enviar correo"}
                </button>
              ) : !modoComparendo ? (
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
                  onClick={() => navigate(`/finiquitos/crear/${selectedRut}`)}
                >
                  <span className="material-symbols-outlined text-lg">description</span>
                  Generar finiquito
                </button>
              ) : docBlob ? (
                <button
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-2"
                  onClick={descargarComparendo}
                >
                  <span className="material-symbols-outlined text-lg">download</span>
                  Descargar documentos
                </button>
              ) : (
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!fechaComparendo || generando}
                  onClick={generarComparendo}
                >
                  <span className="material-symbols-outlined text-lg">description</span>
                  {generando ? "Generando..." : "Generar documentos"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Historial de correos de salida enviados */}
        {modoSalida && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-900">
                Correos de salida enviados{" "}
                <span className="text-gray-400 font-normal">({historialCorreos.length})</span>
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                    <th className="p-3">Nombre</th>
                    <th className="p-3">RUT</th>
                    <th className="p-3">Fecha de salida</th>
                    <th className="p-3">Motivo</th>
                    <th className="p-3">Enviado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {historialCorreos.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="p-6 text-center text-gray-500">
                        Aún no se ha enviado ningún correo de salida.
                      </td>
                    </tr>
                  ) : (
                    historialCorreos.map((p) => (
                      <tr key={p.rut} className="text-sm">
                        <td className="p-3 font-medium text-gray-900">
                          {nombrePorRut[p.rut] || "—"}
                        </td>
                        <td className="p-3 font-mono text-gray-600">{p.rut}</td>
                        <td className="p-3 text-gray-500">{formatFecha(p.salida_fecha)}</td>
                        <td className="p-3 text-gray-600">
                          {MOTIVOS_SALIDA[p.salida_motivo] || "—"}
                        </td>
                        <td className="p-3 text-gray-500">
                          {new Date(p.correo_enviado_at).toLocaleString("es-CL")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Table */}
        <div
          className={`transition-all duration-300 overflow-hidden ${
            modoBusqueda ? "max-h-0 opacity-0" : "max-h-[6000px] opacity-100"
          }`}
        >
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                  <th className="p-4">Nombre / Cargo</th>
                  <th className="p-4">RUT</th>
                  <th className="p-4">Supervisor</th>
                  <th className="p-4">RUT Supervisor</th>
                  <th className="p-4">Antigüedad</th>
                  <th className="p-4">Ingreso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-gray-500">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
                      Cargando trabajadores...
                    </td>
                  </tr>
                ) : paginatedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-gray-500">No se encontraron trabajadores que coincidan con tu búsqueda.</td>
                  </tr>
                ) : (
                  paginatedEmployees.map((emp) => (
                    <tr
                      key={emp.rut_trabajador}
                      onClick={() => setSelectedRut(prev => prev === emp.rut_trabajador ? null : emp.rut_trabajador)}
                      className={`cursor-pointer hover:bg-gray-50 transition-colors ${selectedRut === emp.rut_trabajador ? 'bg-blue-50' : ''}`}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                            {emp.nombre_trabajador.split(' ').map(n => n[0]).join('').substring(0, 2)}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{emp.nombre_trabajador}</p>
                            <p className="text-xs text-gray-500">{emp.cargo}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-gray-600 font-mono">{emp.rut_trabajador}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">
                            {emp.nombre_jefe ? emp.nombre_jefe[0] : '?'}
                          </div>
                          <span className="text-sm text-gray-700">{emp.nombre_jefe || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-gray-500 font-mono">{emp.rut_jefe || 'N/A'}</td>
                      <td className="p-4">
                        <span className="inline-flex px-2 py-1 rounded bg-gray-100 text-gray-600 text-xs font-medium">
                          {emp.duracion_empresa ? `${emp.duracion_empresa.toFixed(1)}y` : '0y'}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-500">{formatFecha(emp.fecha_ingreso)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {!loading && filteredEmployees.length > 0 && (
            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
              <p className="text-sm text-gray-500">
                Mostrando <span className="font-bold text-gray-900">{startIndex + 1}</span> a <span className="font-bold text-gray-900">{endIndex}</span> de <span className="font-bold text-gray-900">{filteredEmployees.length}</span> trabajadores
              </p>
              <div className="flex gap-1">
                <button 
                  className="p-2 border border-gray-300 rounded-lg bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => prev - 1)}
                >
                  <span className="material-symbols-outlined text-sm">chevron_left</span>
                </button>
                {getPageNumbers().map((page, idx) => (
                  page === '...' ? (
                    <span key={`ellipsis-${idx}`} className="flex items-end px-1 text-gray-400">...</span>
                  ) : (
                    <button
                      key={page}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                        currentPage === page
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-600 hover:bg-gray-200'
                      }`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  )
                ))}
                <button 
                  className="p-2 border border-gray-300 rounded-lg bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                >
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            </div>
          )}
        </div>
        </div>

      </main>
    </SidebarLayout>
  );
};

export default GeneradorFiniquitos;