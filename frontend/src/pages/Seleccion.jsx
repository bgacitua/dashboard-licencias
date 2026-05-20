import React, { useState, useEffect, useCallback } from 'react';
import SidebarLayout from '../components/SidebarLayout';
import { getToken } from '../services/auth';

const API = '/api/v1/seleccion';

const EMPRESA = ['CARLOS CRAMER PRODUCTOS AROMÁTICOS S.A. C.I.', 'SABORES Y FRAGANCIAS.CL COMERCIAL LTDA.', 'SERVICIOS DE PRODUCCIÓN Y LOGÍSTICA CCPA LTDA.'];
const STATUS_OPTIONS = ['Pendiente', 'Oferta enviada', 'Aceptado', 'Rechazado', 'En proceso'];
const JORNADA_OPTIONS = ['Lunes a Viernes', 'Articulo 22', 'Mixto', 'Teletrabajo'];
const CONTRATO_OPTIONS = ['Plazo Fijo (1 mes - 2 meses), Sujeto a Renovación', 'Indefinido'];
const LUGAR_TRABAJO = ['Lucerna 4925, Cerrillos, Santiago', 'Las Encinas 268, Cerrillos, Santiago', 'Balmaceda 3050, Malloco'];

const COLS = [
  { key: 'nombre',            label: 'Nombre' },
  { key: 'rut',               label: 'RUT' },
  { key: 'cargo',             label: 'Cargo' },
  { key: 'gerencia',          label: 'Gerencia' },
  { key: 'lugar_de_trabajo',  label: 'Lugar' },
  { key: 'jornada_de_trabajo',label: 'Jornada' },
  { key: 'tipo_de_contrato',  label: 'Contrato' },
  { key: 'fecha_de_inicio',   label: 'Inicio' },
  { key: 'fecha_cierre',      label: 'Cierre proceso' },
  { key: 'sueldo_base',       label: 'Sueldo base' },
  { key: 'bono',              label: 'Bono' },
  { key: 'movilizacion',      label: 'Movilización' },
  { key: 'correo_analista',   label: 'Analista' },
  { key: 'status',            label: 'Estado' },
];

const formatRut = (v) => {
  const clean = v.replace(/[^0-9kK]/g, '');
  if (clean.length < 2) return clean;
  return clean.slice(0, -1) + '-' + clean.slice(-1).toUpperCase();
};

const fmtMonto = (v) => v != null && v !== '' ? `$${Number(v).toLocaleString('es-CL')}` : '—';

const STATUS_COLORS = {
  'Pendiente':      'bg-yellow-100 text-yellow-800',
  'Oferta enviada': 'bg-blue-100 text-blue-800',
  'Aceptado':       'bg-green-100 text-green-800',
  'Rechazado':      'bg-red-100 text-red-800',
  'En proceso':     'bg-purple-100 text-purple-800',
};

const emptyForm = {
  empresa: '', fecha_cierre: '', rut: '', nombre: '', cargo: '',
  lugar_de_trabajo: '', jornada_de_trabajo: '', tipo_de_contrato: '',
  fecha_de_inicio: '', gerencia: '', sueldo_base: '', bono: '',
  movilizacion: '', correo_analista: '', status: 'Pendiente',
};

