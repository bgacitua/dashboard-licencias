import React, { useState, useEffect } from 'react';
import SidebarLayout from '../components/SidebarLayout';
import {
  listarCreditos, buscarTrabajadores, crearCredito, actualizarCredito, eliminarCredito,
  subirDocumento, iniciarFirma, verificarFirma, crearCreditoBuk,
  verificarCreditoBuk, abrirPagare,
} from '../services/creditos';

// Tipo que se imprime en el comprobante. A BUK se le manda siempre
// 'credito_personal', que es lo que acepta su enum en /credits/create.
const TIPOS_PRESTAMO = [
  'Préstamo Emergencia',
  'Préstamo Salud',
  'Préstamo Habitacional',
  'Préstamo Automotriz',
  'Préstamo Roaming',
  'Consolidación de deuda',
];

const NOMBRES_CREDITO = ['Préstamo Interno', 'Saldo préstamo interno'];

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Años seleccionables: el actual y los dos siguientes
const ANIOS = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() + i);

// El crédito siempre parte el primer día del mes elegido
const primerDia = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}-01`;

// Estado del flujo → etiqueta, color y siguiente acción disponible
const ESTADOS = {
  borrador:         { label: 'Borrador',          color: 'bg-app-surface text-app-muted',   accion: 'documento' },
  documento_subido: { label: 'Documento subido',  color: 'bg-app-surface text-app-brand',     accion: 'firma' },
  firma_en_proceso: { label: 'Firma en proceso',  color: 'bg-yellow-100 text-yellow-700', accion: 'verificar-firma' },
  firmado:          { label: 'Firmado',           color: 'bg-app-surface text-app-brand', accion: 'credito' },
  credito_creado:   { label: 'Crédito creado',    color: 'bg-green-100 text-green-700',   accion: 'verificar-credito' },
};

const ACCIONES = {
  'documento':         { label: 'Subir documento',  icon: 'upload_file', fn: subirDocumento },
  'firma':             { label: 'Iniciar firma',    icon: 'draw',        fn: iniciarFirma },
  'verificar-firma':   { label: 'Verificar firma',  icon: 'fact_check',  fn: verificarFirma },
  'credito':           { label: 'Crear crédito',    icon: 'payments',    fn: crearCreditoBuk },
  'verificar-credito': { label: 'Verificar en BUK', icon: 'check_circle', fn: verificarCreditoBuk },
};

// Flags de firma marcados en el crédito (los apagados y _opciones no cuentan)
const requiereFirma = (c) => ['employee_sign', 'legal_agent_sign', 'second_legal_agent_sign']
  .some(k => c.firmas_requeridas?.[k]);

// Sin ninguna firma marcada el paso de firma no existe: se carga el crédito directo
const accionDe = (c) => {
  const accion = ESTADOS[c.estado]?.accion;
  return accion === 'firma' && !requiereFirma(c) ? 'credito' : accion;
};

const FORM_INICIAL = {
  employee_id: '', rut: '', nombre_trabajador: '',
  nombre: 'Préstamo Interno', tipo: 'credito_personal',
  tipo_prestamo: TIPOS_PRESTAMO[0],
  start_date: primerDia(new Date().getFullYear(), new Date().getMonth() + 1),
  moneda: 'peso',
  monto_original: '', equivalente_pesos: '',
  amount: '', cuota_actual: 1, duracion: '', comentario: '', dia_uf: '',
  visible: true,
  signable_by_employee: true,
  signable_by_legal_agent: true,
  signable_by_second_legal_agent: false,
  overwrite: false,
  path: 'préstamo',
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

  // Estilos compartidos del formulario y las acciones primarias de la página.
  const inputClass = 'w-full h-9 rounded-lg border border-app-line px-3 text-[13px] text-app-ink placeholder:text-app-outline focus:outline-none focus:border-app-ink focus:ring-1 focus:ring-app-ink';
  const labelClass = 'mb-1 block text-[12px] font-medium text-app-ink';
  const sectionTitle = 'text-[11px] font-semibold uppercase tracking-wider text-app-muted';
  const primaryBtn = 'inline-flex h-9 items-center gap-2 rounded-lg bg-app-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-app-brand/90 focus:outline-none focus:ring-2 focus:ring-app-brand focus:ring-offset-2 disabled:opacity-50';

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

  // El modal tiene dos pasos y el paso sale del propio form: sin trabajador
  // elegido solo se muestra el buscador; con trabajador, el resto del formulario.
  const trabajadorElegido = Boolean(form.employee_id);

  const limpiarTrabajador = () => {
    setForm(f => ({ ...f, employee_id: '', rut: '', nombre_trabajador: '' }));
    setSugerencias([]);
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
      dia_uf: c.dia_uf ?? '31',
      start_date: c.start_date || FORM_INICIAL.start_date,
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
      dia_uf: form.moneda === 'uf' ? form.dia_uf || '31' : null,
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
      <div className="min-h-screen bg-app-surface font-app">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-app-ink">Créditos</h1>
              <p className="text-sm text-app-muted mt-0.5">Pagaré, firma en BUK y carga del crédito al trabajador</p>
            </div>
            <button onClick={abrirNuevo} className={primaryBtn}>
              <span className="material-symbols-outlined text-[18px]">add</span>
              Nuevo crédito
            </button>
          </div>

          <div className="relative mb-6">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-app-outline text-[18px]">search</span>
            <input
              type="text"
              placeholder="Buscar por trabajador, RUT o nombre del crédito..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-app-line rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-app-ink bg-white"
            />
          </div>

          <div className="bg-white rounded-xl border border-app-line  overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-app-outline">
                <div className="w-8 h-8 border-4 border-app-line border-t-emerald-500 rounded-full animate-spin mr-3" />
                Cargando créditos...
              </div>
            ) : error ? (
              <div className="text-center py-20 text-red-500">{error}</div>
            ) : filtrados.length === 0 ? (
              <div className="text-center py-20 text-app-outline">
                <span className="material-symbols-outlined text-5xl mb-3 block">payments</span>
                {busqueda ? 'Sin resultados.' : 'No hay créditos registrados.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-app-surface border-b border-app-line">
                    <tr>
                      {['Trabajador', 'Crédito', 'Cuota', 'Cuotas', 'Inicio', 'Estado'].map(col => (
                        <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-app-muted uppercase tracking-wide">{col}</th>
                      ))}
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app-line">
                    {filtrados.map(c => {
                      const estado = ESTADOS[c.estado] || { label: c.estado, color: 'bg-app-surface text-app-muted' };
                      const claveAccion = accionDe(c);
                      const accion = claveAccion && ACCIONES[claveAccion];
                      const cargando = accionEnCurso?.startsWith(`${c.id}-`);
                      return (
                        <tr key={c.id} className="hover:bg-app-surface">
                          <td className="px-4 py-3">
                            <p className="font-medium text-app-ink">{c.nombre_trabajador}</p>
                            <p className="text-xs text-app-outline">{c.rut}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-app-ink">{c.nombre}</p>
                            <p className="text-xs text-app-outline">{c.tipo_prestamo}</p>
                          </td>
                          <td className="px-4 py-3 text-app-muted">{fmtMonto(c.amount, c.moneda)}</td>
                          <td className="px-4 py-3 text-app-muted">{c.cuota_actual} / {c.duracion}</td>
                          <td className="px-4 py-3 text-app-muted">{c.start_date}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${estado.color}`}>{estado.label}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => abrirPagare(c.id).catch(e => alert(e.message))}
                                title="Ver pagaré"
                                className="p-2 text-app-outline hover:text-app-muted rounded-lg hover:bg-app-surface"
                              >
                                <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                              </button>
                              {accion && (
                                <button
                                  onClick={() => ejecutarAccion(c, claveAccion)}
                                  disabled={cargando}
                                  className="flex items-center gap-1.5 rounded-lg bg-app-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-app-brand/90 disabled:opacity-50"
                                >
                                  <span className="material-symbols-outlined text-[16px]">{accion.icon}</span>
                                  {cargando ? 'Procesando...' : accion.label}
                                </button>
                              )}
                              {!c.buk_file_id && (
                                <button
                                  onClick={() => abrirEdicion(c)}
                                  title="Editar"
                                  className="p-2 text-app-outline hover:text-app-muted rounded-lg hover:bg-app-surface"
                                >
                                  <span className="material-symbols-outlined text-[18px]">edit</span>
                                </button>
                              )}
                              {!c.buk_credit_id && (
                                <button
                                  onClick={() => handleEliminar(c)}
                                  title="Eliminar"
                                  className="p-2 text-app-outline hover:text-red-600 rounded-lg hover:bg-red-50"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.15)] transition-[max-width] duration-200 ${trabajadorElegido ? 'max-w-5xl' : 'max-w-lg'}`}>

              {/* Encabezado fijo */}
              <div className="flex flex-shrink-0 items-center justify-between border-b border-app-line px-6 py-3">
                <h2 className="text-[16px] font-semibold tracking-tight text-app-ink">
                  {editando ? `Editar crédito #${editando.id}` : 'Nuevo crédito'}
                  <span className="ml-2 text-[13px] font-normal text-app-muted">
                    Se guarda como borrador
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  aria-label="Cerrar"
                  className="rounded-lg p-1.5 text-app-muted transition-colors hover:bg-app-surface hover:text-app-ink"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">

                {/* Cuerpo con scroll */}
                <div className="flex-1 overflow-y-auto px-6 py-4">

                  {/* ── Paso 1: elegir trabajador ── */}
                  {!trabajadorElegido ? (
                    <section>
                      <p className={sectionTitle}>Trabajador</p>
                      <div className="relative mt-2.5">
                        <label htmlFor="cred-trabajador" className={labelClass}>
                          Buscar trabajador <span className="text-red-600">*</span>
                        </label>
                        <div className="relative">
                          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-app-outline">
                            search
                          </span>
                          <input
                            id="cred-trabajador"
                            type="text"
                            autoFocus
                            value={form.nombre_trabajador}
                            onChange={e => buscarTrabajador(e.target.value)}
                            placeholder="Nombre o RUT (mínimo 3 caracteres)"
                            autoComplete="off"
                            className={`${inputClass} pl-9`}
                          />
                        </div>

                        {sugerencias.length > 0 && (
                          <ul className="mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-app-line bg-white shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
                            {sugerencias.map(t => (
                              <li key={t.employee_id}>
                                <button
                                  type="button"
                                  onClick={() => elegirTrabajador(t)}
                                  className="w-full px-4 py-2 text-left text-[13px] transition-colors hover:bg-app-surface"
                                >
                                  {t.full_name} <span className="text-app-outline">· {t.rut}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}

                        {form.nombre_trabajador.length > 0 && form.nombre_trabajador.length < 3 && (
                          <p className="mt-2 text-[12px] text-app-outline">
                            Escribe al menos 3 caracteres para buscar.
                          </p>
                        )}
                      </div>
                    </section>
                  ) : (
                  <>
                  {/* ── Paso 2: trabajador fijado + resto del formulario ── */}
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-app-line bg-app-surface px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="material-symbols-outlined text-[20px] text-app-brand">badge</span>
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-app-ink">{form.nombre_trabajador}</p>
                        <p className="text-[12px] text-app-muted">{form.rut} · ID BUK {form.employee_id}</p>
                      </div>
                    </div>
                    {!editando && (
                      <button
                        type="button"
                        onClick={limpiarTrabajador}
                        className="flex-shrink-0 rounded-lg px-2 py-1 text-[12px] font-medium text-app-brand transition-colors hover:bg-white"
                      >
                        Cambiar
                      </button>
                    )}
                  </div>

                  {/* ── Condiciones del crédito ── */}
                  <section className="mt-4">
                    <p className={sectionTitle}>Condiciones del crédito</p>

                    <div className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <label className={labelClass}>Nombre del crédito <span className="text-red-600">*</span></label>
                        <select required value={form.nombre} onChange={e => set('nombre', e.target.value)}
                          className={`${inputClass} bg-white`}>
                          {[...new Set([...NOMBRES_CREDITO, form.nombre].filter(Boolean))].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className={labelClass}>Tipo <span className="text-red-600">*</span></label>
                        <select value={form.tipo_prestamo} onChange={e => set('tipo_prestamo', e.target.value)}
                          className={`${inputClass} bg-white`}>
                          {TIPOS_PRESTAMO.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>

                      <div className="lg:col-span-2">
                        <label className={labelClass}>
                          Mes de inicio <span className="text-red-600">*</span>
                          <span className="ml-1 font-normal text-app-outline">— parte el día 1</span>
                        </label>
                        <div className="flex gap-3">
                          <select
                            value={Number(form.start_date.slice(5, 7))}
                            onChange={e => set('start_date', primerDia(form.start_date.slice(0, 4), e.target.value))}
                            className={`${inputClass} flex-1 bg-white`}>
                            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                          </select>
                          <select
                            value={Number(form.start_date.slice(0, 4))}
                            onChange={e => set('start_date', primerDia(e.target.value, form.start_date.slice(5, 7)))}
                            className={`${inputClass} flex-1 bg-white`}>
                            {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>Moneda <span className="text-red-600">*</span></label>
                        <select value={form.moneda} onChange={e => set('moneda', e.target.value)}
                          className={`${inputClass} bg-white`}>
                          <option value="peso">Pesos</option>
                          <option value="uf">UF</option>
                        </select>
                      </div>

                      {form.moneda === 'uf' && (
                        <div>
                          <label className={labelClass}>Día de la UF</label>
                          <select value={form.dia_uf} onChange={e => set('dia_uf', e.target.value)}
                            className={`${inputClass} bg-white`}>
                            <option value="31">UF fin de mes</option>
                          </select>
                        </div>
                      )}

                      <div>
                        <label className={labelClass}>
                          Monto original <span className="font-normal text-app-outline">({form.moneda === 'uf' ? 'UF' : 'pesos'})</span>
                        </label>
                        <input type="number" step="0.01" min="0" value={form.monto_original}
                          onChange={e => set('monto_original', e.target.value)} className={inputClass} />
                      </div>

                      <div>
                        <label className={labelClass}>Equivalente en pesos</label>
                        <input type="number" min="0" value={form.equivalente_pesos}
                          onChange={e => set('equivalente_pesos', e.target.value)} className={inputClass} />
                      </div>

                      <div>
                        <label className={labelClass}>Valor de la cuota <span className="text-red-600">*</span></label>
                        <input type="number" required min="1" value={form.amount}
                          onChange={e => set('amount', e.target.value)} className={inputClass} />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>Total cuotas <span className="text-red-600">*</span></label>
                          <input type="number" required min="1" value={form.duracion}
                            onChange={e => set('duracion', e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Cuota actual <span className="text-red-600">*</span></label>
                          <input type="number" required min="1" value={form.cuota_actual}
                            onChange={e => set('cuota_actual', e.target.value)} className={inputClass} />
                        </div>
                      </div>

                      <div className="sm:col-span-2 lg:col-span-3">
                        <label className={labelClass}>Comentario</label>
                        <textarea rows="1" value={form.comentario} onChange={e => set('comentario', e.target.value)}
                          className="w-full rounded-lg border border-app-line px-3 py-1.5 text-[13px] text-app-ink placeholder:text-app-outline focus:border-app-ink focus:outline-none focus:ring-1 focus:ring-app-ink" />
                      </div>
                    </div>
                  </section>

                  {/* ── Documento en BUK ── */}
                  <section className="mt-4 border-t border-app-line pt-4">
                    <p className={sectionTitle}>Documento en BUK</p>

                    <div className="mt-2.5 rounded-lg border border-app-line bg-app-surface p-3">
                      <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                        {[
                          ['visible', 'Visible por el empleado', false],
                          ['signable_by_employee', 'Requiere firma del empleado', false],
                          ['signable_by_legal_agent', 'Requiere firma del representante legal', false],
                          ['signable_by_second_legal_agent', 'Requiere firma del segundo representante legal', true],
                          ['overwrite', 'Sobreescribir archivo existente', false],
                        ].map(([campo, label, deshabilitado]) => (
                          <label key={campo}
                            className={`flex items-start gap-2 text-[13px] ${deshabilitado ? 'cursor-not-allowed text-app-outline' : 'cursor-pointer text-app-muted'}`}>
                            <input type="checkbox" checked={form[campo]} disabled={deshabilitado}
                              onChange={e => set(campo, e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-app-line text-app-brand focus:ring-app-ink disabled:opacity-50" />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <label className={labelClass}>Carpeta destino</label>
                        <input type="text" placeholder="personales/creditos" value={form.path}
                          onChange={e => set('path', e.target.value)} className={inputClass} />
                      </div>

                      <div>
                        <label className={labelClass}>
                          ID del revisor <span className="font-normal text-app-outline">(opcional)</span>
                        </label>
                        <input type="number" value={form.reviewer_id}
                          onChange={e => set('reviewer_id', e.target.value)} className={inputClass} />
                      </div>

                      {editando && (
                        <div className="sm:col-span-2">
                          <label className={labelClass}>
                            ID del documento en BUK <span className="font-normal text-app-outline">(solo si ya está subido)</span>
                          </label>
                          <input type="number" value={form.buk_file_id || ''} onChange={e => set('buk_file_id', e.target.value)}
                            placeholder="Vincula un documento subido a mano o por un intento fallido"
                            className={inputClass} />
                        </div>
                      )}
                    </div>
                  </section>
                  </>
                  )}
                </div>

                {/* Pie fijo: las acciones quedan siempre visibles */}
                <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-app-line bg-app-surface px-6 py-3">
                  <button type="button" onClick={() => setModal(false)}
                    className="h-9 rounded-lg border border-app-line bg-white px-4 text-[13px] font-medium text-app-muted transition-colors hover:border-app-ink hover:text-app-ink">
                    Cancelar
                  </button>
                  {trabajadorElegido && (
                    <button type="submit" disabled={saving} className={primaryBtn}>
                      {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear borrador'}
                    </button>
                  )}
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
