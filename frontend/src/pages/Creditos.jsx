import React, { useState, useEffect } from 'react';
import SidebarLayout from '../components/SidebarLayout';
import {
  listarCreditos, buscarTrabajadores, crearCredito, actualizarCredito, eliminarCredito,
  subirDocumento, iniciarFirma, verificarFirma, crearCreditoBuk,
  verificarCreditoBuk, abrirPagare,
} from '../services/creditos';

const TIPOS = [
  { value: 'credito_personal', label: 'Crédito personal' },
  { value: 'dental', label: 'Dental' },
  { value: 'leasing', label: 'Leasing' },
  { value: 'seguro_vida', label: 'Seguro de vida' },
  { value: 'credito_otro', label: 'Otro' },
];

// Estado del flujo → etiqueta, color y siguiente acción disponible
const ESTADOS = {
  borrador:         { label: 'Borrador',          color: 'bg-slate-100 text-slate-700',   accion: 'documento' },
  documento_subido: { label: 'Documento subido',  color: 'bg-blue-100 text-blue-700',     accion: 'firma' },
  firma_en_proceso: { label: 'Firma en proceso',  color: 'bg-yellow-100 text-yellow-700', accion: 'verificar-firma' },
  firmado:          { label: 'Firmado',           color: 'bg-purple-100 text-purple-700', accion: 'credito' },
  credito_creado:   { label: 'Crédito creado',    color: 'bg-green-100 text-green-700',   accion: 'verificar-credito' },
};

const ACCIONES = {
  'documento':         { label: 'Subir documento',  icon: 'upload_file', fn: subirDocumento },
  'firma':             { label: 'Iniciar firma',    icon: 'draw',        fn: iniciarFirma },
  'verificar-firma':   { label: 'Verificar firma',  icon: 'fact_check',  fn: verificarFirma },
  'credito':           { label: 'Crear crédito',    icon: 'payments',    fn: crearCreditoBuk },
  'verificar-credito': { label: 'Verificar en BUK', icon: 'check_circle', fn: verificarCreditoBuk },
};

const FORM_INICIAL = {
  employee_id: '', rut: '', nombre_trabajador: '',
  nombre: '', tipo: 'credito_personal', start_date: '', moneda: 'peso',
  monto_original: '', equivalente_pesos: '',
  amount: '', cuota_actual: 1, duracion: '', comentario: '', dia_uf: '',
  visible: true,
  signable_by_employee: true,
  signable_by_legal_agent: true,
  signable_by_second_legal_agent: false,
  overwrite: false,
  path: '',
  reviewer_id: '',
  buk_file_id: '',
};

const fmtMonto = (v, moneda) =>
  moneda === 'uf' ? `UF ${v}` : `$${Number(v).toLocaleString('es-CL')}`;