function CandidatoModal({ candidato, onClose, onSaved }) {
  const isEdit = !!candidato?.id;
  const [form, setForm] = useState(isEdit ? { ...candidato } : { ...emptyForm });
  const [fechaSinDefinir, setFechaSinDefinir] = useState(isEdit ? !candidato?.fecha_de_inicio : false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'rut') {
      setForm(prev => ({ ...prev, rut: formatRut(value) }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form };
      ['sueldo_base', 'bono', 'movilizacion'].forEach(k => {
        payload[k] = payload[k] === '' ? null : Number(payload[k]);
      });
      ['fecha_cierre', 'fecha_de_inicio'].forEach(k => {
        if (!payload[k]) payload[k] = null;
      });
      if (fechaSinDefinir) payload.fecha_de_inicio = null;

      const url = isEdit ? `${API}/${candidato.id}` : `${API}/`;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
    } catch (err) {
      setError('Error al guardar. Verifica los datos e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const field = (label, name, type = 'text', opts = null) => (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      {opts ? (
        <select
          name={name}
          value={form[name] || ''}
          onChange={handleChange}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        >
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={type}
          name={name}
          value={form[name] || ''}
          onChange={handleChange}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">
            {isEdit ? 'Editar candidato' : 'Nuevo candidato'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('Nombre completo *', 'nombre')}
          {field('RUT', 'rut')}
          {field('Cargo *', 'cargo')}
          {field('Empresa *', 'empresa')}
          {field('Gerencia', 'gerencia')}
          {field('Lugar de trabajo', 'lugar_de_trabajo', 'text', LUGAR_TRABAJO)}
          {field('Jornada de trabajo', 'jornada_de_trabajo', 'text', JORNADA_OPTIONS)}
          {field('Tipo de contrato', 'tipo_de_contrato', 'text', CONTRATO_OPTIONS)}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Fecha de inicio</label>
            <input
              type="date"
              name="fecha_de_inicio"
              value={fechaSinDefinir ? '' : (form.fecha_de_inicio || '')}
              onChange={handleChange}
              disabled={fechaSinDefinir}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:bg-slate-50 disabled:text-slate-400"
            />
            <label className="flex items-center gap-2 mt-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={fechaSinDefinir}
                onChange={e => { setFechaSinDefinir(e.target.checked); if (e.target.checked) setForm(prev => ({ ...prev, fecha_de_inicio: '' })); }}
                className="w-3.5 h-3.5 accent-emerald-600"
              />
              <span className="text-xs text-slate-500">Sin fecha definida</span>
            </label>
          </div>
          {field('Fecha cierre proceso', 'fecha_cierre', 'date')}
          {field('Sueldo base ($)', 'sueldo_base', 'number')}
          {field('Bono ($)', 'bono', 'number')}
          {field('Movilización ($)', 'movilizacion', 'number')}
          {field('Correo analista', 'correo_analista', 'email')}
          {field('Estado', 'status', 'text', STATUS_OPTIONS)}

          {error && (
            <div className="col-span-full bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div className="col-span-full flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear candidato'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DetalleCandidato({ candidato, onClose, onEdit, onDelete }) {
  const [descargando, setDescargando] = useState(false);

  const descargarCarta = async () => {
    setDescargando(true);
    try {
      const res = await fetch(`${API}/${candidato.id}/carta-oferta`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `carta_oferta_${candidato.nombre.replace(/ /g, '_')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Error al descargar la carta de oferta.');
    } finally {
      setDescargando(false);
    }
  };

  const fila = (label, value) => (
    <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-xs font-semibold text-slate-400 w-40 flex-shrink-0">{label}</span>
      <span className="text-sm text-slate-700">{value || '—'}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{candidato.nombre}</h2>
            <p className="text-sm text-slate-400">{candidato.cargo} · {candidato.empresa}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6">
          <div className="mb-4">
            <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${STATUS_COLORS[candidato.status] || 'bg-slate-100 text-slate-600'}`}>
              {candidato.status}
            </span>
          </div>

          {fila('RUT', candidato.rut)}
          {fila('Gerencia', candidato.gerencia)}
          {fila('Lugar de trabajo', candidato.lugar_de_trabajo)}
          {fila('Jornada', candidato.jornada_de_trabajo)}
          {fila('Tipo de contrato', candidato.tipo_de_contrato)}
          {fila('Fecha de inicio', candidato.fecha_de_inicio)}
          {fila('Fecha cierre proceso', candidato.fecha_cierre)}
          {fila('Sueldo base', fmtMonto(candidato.sueldo_base))}
          {fila('Bono', fmtMonto(candidato.bono))}
          {fila('Movilización', fmtMonto(candidato.movilizacion))}
          {fila('Correo analista', candidato.correo_analista)}
        </div>

        <div className="flex gap-3 p-6 pt-0 border-t border-slate-100 flex-wrap">
          <button
            onClick={descargarCarta}
            disabled={descargando}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            {descargando ? 'Generando...' : 'Carta de oferta'}
          </button>
          <button
            onClick={() => onEdit(candidato)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
            Editar
          </button>
          <button
            onClick={() => onDelete(candidato)}
            className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 ml-auto"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Seleccion() {
  const [candidatos, setCandidatos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [modal, setModal] = useState(null); // null | 'nuevo' | 'editar' | 'detalle'
  const [seleccionado, setSeleccionado] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) throw new Error();
      setCandidatos(await res.json());
    } catch {
      setError('Error al cargar los candidatos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const handleSaved = () => {
    setModal(null);
    setSeleccionado(null);
    cargar();
  };

  const handleDelete = async (candidato) => {
    if (!window.confirm(`¿Eliminar a ${candidato.nombre}?`)) return;
    try {
      const res = await fetch(`${API}/${candidato.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error();
      setModal(null);
      setSeleccionado(null);
      cargar();
    } catch {
      alert('Error al eliminar el candidato.');
    }
  };

  const candidatosFiltrados = candidatos.filter(c => {
    const q = busqueda.toLowerCase();
    const matchQ = !q || c.nombre?.toLowerCase().includes(q) || c.rut?.includes(q) || c.cargo?.toLowerCase().includes(q) || c.empresa?.toLowerCase().includes(q);
    const matchS = !filtroStatus || c.status === filtroStatus;
    return matchQ && matchS;
  });

  const stats = {
    total: candidatos.length,
    aceptados: candidatos.filter(c => c.status === 'Aceptado').length,
    pendientes: candidatos.filter(c => c.status === 'Pendiente').length,
    enProceso: candidatos.filter(c => c.status === 'En proceso').length,
  };

  const candidatosPorEmpresa = EMPRESA.reduce((acc, emp) => {
    const lista = candidatosFiltrados.filter(c => c.empresa === emp);
    if (lista.length > 0) acc[emp] = lista;
    return acc;
  }, {});
  // Candidatos sin empresa reconocida
  const sinEmpresa = candidatosFiltrados.filter(c => !EMPRESA.includes(c.empresa));
  if (sinEmpresa.length > 0) candidatosPorEmpresa['Sin empresa'] = sinEmpresa;

  const renderCell = (c, key) => {
    if (key === 'status') return (
      <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[c.status] || 'bg-slate-100 text-slate-600'}`}>
        {c.status}
      </span>
    );
    if (['sueldo_base', 'bono', 'movilizacion'].includes(key)) return fmtMonto(c[key]);
    if (key === 'fecha_de_inicio') return c[key] || <span className="text-slate-400 text-xs italic">Sin definir</span>;
    return c[key] || '—';
  };

  return (
    <SidebarLayout>
      <div className="min-h-screen bg-slate-50 font-['Public_Sans']">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Selección de Personal</h1>
              <p className="text-sm text-slate-500 mt-0.5">Gestión de candidatos y cartas de oferta</p>
            </div>
            <button
              onClick={() => { setSeleccionado(null); setModal('nuevo'); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">person_add</span>
              Nuevo candidato
            </button>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total', value: stats.total, color: 'bg-slate-100 text-slate-700' },
              { label: 'En proceso', value: stats.enProceso, color: 'bg-purple-100 text-purple-700' },
              { label: 'Pendientes', value: stats.pendientes, color: 'bg-yellow-100 text-yellow-700' },
              { label: 'Aceptados', value: stats.aceptados, color: 'bg-green-100 text-green-700' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{kpi.label}</p>
                <p className={`text-3xl font-bold mt-1 ${kpi.color.split(' ')[1]}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
              <input
                type="text"
                placeholder="Buscar por nombre, RUT, cargo o empresa..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              />
            </div>
            <select
              value={filtroStatus}
              onChange={e => setFiltroStatus(e.target.value)}
              className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <option value="">Todos los estados</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Tablas por empresa */}
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin mr-3" />
              Cargando candidatos...
            </div>
          ) : error ? (
            <div className="text-center py-20 text-red-500">{error}</div>
          ) : candidatosFiltrados.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm text-center py-20 text-slate-400">
              <span className="material-symbols-outlined text-5xl mb-3 block">person_search</span>
              {busqueda || filtroStatus ? 'Sin resultados para los filtros aplicados.' : 'No hay candidatos registrados.'}
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(candidatosPorEmpresa).map(([empresa, lista]) => (
                <div key={empresa} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-100 bg-emerald-50 flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-600 text-[18px]">business</span>
                    <h2 className="text-sm font-bold text-emerald-800">{empresa}</h2>
                    <span className="ml-auto text-xs text-emerald-600 font-medium">{lista.length} candidato{lista.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          {COLS.map(col => (
                            <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                              {col.label}
                            </th>
                          ))}
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {lista.map(c => (
                          <tr
                            key={c.id}
                            className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors"
                            onClick={() => { setSeleccionado(c); setModal('detalle'); }}
                          >
                            {COLS.map(col => (
                              <td key={col.key} className={`px-4 py-3 whitespace-nowrap ${col.key === 'nombre' ? 'font-medium text-slate-800' : 'text-slate-500'}`}>
                                {renderCell(c, col.key)}
                              </td>
                            ))}
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={e => { e.stopPropagation(); setSeleccionado(c); setModal('editar'); }}
                                className="text-slate-400 hover:text-emerald-600 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modales */}
      {modal === 'nuevo' && (
        <CandidatoModal onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
      {modal === 'editar' && seleccionado && (
        <CandidatoModal candidato={seleccionado} onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
      {modal === 'detalle' && seleccionado && (
        <DetalleCandidato
          candidato={seleccionado}
          onClose={() => { setModal(null); setSeleccionado(null); }}
          onEdit={(c) => { setSeleccionado(c); setModal('editar'); }}
          onDelete={handleDelete}
        />
      )}
    </SidebarLayout>
  );
}
