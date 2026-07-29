import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import SidebarLayout from '../components/SidebarLayout';
import {
  getContractAlerts,
  getContractAlertsGrouped,
  getContractAlertStats,
  sendContractAlerts,
  getScheduleInfo,
  getCalendario,
  saveCalendarioCierre,
  deleteCalendarioCierre,
  getTracking,
  syncToBuk,
} from '../services/contractAlerts';

const buildPatchPreview = (row) => {
  const [dd, mm, yyyy] = (row.alert_date || '01-01-2000').split('-');
  const startDate = `${yyyy}-${mm}-01`;
  const contractType = row.response === 'indefinido' ? 'Indefinido' : 'Plazo fijo';
  return {
    endpoint: `PATCH /employees/${row.employee_id}/jobs/{job_id}`,
    body: {
      start_date: startDate,
      type_of_contract: contractType,
      end_of_contract: row.response === 'plazo_fijo' ? '(desde BUK)' : '',
      end_of_contract_2: '',
    },
  };
};

const ContractAlerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [grouped, setGrouped] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filtros y ordenamiento
  const [filterType, setFilterType] = useState('Todos');
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal de resumen por jefe
  const [showBossModal, setShowBossModal] = useState(false);
  const [selectedBosses, setSelectedBosses] = useState([]);

  // Estado de envío
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [authRequired, setAuthRequired] = useState(false);

  // Schedule info
  const [scheduleInfo, setScheduleInfo] = useState(null);

  // Calendario modal
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarData, setCalendarData] = useState([]);
  const [calendarInputs, setCalendarInputs] = useState({});
  const [savingCalendar, setSavingCalendar] = useState(false);

  // Override manual de días
  const [customDays, setCustomDays] = useState(null);
  const [daysInput, setDaysInput] = useState('');

  // Tab activo
  const [activeTab, setActiveTab] = useState('alertas');

  // Seguimiento
  const [tracking, setTracking] = useState([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [syncResult, setSyncResult] = useState(null);

  // Cargar datos
  const fetchData = async (daysOverride = customDays) => {
    setLoading(true);
    setError(null);
    try {
      const [alertsData, groupedData, statsData, schedData] = await Promise.all([
        getContractAlerts(daysOverride),
        getContractAlertsGrouped(daysOverride),
        getContractAlertStats(daysOverride),
        getScheduleInfo().catch(() => null),
      ]);
      setAlerts(alertsData);
      setGrouped(groupedData);
      setStats(statsData);
      if (schedData) setScheduleInfo(schedData);
    } catch (err) {
      setError('Error al cargar las alertas de contratos. Verifica la conexión al backend.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTracking = async () => {
    setTrackingLoading(true);
    try {
      const data = await getTracking();
      setTracking(data);
    } catch (err) {
      console.error(err);
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleSyncBuk = async (id) => {
    setSyncingId(id);
    setSyncResult(null);
    try {
      const result = await syncToBuk(id);
      setSyncResult({ ok: true, id, message: `Sincronizado: ${result.contract_type}` });
      await fetchTracking();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al sincronizar';
      setSyncResult({ ok: false, id, message: msg });
    } finally {
      setSyncingId(null);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'seguimiento') fetchTracking();
  }, [activeTab]);

  // Filtrar alertas
  const filteredAlerts = useMemo(() => {
    let result = [...alerts];

    // Filtro por tipo
    if (filterType !== 'Todos') {
      result = result.filter((a) => a.alert_type === filterType);
    }

    // Búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (a) =>
          a.employee_name?.toLowerCase().includes(term) ||
          a.boss_name?.toLowerCase().includes(term) ||
          a.employee_rut?.toLowerCase().includes(term)
      );
    }

    // Ordenamiento
    if (sortColumn) {
      result.sort((a, b) => {
        const valA = (a[sortColumn] || '').toString().toLowerCase();
        const valB = (b[sortColumn] || '').toString().toLowerCase();
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [alerts, filterType, searchTerm, sortColumn, sortDirection]);

  const groupedTracking = useMemo(() => {
    const ORDER = ['pendiente', 'indefinido', 'plazo_fijo', 'no_renovar'];
    const groups = { pendiente: [], indefinido: [], plazo_fijo: [], no_renovar: [] };
    tracking.forEach((row) => {
      const key = row.response ?? 'pendiente';
      groups[key].push(row);
    });
    ORDER.forEach((key) => {
      groups[key].sort((a, b) => {
        if (!a.first_sent_at) return 1;
        if (!b.first_sent_at) return -1;
        return a.first_sent_at.localeCompare(b.first_sent_at);
      });
    });
    return ORDER.map((key) => ({ key, rows: groups[key] })).filter((g) => g.rows.length > 0);
  }, [tracking]);

  // Manejar ordenamiento
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column) => {
    if (sortColumn !== column) return 'unfold_more';
    return sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward';
  };

  // Manejar selección de jefes
  const toggleBossSelection = (boss) => {
    setSelectedBosses((prev) => {
      const exists = prev.find(
        (b) => b.boss_name === boss.boss_name && b.boss_email === boss.boss_email
      );
      if (exists) {
        return prev.filter(
          (b) => !(b.boss_name === boss.boss_name && b.boss_email === boss.boss_email)
        );
      }
      return [...prev, { boss_name: boss.boss_name, boss_email: boss.boss_email }];
    });
  };

  const toggleAllBosses = () => {
    if (selectedBosses.length === grouped.length) {
      setSelectedBosses([]);
    } else {
      setSelectedBosses(
        grouped.map((g) => ({ boss_name: g.boss_name, boss_email: g.boss_email }))
      );
    }
  };

  // Enviar alertas
  const handleSendAlerts = async () => {
    if (selectedBosses.length === 0) return;

    const confirmed = window.confirm(
      `¿Enviar alertas a ${selectedBosses.length} jefe(s) seleccionados?\n\nEsta acción enviará correos vía Outlook.`
    );
    if (!confirmed) return;

    setSending(true);
    setSendResult(null);
    setAuthRequired(false);
    try {
      const result = await sendContractAlerts(selectedBosses);
      if (result.auth_required) {
        setAuthRequired(true);
        return;
      }
      setSendResult(result);
      await fetchData();
      setSelectedBosses([]);
    } catch (err) {
      setSendResult({
        bosses_successful: 0,
        bosses_failed: selectedBosses.length,
        alerts_sent: 0,
        alerts_failed: 0,
        message: 'Error al enviar alertas.',
      });
    } finally {
      setSending(false);
    }
  };

  // Badge de tipo de alerta
  const AlertTypeBadge = ({ type }) => {
    const configs = {
      SEGUNDO_PLAZO: {
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        text: 'text-amber-700 dark:text-amber-400',
        label: 'Segundo Plazo',
      },
      INDEFINIDO: {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        text: 'text-blue-700 dark:text-blue-400',
        label: 'Indefinido',
      },
    };
    const config = configs[type] || {
      bg: 'bg-gray-100',
      text: 'text-gray-600',
      label: type,
    };

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}
      >
        {config.label}
      </span>
    );
  };

  // Nombres de meses en español
  const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  // Calendario handlers
  const fetchCalendario = async (year) => {
    try {
      const data = await getCalendario(year);
      setCalendarData(data.cierres || []);
      // Llenar inputs con datos existentes
      const inputs = {};
      (data.cierres || []).forEach((c) => {
        inputs[c.mes] = c.fecha_cierre;
      });
      setCalendarInputs(inputs);
    } catch (err) {
      console.error('Error cargando calendario:', err);
      setCalendarData([]);
      setCalendarInputs({});
    }
  };

  const openCalendarModal = () => {
    setShowCalendarModal(true);
    fetchCalendario(calendarYear);
  };

  const handleCalendarYearChange = (delta) => {
    const newYear = calendarYear + delta;
    setCalendarYear(newYear);
    fetchCalendario(newYear);
  };

  const handleSaveCierre = async (mes) => {
    const fechaStr = calendarInputs[mes];
    if (!fechaStr) return;
    setSavingCalendar(true);
    try {
      await saveCalendarioCierre(calendarYear, mes, fechaStr);
      await fetchCalendario(calendarYear);
      // Actualizar schedule info
      const updatedInfo = await getScheduleInfo().catch(() => null);
      if (updatedInfo) setScheduleInfo(updatedInfo);
    } catch (err) {
      console.error('Error guardando cierre:', err);
    } finally {
      setSavingCalendar(false);
    }
  };

  const handleDeleteCierre = async (mes) => {
    const cierre = calendarData.find((c) => c.mes === mes);
    if (!cierre) return;
    setSavingCalendar(true);
    try {
      await deleteCalendarioCierre(cierre.id);
      const newInputs = { ...calendarInputs };
      delete newInputs[mes];
      setCalendarInputs(newInputs);
      await fetchCalendario(calendarYear);
      const updatedInfo = await getScheduleInfo().catch(() => null);
      if (updatedInfo) setScheduleInfo(updatedInfo);
    } catch (err) {
      console.error('Error eliminando cierre:', err);
    } finally {
      setSavingCalendar(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <SidebarLayout>
        <main className="flex-1 flex items-center justify-center min-h-screen">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-500">Cargando alertas de contratos...</p>
          </div>
        </main>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout>
      <main className="overflow-y-auto p-4 md:p-8">
          <div className={`${activeTab === 'seguimiento' ? 'max-w-[1600px]' : 'max-w-7xl'} mx-auto`}>
            {/* Header */}
            <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <Link
                  to="/menu"
                  className="flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  <span className="material-symbols-outlined text-xl">arrow_back</span>
                  <span className="text-sm font-medium">Menú</span>
                </Link>
                <div>
                  <h1 className="text-2xl font-bold text-[#111318] dark:text-white">
                    Alertas de Contratos
                  </h1>
                  <p className="text-sm text-[#616f89] dark:text-gray-400">
                    Gestión de vencimientos y renovaciones de contratos
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={openCalendarModal}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[#1a202c] border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all shadow-sm"
                >
                  <span className="material-symbols-outlined text-lg">calendar_month</span>
                  Calendario
                </button>
                <button
                  onClick={fetchData}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[#1a202c] border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all shadow-sm"
                >
                  <span className="material-symbols-outlined text-lg">refresh</span>
                  Actualizar
                </button>
                <button
                  onClick={() => setShowBossModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl text-sm font-semibold hover:from-orange-600 hover:to-red-600 transition-all shadow-sm shadow-orange-200 dark:shadow-orange-900/20"
                >
                  <span className="material-symbols-outlined text-lg">send</span>
                  Enviar por Jefe
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-white dark:bg-[#1a202c] rounded-xl p-1 shadow-sm border border-gray-100 dark:border-gray-800 w-fit">
              {[
                { key: 'alertas', label: 'Alertas', icon: 'notifications_active' },
                { key: 'seguimiento', label: 'Seguimiento', icon: 'track_changes' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.key
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Schedule Info Banner */}
            {activeTab === 'alertas' && scheduleInfo && (
              <div className={`mb-6 p-4 rounded-2xl border flex items-center gap-4 flex-wrap ${
                scheduleInfo.modo === 'cierre'
                  ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                  : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800'
              }`}>
                <div className={`p-2 rounded-lg ${
                  scheduleInfo.modo === 'cierre'
                    ? 'bg-red-100 dark:bg-red-900/30'
                    : 'bg-blue-100 dark:bg-blue-900/30'
                }`}>
                  <span className={`material-symbols-outlined ${
                    scheduleInfo.modo === 'cierre' ? 'text-red-600' : 'text-blue-600'
                  }`}>
                    {scheduleInfo.modo === 'cierre' ? 'priority_high' : 'date_range'}
                  </span>
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${
                    scheduleInfo.modo === 'cierre'
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-blue-700 dark:text-blue-400'
                  }`}>
                    {scheduleInfo.modo === 'cierre' ? 'Modo Cierre de Mes' : 'Modo Normal'}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    Buscando alertas del <strong>{scheduleInfo.fecha_inicio}</strong> al <strong>{scheduleInfo.fecha_fin}</strong>
                    {' '}({scheduleInfo.dias_rango} días)
                  </p>
                </div>
                {scheduleInfo.fecha_cierre_mes && (
                  <div className="text-right">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Cierre del mes</p>
                    <p className={`text-sm font-bold ${
                      scheduleInfo.modo === 'cierre' ? 'text-red-600' : 'text-blue-600'
                    }`}>
                      {scheduleInfo.fecha_cierre_mes}
                    </p>
                    {scheduleInfo.dias_al_cierre != null && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {scheduleInfo.dias_al_cierre <= 0
                          ? 'Cierre hoy o ya pasó'
                          : `${scheduleInfo.dias_al_cierre} día(s) restante(s)`}
                      </p>
                    )}
                  </div>
                )}
                {!scheduleInfo.fecha_cierre_mes && (
                  <button
                    onClick={openCalendarModal}
                    className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    Configurar cierre
                  </button>
                )}

                {/* Separador vertical */}
                <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 hidden sm:block"></div>

                {/* Custom days input */}
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    placeholder="Días"
                    value={daysInput}
                    onChange={(e) => setDaysInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = parseInt(daysInput);
                        if (val > 0) { setCustomDays(val); fetchData(val); }
                      }
                    }}
                    className="w-16 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-center focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                  <button
                    onClick={() => {
                      const val = parseInt(daysInput);
                      if (val > 0) { setCustomDays(val); fetchData(val); }
                    }}
                    disabled={!daysInput || parseInt(daysInput) <= 0}
                    className="p-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Buscar con rango personalizado"
                  >
                    <span className="material-symbols-outlined text-sm">search</span>
                  </button>
                  {customDays && (
                    <button
                      onClick={() => {
                        setCustomDays(null);
                        setDaysInput('');
                        fetchData(null);
                      }}
                      className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                      title="Volver al rango automático"
                    >
                      <span className="material-symbols-outlined text-sm">restart_alt</span>
                    </button>
                  )}
                  {customDays && (
                    <span className="text-[10px] font-bold bg-green-500 text-white px-2 py-0.5 rounded-full">
                      {customDays}d manual
                    </span>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'alertas' && <>
            {/* Error */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3">
                <span className="material-symbols-outlined text-red-500">error</span>
                <span className="text-red-700 dark:text-red-400 text-sm">{error}</span>
                <button
                  onClick={fetchData}
                  className="ml-auto text-red-600 dark:text-red-400 text-sm font-medium hover:underline"
                >
                  Reintentar
                </button>
              </div>
            )}

            {/* Send Result Banner */}
            {sendResult && (
              <div
                className={`mb-6 p-4 rounded-xl flex items-start gap-3 ${
                  sendResult.bosses_failed === 0
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                }`}
              >
                <span
                  className={`material-symbols-outlined mt-0.5 ${
                    sendResult.bosses_failed === 0 ? 'text-green-500' : 'text-amber-500'
                  }`}
                >
                  {sendResult.bosses_failed === 0 ? 'check_circle' : 'warning'}
                </span>
                <div className="flex-1">
                  <p
                    className={`text-sm font-medium ${
                      sendResult.bosses_failed === 0
                        ? 'text-green-700 dark:text-green-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {sendResult.message}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Exitosos: {sendResult.bosses_successful} jefe(s), {sendResult.alerts_sent}{' '}
                    alerta(s) | Fallidos: {sendResult.bosses_failed} jefe(s)
                  </p>
                </div>
                <button
                  onClick={() => setSendResult(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
            )}

            {/* Stats Cards */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white dark:bg-[#1a202c] rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                      <span className="material-symbols-outlined text-orange-600 dark:text-orange-400">
                        notifications_active
                      </span>
                    </div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Total
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-[#111318] dark:text-white">
                    {stats.total_alerts}
                  </p>
                </div>

                <div className="bg-white dark:bg-[#1a202c] rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                      <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">
                        schedule
                      </span>
                    </div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Segundo Plazo
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-[#111318] dark:text-white">
                    {stats.segundo_plazo_count}
                  </p>
                </div>

                <div className="bg-white dark:bg-[#1a202c] rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">
                        all_inclusive
                      </span>
                    </div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Indefinido
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-[#111318] dark:text-white">
                    {stats.indefinido_count}
                  </p>
                </div>

                <div className="bg-white dark:bg-[#1a202c] rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                      <span className="material-symbols-outlined text-purple-600 dark:text-purple-400">
                        groups
                      </span>
                    </div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Jefes
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-[#111318] dark:text-white">
                    {stats.bosses_to_notify}
                  </p>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="bg-white dark:bg-[#1a202c] rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 mb-6">
              <div className="flex flex-wrap items-center gap-4">
                {/* Search */}
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <span className="material-symbols-outlined text-gray-400 text-xl">search</span>
                  <input
                    type="text"
                    placeholder="Buscar por empleado, jefe o RUT..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1 bg-transparent border-none outline-none text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400"
                  />
                </div>

                {/* Filter by type */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Tipo:
                  </span>
                  {['Todos', 'SEGUNDO_PLAZO', 'INDEFINIDO'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setFilterType(type)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        filterType === type
                          ? 'bg-orange-500 text-white shadow-sm'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {type === 'Todos'
                        ? 'Todos'
                        : type === 'SEGUNDO_PLAZO'
                        ? 'Segundo Plazo'
                        : 'Indefinido'}
                    </button>
                  ))}
                </div>

                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {filteredAlerts.length} resultado(s)
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-[#1a202c] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      {[
                        { key: 'employee_name', label: 'Empleado' },
                        { key: 'employee_rut', label: 'RUT' },
                        { key: 'employee_role', label: 'Cargo' },
                        { key: 'boss_name', label: 'Jefe' },
                        { key: 'alert_date', label: 'Fecha Alerta' },
                        { key: 'alert_reason', label: 'Motivo' },
                        { key: 'alert_type', label: 'Tipo' },
                      ].map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 transition-colors select-none"
                        >
                          <div className="flex items-center gap-1">
                            {col.label}
                            <span className="material-symbols-outlined text-sm">
                              {getSortIcon(col.key)}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {filteredAlerts.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-4 py-12 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <span className="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600">
                              inbox
                            </span>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              No hay alertas pendientes
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredAlerts.map((alert, index) => (
                        <tr
                          key={index}
                          className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                            alert.alert_type === 'INDEFINIDO'
                              ? 'bg-blue-50/30 dark:bg-blue-900/5'
                              : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {alert.employee_name}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                              {alert.employee_rut}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {alert.employee_role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {alert.boss_name}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {alert.alert_date}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {alert.alert_reason}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <AlertTypeBadge type={alert.alert_type} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            </>}

            {/* Tab Seguimiento */}
            {activeTab === 'seguimiento' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-[#111318] dark:text-white">Seguimiento de Respuestas</h2>
                  <button
                    onClick={fetchTracking}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[#1a202c] border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all shadow-sm"
                  >
                    <span className="material-symbols-outlined text-lg">refresh</span>
                    Actualizar
                  </button>
                </div>

                {syncResult && (
                  <div className={`mb-4 p-3 rounded-xl border text-sm font-medium flex items-center gap-2 ${syncResult.ok ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'}`}>
                    <span className="material-symbols-outlined text-lg">{syncResult.ok ? 'check_circle' : 'error'}</span>
                    {syncResult.message}
                    <button onClick={() => setSyncResult(null)} className="ml-auto text-gray-400 hover:text-gray-600"><span className="material-symbols-outlined text-lg">close</span></button>
                  </div>
                )}

                {trackingLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : tracking.length === 0 ? (
                  <div className="bg-white dark:bg-[#1a202c] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-12 text-center">
                    <span className="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600">inbox</span>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Sin registros de seguimiento aún</p>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-[#1a202c] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1200px] table-fixed">
                        <thead>
                          <tr className="border-b border-gray-100 dark:border-gray-800">
                            {[
                              { label: 'Fecha Envío', cls: 'w-40' },
                              { label: 'Respuesta', cls: 'w-32' },
                              { label: 'Empleado', cls: 'w-64' },
                              { label: 'Cargo', cls: 'w-56' },
                              { label: 'Jefatura', cls: 'w-56' },
                              { label: 'Fecha Inicio', cls: 'w-36' },
                              { label: 'Vencimiento', cls: 'w-36' },
                              { label: 'BUK Sync', cls: 'w-44' },
                            ].map((h) => (
                              <th key={h.label} className={`px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap ${h.cls}`}>{h.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {groupedTracking.map(({ key, rows }) => {
                            const groupConfig = {
                              pendiente: {
                                label: 'Pendiente',
                                headerCls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-l-4 border-amber-400',
                                rowCls: 'hover:bg-amber-50/60 dark:hover:bg-amber-900/10',
                                icon: 'schedule',
                              },
                              indefinido: {
                                label: 'Indefinido',
                                headerCls: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
                                rowCls: 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                                icon: 'check_circle',
                              },
                              plazo_fijo: {
                                label: 'Plazo Fijo',
                                headerCls: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
                                rowCls: 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                                icon: 'event',
                              },
                              no_renovar: {
                                label: 'No Renovar',
                                headerCls: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
                                rowCls: 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                                icon: 'cancel',
                              },
                            };
                            const gc = groupConfig[key];
                            return (
                              <React.Fragment key={key}>
                                {/* Cabecera de grupo */}
                                <tr>
                                  <td colSpan={8} className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 ${gc.headerCls}`}>
                                    <span className="flex items-center gap-1.5">
                                      <span className="material-symbols-outlined text-sm">{gc.icon}</span>
                                      {gc.label}
                                      <span className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-white/60 dark:bg-black/20 text-xs font-bold">
                                        {rows.length}
                                      </span>
                                    </span>
                                  </td>
                                </tr>
                                {/* Filas del grupo */}
                                {rows.map((row) => {
                                  const canSync = row.response && row.response !== 'no_renovar' && !row.buk_synced;
                                  const isPending = key === 'pendiente';
                                  const preview = canSync ? buildPatchPreview(row) : null;
                                  return (
                                    <tr key={row.id} className={`border-b border-gray-50 dark:border-gray-800 transition-colors ${gc.rowCls}`}>
                                      {/* Fecha Envío */}
                                      <td className="px-6 py-3.5 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                        {row.first_sent_at || '—'}
                                      </td>
                                      {/* Respuesta (solo hora) */}
                                      <td className="px-6 py-3.5 text-sm whitespace-nowrap">
                                        {isPending ? (
                                          <span className="inline-flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                            Pendiente
                                          </span>
                                        ) : (
                                          <span className="text-sm text-gray-500 dark:text-gray-400">
                                            {row.responded_at ? row.responded_at.split(' ')[1] : '—'}
                                          </span>
                                        )}
                                      </td>
                                      {/* Empleado */}
                                      <td className="px-6 py-3.5 text-sm font-medium text-gray-900 dark:text-white">{row.employee_name}</td>
                                      {/* Cargo */}
                                      <td className="px-6 py-3.5 text-sm text-gray-500 dark:text-gray-400">{row.employee_role}</td>
                                      {/* Jefatura */}
                                      <td className="px-6 py-3.5 text-sm text-gray-700 dark:text-gray-300">{row.boss_name}</td>
                                      {/* Fecha Inicio */}
                                      <td className="px-6 py-3.5 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{row.employee_start_date || '—'}</td>
                                      {/* Vencimiento */}
                                      <td className="px-6 py-3.5 text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.alert_date}</td>
                                      {/* BUK Sync */}
                                      <td className="px-6 py-3.5">
                                        {row.buk_synced ? (
                                          <div>
                                            <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                                              <span className="material-symbols-outlined text-sm">check_circle</span>
                                              Sincronizado
                                            </span>
                                            {row.buk_synced_at && (
                                              <p className="text-[10px] text-gray-400 mt-0.5">{row.buk_synced_at}</p>
                                            )}
                                          </div>
                                        ) : canSync ? (
                                          <div className="relative group inline-block">
                                            <button
                                              onClick={() => handleSyncBuk(row.id)}
                                              disabled={syncingId === row.id}
                                              className="flex items-center gap-1 px-2.5 py-1 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
                                            >
                                              {syncingId === row.id ? (
                                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                              ) : (
                                                <span className="material-symbols-outlined text-sm">sync</span>
                                              )}
                                              Sync BUK
                                            </button>
                                            {/* Tooltip debug PATCH preview */}
                                            <div className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-72 p-3 bg-gray-900 text-white rounded-xl shadow-xl pointer-events-none">
                                              <p className="text-gray-400 text-[10px] mb-1.5 font-sans">{preview.endpoint}</p>
                                              <pre className="text-green-400 text-[11px] whitespace-pre-wrap font-mono leading-relaxed">{JSON.stringify(preview.body, null, 2)}</pre>
                                              <p className="text-gray-500 text-[9px] mt-2 font-sans leading-tight">job_id y end_of_contract (plazo fijo) se resuelven en runtime desde BUK</p>
                                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                                            </div>
                                          </div>
                                        ) : (
                                          <span className="text-xs text-gray-400">—</span>
                                        )}
                                        {row.buk_sync_error && !row.buk_synced && (
                                          <p className="text-[10px] text-red-400 mt-0.5 max-w-[140px] truncate" title={row.buk_sync_error}>
                                            <span className="material-symbols-outlined text-[11px] align-middle mr-0.5">error</span>
                                            {row.buk_sync_error}
                                          </p>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </main>

      {/* Modal: Resumen por Jefe */}
      {showBossModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#1a202c] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[#111318] dark:text-white">
                    Resumen por Jefe
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Selecciona los jefes a los que deseas enviar alertas
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowBossModal(false);
                    setSelectedBosses([]);
                    setSendResult(null);
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-gray-400">close</span>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Banner auth requerida */}
              {authRequired && (
                <div className="mb-4 p-4 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 flex items-start gap-3">
                  <span className="material-symbols-outlined text-yellow-500 mt-0.5">lock</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">
                      Se requiere autorización de Microsoft
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Haz clic en el botón, inicia sesión con tu cuenta y aprueba en DUO.
                      La ventana se cerrará automáticamente.
                    </p>
                  </div>
                  <a
                    href="/api/v1/contract-alerts/auth/login"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setAuthRequired(false)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                    Autorizar correo
                  </a>
                </div>
              )}

              {/* Send Result in Modal */}
              {sendResult && (
                <div
                  className={`mb-4 p-4 rounded-xl ${
                    sendResult.bosses_failed === 0
                      ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                      : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                  }`}
                >
                  <p
                    className={`text-sm font-medium ${
                      sendResult.bosses_failed === 0
                        ? 'text-green-700 dark:text-green-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {sendResult.message}
                  </p>
                </div>
              )}

              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="px-4 py-3 text-left w-10">
                      <input
                        type="checkbox"
                        checked={selectedBosses.length === grouped.length && grouped.length > 0}
                        onChange={toggleAllBosses}
                        className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Jefe
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Empleados
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {grouped.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-4 py-8 text-center text-gray-400">
                        No hay jefes con alertas pendientes
                      </td>
                    </tr>
                  ) : (
                    grouped.map((boss, index) => {
                      const isSelected = selectedBosses.some(
                        (b) =>
                          b.boss_name === boss.boss_name && b.boss_email === boss.boss_email
                      );
                      return (
                        <tr
                          key={index}
                          onClick={() => toggleBossSelection(boss)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-orange-50 dark:bg-orange-900/10'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleBossSelection(boss)}
                              className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {boss.boss_name}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {boss.boss_email}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-sm font-bold">
                              {boss.employee_count}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {selectedBosses.length} jefe(s) seleccionado(s)
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowBossModal(false);
                    setSelectedBosses([]);
                    setSendResult(null);
                  }}
                  className="px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                >
                  Cerrar
                </button>
                <button
                  onClick={handleSendAlerts}
                  disabled={selectedBosses.length === 0 || sending}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl text-sm font-semibold hover:from-orange-600 hover:to-red-600 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Enviando...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-lg">send</span>
                      Enviar Alertas
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Calendario de Cierres */}
      {showCalendarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#1a202c] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col mx-4">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[#111318] dark:text-white">
                    Calendario de Cierres
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Define la fecha de cierre para cada mes.
                    7 días antes del cierre se amplía el rango de búsqueda.
                  </p>
                </div>
                <button
                  onClick={() => setShowCalendarModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-gray-400">close</span>
                </button>
              </div>

              {/* Year selector */}
              <div className="flex items-center gap-4 mt-4">
                <button
                  onClick={() => handleCalendarYearChange(-1)}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-gray-500">chevron_left</span>
                </button>
                <span className="text-lg font-bold text-[#111318] dark:text-white min-w-[60px] text-center">
                  {calendarYear}
                </span>
                <button
                  onClick={() => handleCalendarYearChange(1)}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <span className="material-symbols-outlined text-gray-500">chevron_right</span>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {MESES.map((nombreMes, idx) => {
                  const mes = idx + 1;
                  const cierreExistente = calendarData.find((c) => c.mes === mes);
                  const inputValue = calendarInputs[mes] || '';
                  const hoy = new Date();
                  const esActual = hoy.getFullYear() === calendarYear && hoy.getMonth() + 1 === mes;

                  return (
                    <div
                      key={mes}
                      className={`rounded-xl border p-3 transition-all ${
                        esActual
                          ? 'border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-900/10'
                          : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-sm font-semibold ${
                          esActual ? 'text-orange-700 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          {nombreMes}
                          {esActual && (
                            <span className="ml-2 text-[10px] font-bold bg-orange-500 text-white px-1.5 py-0.5 rounded-full">
                              ACTUAL
                            </span>
                          )}
                        </span>
                        {cierreExistente && (
                          <span className="text-[10px] font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
                            Configurado
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={inputValue}
                          onChange={(e) =>
                            setCalendarInputs((prev) => ({ ...prev, [mes]: e.target.value }))
                          }
                          className="flex-1 px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-orange-500 outline-none"
                        />
                        <button
                          onClick={() => handleSaveCierre(mes)}
                          disabled={!inputValue || savingCalendar}
                          className="p-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          title="Guardar"
                        >
                          <span className="material-symbols-outlined text-sm">save</span>
                        </button>
                        {cierreExistente && (
                          <button
                            onClick={() => handleDeleteCierre(mes)}
                            disabled={savingCalendar}
                            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-40 transition-colors"
                            title="Eliminar"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex justify-end">
              <button
                onClick={() => setShowCalendarModal(false)}
                className="px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
};

export default ContractAlerts;