const Creditos = () => {
  const [creditos, setCreditos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [saving, setSaving] = useState(false);
  const [sugerencias, setSugerencias] = useState([]);
  const [accionEnCurso, setAccionEnCurso] = useState(null);

  const cargar = async () => {
    setLoading(true);
    try {
      setCreditos(await listarCreditos());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  const buscarTrabajador = async (q) => {
    set('nombre_trabajador', q);
    if (q.length < 3) return setSugerencias([]);
    try {
      setSugerencias(await buscarTrabajadores(q));
    } catch {
      setSugerencias([]);
    }
  };

  const elegirTrabajador = (t) => {
    setForm(f => ({ ...f, employee_id: t.employee_id, rut: t.rut, nombre_trabajador: t.full_name }));
    setSugerencias([]);
  };

  const abrirNuevo = () => {
    setEditando(null);
    setForm(FORM_INICIAL);
    setSugerencias([]);
    setModal(true);
  };

  const abrirEdicion = (c) => {
    setEditando(c);
    const opciones = c.firmas_requeridas?._opciones || {};
    setForm({
      ...FORM_INICIAL,
      ...c,
      monto_original: c.monto_original ?? '',
      equivalente_pesos: c.equivalente_pesos ?? '',
      comentario: c.comentario ?? '',
      dia_uf: c.dia_uf ?? '',
      visible: opciones.visible ?? true,
      overwrite: opciones.overwrite ?? false,
      path: opciones.path ?? '',
      reviewer_id: opciones.reviewer_id ?? '',
      signable_by_employee: c.firmas_requeridas?.employee_sign ?? true,
      signable_by_legal_agent: c.firmas_requeridas?.legal_agent_sign ?? true,
      signable_by_second_legal_agent: c.firmas_requeridas?.second_legal_agent_sign ?? false,
    });
    setSugerencias([]);
    setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.employee_id) return alert('Selecciona un trabajador de la lista.');
    setSaving(true);
    const payload = {
      ...form,
      employee_id: Number(form.employee_id),
      amount: Number(form.amount),
      duracion: Number(form.duracion),
      cuota_actual: Number(form.cuota_actual),
      monto_original: form.monto_original ? Number(form.monto_original) : null,
      equivalente_pesos: form.equivalente_pesos ? Number(form.equivalente_pesos) : null,
      reviewer_id: form.reviewer_id ? Number(form.reviewer_id) : null,
      buk_file_id: form.buk_file_id ? Number(form.buk_file_id) : null,
      path: form.path || null,
      dia_uf: form.moneda === 'uf' ? form.dia_uf || null : null,
    };
    try {
      if (editando) {
        await actualizarCredito(editando.id, payload);
      } else {
        await crearCredito(payload);
      }
      setModal(false);
      setEditando(null);
      setForm(FORM_INICIAL);
      await cargar();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const ejecutarAccion = async (credito, claveAccion) => {
    const accion = ACCIONES[claveAccion];
    setAccionEnCurso(`${credito.id}-${claveAccion}`);
    try {
      const res = await accion.fn(credito.id);
      if (claveAccion === 'verificar-firma') {
        alert(res.firmado
          ? 'Documento firmado. Ya puedes crear el crédito en BUK.'
          : `Aún faltan firmas.\n${JSON.stringify(res.firmas_estado, null, 2)}`);
      } else if (claveAccion === 'verificar-credito') {
        alert(`Crédito en BUK:\n${JSON.stringify(res, null, 2)}`);
      }
      await cargar();
    } catch (err) {
      alert(err.message);
    } finally {
      setAccionEnCurso(null);
    }
  };

  const handleEliminar = async (credito) => {
    if (!confirm(`¿Eliminar el crédito "${credito.nombre}" de ${credito.nombre_trabajador}?`)) return;
    try {
      await eliminarCredito(credito.id);
      await cargar();
    } catch (err) {
      alert(err.message);
    }
  };

  const filtrados = creditos.filter(c => {
    const q = busqueda.toLowerCase();
    return !q || c.nombre_trabajador?.toLowerCase().includes(q)
      || c.rut?.includes(q) || c.nombre?.toLowerCase().includes(q);
  });

  return (
    <SidebarLayout>
      <div className="min-h-screen bg-slate-50 font-['Public_Sans']">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Créditos</h1>
              <p className="text-sm text-slate-500 mt-0.5">Pagaré, firma en BUK y carga del crédito al trabajador</p>
            </div>
            <button
              onClick={abrirNuevo}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Nuevo crédito
            </button>
          </div>

          <div className="relative mb-6">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
            <input
              type="text"
              placeholder="Buscar por trabajador, RUT o nombre del crédito..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
            />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-slate-400">
                <div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin mr-3" />
                Cargando créditos...
              </div>
            ) : error ? (
              <div className="text-center py-20 text-red-500">{error}</div>
            ) : filtrados.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <span className="material-symbols-outlined text-5xl mb-3 block">payments</span>
                {busqueda ? 'Sin resultados.' : 'No hay créditos registrados.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {['Trabajador', 'Crédito', 'Cuota', 'Cuotas', 'Inicio', 'Estado'].map(col => (
                        <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{col}</th>
                      ))}
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtrados.map(c => {
                      const estado = ESTADOS[c.estado] || { label: c.estado, color: 'bg-slate-100 text-slate-700' };
                      const accion = estado.accion && ACCIONES[estado.accion];
                      const cargando = accionEnCurso?.startsWith(`${c.id}-`);
                      return (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{c.nombre_trabajador}</p>
                            <p className="text-xs text-slate-400">{c.rut}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-slate-900">{c.nombre}</p>
                            <p className="text-xs text-slate-400">{TIPOS.find(t => t.value === c.tipo)?.label}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{fmtMonto(c.amount, c.moneda)}</td>
                          <td className="px-4 py-3 text-slate-700">{c.cuota_actual} / {c.duracion}</td>
                          <td className="px-4 py-3 text-slate-700">{c.start_date}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${estado.color}`}>{estado.label}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => abrirPagare(c.id).catch(e => alert(e.message))}
                                title="Ver pagaré"
                                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                              >
                                <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                              </button>
                              {accion && (
                                <button
                                  onClick={() => ejecutarAccion(c, estado.accion)}
                                  disabled={cargando}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  <span className="material-symbols-outlined text-[16px]">{accion.icon}</span>
                                  {cargando ? 'Procesando...' : accion.label}
                                </button>
                              )}
                              {!c.buk_file_id && (
                                <button
                                  onClick={() => abrirEdicion(c)}
                                  title="Editar"
                                  className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                                >
                                  <span className="material-symbols-outlined text-[18px]">edit</span>
                                </button>
                              )}
                              {!c.buk_credit_id && (
                                <button
                                  onClick={() => handleEliminar(c)}
                                  title="Eliminar"
                                  className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                                >
                                  <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {modal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-900">
                  {editando ? `Editar crédito #${editando.id}` : 'Nuevo crédito'}
                </h2>
                <button onClick={() => setModal(false)} className="text-slate-400 hover:text-slate-700">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">

                <div className="sm:col-span-2 relative">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Trabajador *</label>
                  <input
                    type="text"
                    required
                    value={form.nombre_trabajador}
                    onChange={e => buscarTrabajador(e.target.value)}
                    placeholder="Escribe nombre o RUT (mín. 3 caracteres)"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  {form.employee_id && (
                    <p className="text-xs text-emerald-600 mt-1">ID BUK: {form.employee_id} · {form.rut}</p>
                  )}
                  {sugerencias.length > 0 && (
                    <ul className="absolute z-10 w-full bg-white border border-slate-200 rounded-xl mt-1 shadow-lg max-h-52 overflow-y-auto">
                      {sugerencias.map(t => (
                        <li key={t.employee_id}>
                          <button
                            type="button"
                            onClick={() => elegirTrabajador(t)}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50"
                          >
                            {t.full_name} <span className="text-slate-400">· {t.rut}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Nombre del crédito *</label>
                  <input type="text" required value={form.nombre} onChange={e => set('nombre', e.target.value)}
                    placeholder="Crédito Consumo Bco Chile"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Tipo *</label>
                  <select value={form.tipo} onChange={e => set('tipo', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Fecha de inicio *</label>
                  <input type="date" required value={form.start_date} onChange={e => set('start_date', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Moneda *</label>
                  <select value={form.moneda} onChange={e => set('moneda', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    <option value="peso">Pesos</option>
                    <option value="uf">UF</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    Monto original {form.moneda === 'uf' ? '(UF)' : '(pesos)'}
                  </label>
                  <input type="number" step="0.01" min="0" value={form.monto_original} onChange={e => set('monto_original', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Equivalente en pesos</label>
                  <input type="number" min="0" value={form.equivalente_pesos} onChange={e => set('equivalente_pesos', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Valor de la cuota *</label>
                  <input type="number" required min="1" value={form.amount} onChange={e => set('amount', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Total de cuotas *</label>
                  <input type="number" required min="1" value={form.duracion} onChange={e => set('duracion', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Cuota actual *</label>
                  <input type="number" required min="1" value={form.cuota_actual} onChange={e => set('cuota_actual', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>

                {form.moneda === 'uf' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Día de la UF</label>
                    <input type="text" maxLength="2" placeholder="01" value={form.dia_uf} onChange={e => set('dia_uf', e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Comentario</label>
                  <textarea rows="2" value={form.comentario} onChange={e => set('comentario', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>

                <div className="sm:col-span-2 border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Documento en BUK</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      ['visible', 'Visible por el empleado'],
                      ['signable_by_employee', 'Requiere firma del empleado'],
                      ['signable_by_legal_agent', 'Requiere firma del representante legal'],
                      ['signable_by_second_legal_agent', 'Requiere firma del segundo representante legal'],
                      ['overwrite', 'Sobreescribir archivo existente'],
                    ].map(([campo, label]) => (
                      <label key={campo} className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={form[campo]} onChange={e => set(campo, e.target.checked)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-400" />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Carpeta destino</label>
                  <input type="text" placeholder="personales/creditos" value={form.path} onChange={e => set('path', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">ID del revisor (opcional)</label>
                  <input type="number" value={form.reviewer_id} onChange={e => set('reviewer_id', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>

                {editando && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">
                      ID del documento en BUK (solo si ya está subido)
                    </label>
                    <input type="number" value={form.buk_file_id || ''} onChange={e => set('buk_file_id', e.target.value)}
                      placeholder="Vincula un documento subido a mano o por un intento fallido"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                  </div>
                )}

                <div className="sm:col-span-2 flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button type="button" onClick={() => setModal(false)}
                    className="px-5 py-2.5 text-sm font-semibold text-slate-600 rounded-xl hover:bg-slate-100">
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving}
                    className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50">
                    {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear borrador'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </SidebarLayout>
  );
};

export default Creditos;
