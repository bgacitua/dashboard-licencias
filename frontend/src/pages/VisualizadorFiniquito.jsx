import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import FiniquitosService from '../services/finiquitos.service';
import Sidebar from '../components/Sidebar';
import { useReactToPrint } from 'react-to-print';

const VisualizadorFiniquito = () => {
  const { rut } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [employeeData, setEmployeeData] = useState(null);
  const [items, setItems] = useState([]);
  const [isEditable, setIsEditable] = useState(false);
  const [margins, setMargins] = useState({});
  const printRef = useRef(null);

  // Decodificar RUT en caso de que venga URL-encoded
  const decodedRut = decodeURIComponent(rut);

  // Get data passed from CrearFiniquito via navigation state or sessionStorage (for new tab)
  const getFiniquitoData = () => {
    // First try location.state (when navigated from same tab)
    if (location.state && Object.keys(location.state).length > 0) {
      return location.state;
    }
    // Fallback to sessionStorage (when opened in new tab)
    // Try both encoded and decoded RUT
    let storedData = sessionStorage.getItem(`finiquito_${decodedRut}`);
    if (!storedData) {
      storedData = sessionStorage.getItem(`finiquito_${rut}`);
    }
    if (storedData) {
      return JSON.parse(storedData);
    }
    return {};
  };
  
  const finiquitoData = getFiniquitoData();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await FiniquitosService.getItemsByRut(rut);
        
        if (Array.isArray(data) && data.length > 0) {
          setEmployeeData(data[0]); 
          setItems(data);
        } else if (data && !Array.isArray(data)) {
          setEmployeeData(data);
          setItems([data]);
        }
      } catch (error) {
        console.error("Error fetching settlement details:", error);
      } finally {
        setLoading(false);
      }
    };

    if (rut) {
      fetchData();
    }
  }, [rut]);

  // Handler para generar PDF e imprimir
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Finiquito_${employeeData?.rut_trabajador || rut}`,
    pageStyle: `
      @page {
        size: letter;
        margin: 0mm !important;
      }
      @media print {
        html, body {
          width: 216mm;
          height: 279mm;        
          margin: 0 !important;
          padding: 0 !important;
        }
      }
    `,
  });

  // Get the second paragraph based on cargo
  const getSecondParagraph = (cargo) => {
    const cargoLower = (cargo || '').toLowerCase();
    
    if (cargoLower.includes('operario')) {
      return 'La causal invocada se basa en la necesidad de reestructurar el área de producción, ya que la empresa ha decidido modernizar la planta donde se desempeña, para lo cual ha adquirido una máquina que permitirá automatizar algunas funciones que se realizan en el área. Por lo anterior, se producirá una sobre dotación del área lo que hace necesaria su desvinculación.';
    }
    
    // Default paragraph with dynamic cargo
    return `La causal invocada se basa en que se ha determinado reestructurar el área donde usted se desempeñaba, reduciendo la dotación de ${cargo || 'su cargo'}, redistribuyendo las funciones que usted desempeñaba entre los demás trabajadores del área.`;
  };

  // Format date in Spanish
  const formatDate = (dateString) => {
    if (!dateString) return '';
    
    // Handle YYYY-MM-DD (or ISO with T) manually to create local date and avoid timezone offsets
    // new Date("2026-02-05") creates UTC 00:00, which in local time (e.g. UTC-3) is 21:00 prev day
    const cleanDate = dateString.includes('T') ? dateString.split('T')[0] : dateString;
    const parts = cleanDate.split('-');
    
    if (parts.length === 3) {
      const [year, month, day] = parts.map(Number);
      // Create local date using constructor (year, monthIndex, day)
      const date = new Date(year, month - 1, day);
      const options = { year: 'numeric', month: 'long', day: 'numeric' };
      return date.toLocaleDateString('es-CL', options);
    }
    
    // Fallback
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('es-CL', options);
  };

  // Format currency
  const formatCurrency = (amount) => {
    return `$ ${Math.round(amount || 0).toLocaleString('es-CL')}.-`;
  };

  // Genera y descarga el Excel de auditoría (misma estructura que en CrearFiniquito)
  const downloadAuditExcel = () => {
    const audit = finiquitoData?.audit;
    if (!audit || !employeeData) return;
    const lastDayWork = finiquitoData.lastDayWork || '';
    const fmt = (n) => `$ ${Math.round(n).toLocaleString('es-CL')}.-`;
    const fmtNum = (n) => Math.round(Number(n) || 0);
    const ws = {};
    const setRow = (row, label, value) => {
      ws[`A${row}`] = { t: 's', v: label };
      const hasValue = value !== undefined && value !== null && value !== '';
      const isNum = typeof value === 'number';
      if (hasValue || value === 0) {
        ws[`B${row}`] = isNum ? { t: 'n', v: value } : { t: 's', v: String(value ?? '') };
      } else {
        ws[`B${row}`] = { t: 's', v: '' };
      }
    };

    const formatYearsMonthsDays = (startDate, endDate) => {
      if (!startDate || !endDate) return '';
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
      let years = end.getFullYear() - start.getFullYear();
      let months = end.getMonth() - start.getMonth();
      let days = end.getDate() - start.getDate();
      if (days < 0) {
        months -= 1;
        const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
        days += prevMonth.getDate();
      }
      if (months < 0) {
        years -= 1;
        months += 12;
      }
      const result = [];
      if (years > 0) result.push(`${years} año${years > 1 ? 's' : ''}`);
      if (months > 0) result.push(`${months} mes${months > 1 ? 'es' : ''}`);
      if (days > 0) result.push(`${days} día${days > 1 ? 's' : ''}`);
      return result.length ? result.join(', ') : '0 días';
    };

    setRow(2, 'Causal de término del contrato', audit.causalLabel || '');
    setRow(4, 'Nombre trabajador', employeeData.nombre_trabajador || '');
    setRow(5, 'Cargo del trabajador', employeeData.cargo || '');
    setRow(6, 'Jefe de área', employeeData.nombre_jefe || '');
    setRow(9, 'Fecha de ingreso del trabajador', employeeData.fecha_ingreso || '');
    setRow(10, 'Fecha de salida', lastDayWork);
    setRow(
      11,
      'Duración empresa',
      employeeData.fecha_ingreso && lastDayWork
        ? formatYearsMonthsDays(employeeData.fecha_ingreso, lastDayWork)
        : ''
    );
    setRow(15, 'Sueldo base del trabajador', fmtNum(audit.salary));
    setRow(16, 'Promedio remuneración variable', fmtNum(audit.variableBonus));

    // Detalle de ítems usados para el promedio de remuneración variable:
    // Desde D15 hacia abajo: columna D = concepto, E = periodo, F = monto
    const detalles = Array.isArray(audit.variableItemsDetail)
      ? audit.variableItemsDetail
      : [];
    detalles.forEach((d, idx) => {
      const row = 15 + idx;
      ws[`D${row}`] = { t: 's', v: String(d.concepto ?? '') };
      ws[`E${row}`] = { t: 's', v: String(d.periodo ?? '') };
      ws[`F${row}`] = {
        t: 'n',
        v: Number.isFinite(Number(d.monto)) ? Number(d.monto) : 0,
      };
    });
    setRow(17, 'Gratificación legal', fmtNum(audit.gratificacion));
    setRow(18, 'Movilización', fmtNum(audit.movilizacion));
    setRow(20, 'Total haber', fmtNum(audit.haberes));
    setRow(
      23,
      `Indemnización por Años de Servicio${audit.yearsForIndemnity != null ? ` (${audit.yearsForIndemnity})` : ''}`,
      audit.yearsIndemnityResult != null && audit.yearsIndemnityResult > 0 ? fmtNum(audit.yearsIndemnityResult) : ''
    );
    const vacacionesDiasStr =
      audit.vacationCalendarDays != null && audit.vacationCalendarDays > 0
        ? ` (${Number(audit.vacationCalendarDays).toFixed(1)} días)`
        : '';
    const vacacionesVal =
      audit.vacationIndemnityResult != null && audit.vacationIndemnityResult > 0 ? fmt(audit.vacationIndemnityResult) : '';
    setRow(24, `Vacaciones pendientes${vacacionesDiasStr}`, vacacionesVal || '');
    setRow(25, 'Mes de aviso', audit.noticeIndemnityResult != null && audit.noticeIndemnityResult > 0 ? fmtNum(audit.noticeIndemnityResult) : '');
    setRow(26, 'Remuneración adeudada', audit.liquidacionMesActual != null && Number(audit.liquidacionMesActual) > 0 ? fmtNum(audit.liquidacionMesActual) : '');
    setRow(27, 'Otros descuentos', audit.otrosDescuentos != null && audit.otrosDescuentos > 0 ? `-${fmtNum(audit.otrosDescuentos)}` : '');
    setRow(28, 'Aporte Empleador Seguro Cesantía', audit.aporteCesantiaVal != null && audit.aporteCesantiaVal > 0 ? `-${fmtNum(audit.aporteCesantiaVal)}` : '');
    setRow(30, 'Total a pagar', fmtNum(audit.totalSettlementResult));

    // Mutuo Acuerdo Especial - logs/reglas usadas
    if (audit?.mutuoEspecialRules?.applied) {
      const r = audit.mutuoEspecialRules;
      setRow(32, 'Mutuo Acuerdo Especial - Regla aplicada', String(r.ruleApplied ?? ''));
      setRow(33, 'Edad (años)', r.age != null ? fmtNum(r.age) : '');
      setRow(34, 'Años de indemnización', r.years != null ? fmtNum(r.years) : '');
      setRow(35, 'Base (promedio 48 sueldos base)', r.baseAmount != null ? fmtNum(r.baseAmount) : '');
      setRow(36, 'Cap 90 UF', r.cap90UF != null ? fmtNum(r.cap90UF) : '');
      setRow(37, 'Base acotada (si aplica)', r.cappedBase != null ? fmtNum(r.cappedBase) : '');
      setRow(38, 'Años acotados (si aplica)', r.cappedYears != null ? fmtNum(r.cappedYears) : '');
      setRow(39, 'Resultado añosIndemnity (mutuo)', r.result != null ? fmtNum(r.result) : '');
    }

    const lastDetalleRow = detalles.length > 0 ? 15 + detalles.length - 1 : 30;
    const lastRow = audit?.mutuoEspecialRules?.applied ? Math.max(lastDetalleRow, 39) : lastDetalleRow;

    // Asegura que Excel muestre tanto el detalle variable como las filas extra de mutuo.
    ws['!ref'] = `A2:F${lastRow}`;
    ws['!cols'] = [
      { wch: 38 },
      { wch: 24 },
      { wch: 8 },
      { wch: 30 },
      { wch: 12 },
      { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Finiquito');
    XLSX.writeFile(wb, `auditoria_finiquito_${employeeData.rut_trabajador || 'rut'}_${lastDayWork || 'fecha'}.xlsx`);
  };

  // Helper for rendering margin controls
  const renderMarginControls = (id) => {
    if (!isEditable) return null;
    const currentTop = margins[`${id}_top`] || 0;
    const currentBottom = margins[`${id}_bottom`] || 0;

    return (
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 flex flex-row items-center gap-1 print:hidden opacity-0 group-hover:opacity-100 transition-opacity z-50">
        {/* Move block up (decrease top margin) */}
        <div className="flex items-center bg-white shadow border border-blue-300 rounded-full px-1 py-0.5 gap-0.5">
          <span className="text-[9px] font-bold text-blue-400 leading-none select-none">↑</span>
          <button onClick={() => setMargins({...margins, [`${id}_top`]: currentTop - 2})} title="Subir bloque" className="text-blue-600 hover:bg-blue-50 rounded-full p-0.5 leading-none"><span className="material-symbols-outlined text-[13px]">remove</span></button>
          <button onClick={() => setMargins({...margins, [`${id}_top`]: currentTop + 2})} title="Bajar bloque" className="text-blue-600 hover:bg-blue-50 rounded-full p-0.5 leading-none"><span className="material-symbols-outlined text-[13px]">add</span></button>
          <span className="text-[9px] font-bold text-blue-400 leading-none select-none">↓</span>
        </div>
        {/* Space below (change bottom margin) */}
        <div className="flex items-center bg-white shadow border border-gray-300 rounded-full px-1 py-0.5 gap-0.5">
          <span className="text-[9px] text-gray-400 leading-none select-none font-bold">Esp</span>
          <button onClick={() => setMargins({...margins, [`${id}_bottom`]: currentBottom - 2})} title="Menos espacio abajo" className="text-gray-500 hover:bg-gray-50 rounded-full p-0.5 leading-none"><span className="material-symbols-outlined text-[13px]">remove</span></button>
          <button onClick={() => setMargins({...margins, [`${id}_bottom`]: currentBottom + 2})} title="Más espacio abajo" className="text-gray-500 hover:bg-gray-50 rounded-full p-0.5 leading-none"><span className="material-symbols-outlined text-[13px]">add</span></button>
        </div>
      </div>
    );
  };

  // Helper to add business days (Mon-Fri)
  const addBusinessDays = (date, days) => {
    let result = new Date(date);
    let count = 0;
    while (count < days) {
      result.setDate(result.getDate() + 1);
      // 0 = Sunday, 6 = Saturday
      if (result.getDay() !== 0 && result.getDay() !== 6) {
        count++;
      }
    }
    return result;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-[#f8f9fa] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-500">Cargando datos del finiquito...</p>
        </div>
      </div>
    );
  }

  if (!employeeData) {
    return (
      <div className="flex min-h-screen bg-[#f8f9fa] items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-4xl text-gray-400 mb-2">description</span>
          <p className="text-gray-500">No se encontró información para el RUT: {rut}</p>
          <button 
            onClick={() => navigate('/finiquitos')}
            className="mt-4 text-blue-600 hover:underline"
          >
            Volver al listado
          </button>
        </div>
      </div>
    );
  }

  // Get data from navigation state or employeeData
  const terminationDate = finiquitoData.lastDayWork || employeeData.fecha_salida || new Date().toISOString().split('T')[0];
  
  // Calculate Notary Date: 10th business day from termination
  // Parsing locally to ensure correct start date
  const terminationDateObj = new Date(terminationDate.includes('T') ? terminationDate.split('T')[0] : terminationDate);
  // Fix: The parsed date might be UTC 00:00, leading to previous day in local if simply used. 
  // We prefer using the split components as done in formatDate or ensuring the date object is correct.
  // Actually, let's use the explicit constructor used in formatDate for safety.
  const tParts = (terminationDate.includes('T') ? terminationDate.split('T')[0] : terminationDate).split('-');
  const localTerminationDate = new Date(tParts[0], tParts[1] - 1, tParts[2]);
  
  const notaryDateObj = addBusinessDays(localTerminationDate, 10);
  const notaryDate = notaryDateObj.toISOString().split('T')[0];
  
  // Get manager info
  const selectedManager = finiquitoData.selectedManager || {
    name: 'Juan Heriberto Cárcamo Catalan',
    title: 'Gerente de Producción y Logística',
    company: 'Carlos Cramer Productos Aromáticos S.A.C.I.'
  };

  // Calculate values
  const mesDeAviso = finiquitoData.noticeIndemnity || 0;
  const anosServicio = finiquitoData.yearsIndemnity || 0;
  const vacaciones = finiquitoData.vacationIndemnity || 0;
  const liquidacionMesActual = finiquitoData.liquidacionMesActual || 0;
  
  const aporteCesantia = finiquitoData.aporteCesantia || 0;
  const prestamoInterno = finiquitoData.prestamoInterno || 0;
  const totalDescuentos = aporteCesantia + prestamoInterno;

  const isMutuoAcuerdo = finiquitoData.terminationReason === 'mutuo_acuerdo' || finiquitoData.terminationReason === 'mutuo_acuerdo_especial';
  
  const totalHaberesNormal = mesDeAviso + anosServicio + vacaciones + liquidacionMesActual;
  const indemnizacionConvencional = mesDeAviso + anosServicio - aporteCesantia;
  
  const totalHaberesDisplay = isMutuoAcuerdo 
    ? (indemnizacionConvencional + vacaciones + liquidacionMesActual)
    : totalHaberesNormal;
    
  // Hide cesantia from total discounts calculation for mutually agreed termination, as it's factored into haberes
  const totalDescuentosData = finiquitoData.totalDescuentos || totalDescuentos;
  const totalDescuentosDisplay = isMutuoAcuerdo 
    ? (totalDescuentosData - aporteCesantia)
    : totalDescuentosData;

  // Determine Company Details based on "nombre_empresa"
  const getCompanyDetails = (empresaRaw) => {
    const normalized = empresaRaw?.toLowerCase() || '';
    
    if (normalized.includes('sabores')) {
      return {
        legalName: 'Sabores y Fragancias.CL Comercial Ltda.',
        rut: '76.165.072-6',
        logoType: 'sabores', // Special background treatment
        backgroundImage: '/membrete-sabores.jpg'
      };
    } else if (normalized.includes('servicios') || normalized.includes('logística')) {
      return {
        legalName: 'SERVICIOS DE PRODUCCIÓN Y LOGÍSTICA CCPA LTDA',
        rut: '76.479.573-3',
        logoType: 'ccpa', // Uses CCPA logo aligned right
        backgroundImage: '/ccpa-logo.png'
      };
    } else {
      // Default to Carlos Cramer
      return {
        legalName: 'Carlos Cramer Productos Aromáticos S.A.C.I.',
        rut: '92.845.000-7',
        logoType: 'cramer', // Full page letterhead
        backgroundImage: '/membrete-cramer.png'
      };
    }
  };

  const companyDetails = getCompanyDetails(employeeData.nombre_empresa);
  const isSabores = companyDetails.logoType === 'sabores';
  const isCCPA = companyDetails.logoType === 'ccpa';
  const isCramer = companyDetails.logoType === 'cramer';

  // Helper for background styles
  const getBackgroundStyles = () => {
    if (isSabores) {
       return {
         backgroundSize: '95% 100%',
         backgroundPosition: 'center 20px' // Full Page
       };
    } else if (isCCPA) {
       return {
         backgroundSize: '20% auto',
         backgroundPosition: 'right 25mm top 15mm' // Top Right
       };
    } else {
       // Cramer (Default)
       return {
         backgroundSize: '100% 100%',
         backgroundPosition: 'center -25px' // Full Page
       };
    }
  };

  const bgStyles = getBackgroundStyles();

  return (
    <div className="flex min-h-screen bg-[#525659] font-['Times_New_Roman',_serif] print:bg-white">
      <div className="print:hidden fixed left-0 top-0 h-full z-10">
        <Sidebar />
      </div>

      <main className="flex-1 ml-64 p-8 print:ml-0 print:p-0 flex flex-col items-center">
        {/* Actions Bar (Hidden on Print) - Moved outside printRef for fidelity */}
        <div className="w-full max-w-[215.9mm] flex justify-between items-center mb-4 print:hidden bg-white/50 p-4 rounded-xl border border-gray-100 backdrop-blur-sm">
          <div className="flex gap-2">
            <button 
              onClick={() => navigate(`/finiquitos/crear/${decodedRut}`, { state: { preserveData: true } })}
              className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
            >
              <span className="material-symbols-outlined mr-2">arrow_back</span>
              Volver a editar
            </button>
          </div>
          <div className="flex gap-3">
             <button 
              onClick={() => setIsEditable(!isEditable)}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${isEditable ? 'bg-orange-100 text-orange-700 border border-orange-300' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              <span className="material-symbols-outlined">edit_document</span>
              {isEditable ? 'Modo Edición (Activo)' : 'Habilitar Edición'}
            </button>
            {finiquitoData?.audit && (
              <button
                onClick={downloadAuditExcel}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-sm"
              >
                <span className="material-symbols-outlined">table_chart</span>
                Descargar Excel de auditoría
              </button>
            )}
            <button 
              onClick={handlePrint}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm"
            >
              <span className="material-symbols-outlined">print</span>
              Imprimir / Descargar PDF
            </button>
          </div>
        </div>

        <div 
          ref={printRef} 
          className="w-full max-w-[215.9mm] bg-white shadow-lg h-[279.4mm] print:shadow-none print:w-full text-[9.5pt] leading-tight tracking-tighter relative flex flex-col overflow-hidden"
        >
          {/* Background Image Layer - Conditional Styling for Sabores vs Cramer/Global */}
          <div 
            className="absolute inset-0 z-0"
            style={{
              backgroundImage: `url(${companyDetails.backgroundImage})`,
              backgroundSize: bgStyles.backgroundSize,
              backgroundPosition: bgStyles.backgroundPosition,
              backgroundRepeat: 'no-repeat',
              opacity: 1 
            }}
          />

          {/* Content container with padding for the text area - Adjusted for letterhead */}
          <div className="px-[25mm] pt-[10mm] pb-[10mm] relative z-10 text-[9.5pt] leading-tight flex flex-col flex-1">
          


            {/* Date - positioned to align with letterhead */}
            <div 
              className={`relative group flex flex-col items-end justify-start min-h-0 w-full rounded p-0 mb-4 ${isEditable ? 'border border-dashed border-gray-400 print:border-transparent' : 'border border-transparent'}`}
              style={{ marginTop: `${margins['date_top'] || 0}mm`, marginBottom: `${margins['date_bottom'] || 0}mm` }}
              contentEditable={isEditable}
              suppressContentEditableWarning={true}
            >
              {renderMarginControls('date')}
              <p className="text-[10pt]">Santiago, {formatDate(terminationDate)}</p>
            </div>

          {/* Addressee */}
          <div 
            className={`relative group rounded p-0 mb-1 ${isEditable ? 'border border-dashed border-gray-400 print:border-transparent' : 'border border-transparent'}`}
            style={{ marginTop: `${margins['addressee_top'] || 0}mm`, marginBottom: `${margins['addressee_bottom'] || 0}mm` }}
            contentEditable={isEditable}
            suppressContentEditableWarning={true}
          >
            {renderMarginControls('addressee')}
            <p>Señor(a):</p>
            <p className="font-bold">{employeeData.nombre_trabajador}</p>
            <p>
              {(() => {
                const dirRaw =
                  employeeData.direccion ??
                  finiquitoData.employeeData?.direccion ??
                  '';
                const comunaRaw =
                  employeeData.comuna ??
                  finiquitoData.employeeData?.comuna ??
                  '';

                const dir = String(dirRaw).trim();
                const comuna = String(comunaRaw).trim();

                const parts = [];
                if (dir) parts.push(dir);
                if (comuna) parts.push(comuna);

                return parts.length > 0 ? parts.join(', ') : 'Dirección no especificada';
              })()}
            </p>
            <p>De nuestra consideración,</p>
          </div>

          {/* Paragraphs - Conditional based on termination reason (mutuo_acuerdo_especial se muestra como mutuo acuerdo) */}
          {(finiquitoData.terminationReason === 'mutuo_acuerdo' || finiquitoData.terminationReason === 'mutuo_acuerdo_especial') ? (
            <>
              {/* Mutuo Acuerdo Paragraph */}
              <div 
                className={`relative group text-justify indent-8 rounded p-2 mb-2 ${isEditable ? 'border border-dashed border-gray-400 print:border-transparent' : 'border border-transparent'}`}
                style={{ marginTop: `${margins['p1_mutuo_top'] || 0}mm`, marginBottom: `${margins['p1_mutuo_bottom'] || 0}mm` }}
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                {renderMarginControls('p1_mutuo')}
                <p>
                  <strong>{companyDetails.legalName}</strong>, Rut: <strong>{companyDetails.rut}</strong>, y usted, han decidido poner término a la relación laboral que los unía en virtud al contrato de trabajo, suscrito con fecha {formatDate(employeeData.fecha_ingreso)}, a contar del día {formatDate(terminationDate)}, en virtud de lo dispuesto en el Art. 159 inciso 1° del Código del Trabajo, esto es “Mutuo Acuerdo”.
                </p>
              </div>
              
              {/* Payment Details */}
              <div 
                className={`relative group text-justify indent-8 rounded p-2 mb-2 ${isEditable ? 'border border-dashed border-gray-400 print:border-transparent' : 'border border-transparent'}`}
                style={{ marginTop: `${margins['p2_mutuo_top'] || 0}mm`, marginBottom: `${margins['p2_mutuo_bottom'] || 0}mm` }}
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                {renderMarginControls('p2_mutuo')}
                <p>A consecuencia del término de sus labores en la empresa, se le pagarán los siguientes valores:</p>
              </div>
            </>
          ) : (
            <>
              {/* First Paragraph - Termination Notice */}
              <div 
                className={`relative group text-justify indent-8 rounded p-2 mb-2 ${isEditable ? 'border border-dashed border-gray-400 print:border-transparent' : 'border border-transparent'}`}
                style={{ marginTop: `${margins['p1_top'] || 0}mm`, marginBottom: `${margins['p1_bottom'] || 0}mm` }}
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                {renderMarginControls('p1')}
                <p>
                  <strong>{companyDetails.legalName}</strong>, Rut: <strong>{companyDetails.rut}</strong>, le 
                  comunica a usted que se procederá a poner término a su Contrato de Trabajo, con fecha {formatDate(terminationDate)}, 
                  en virtud de lo dispuesto en el {(() => {
                    switch(finiquitoData.terminationReason) {
                      case 'renuncia':
                        return 'Art. 159 N° 2 del Código del Trabajo, esto es, "Renuncia Voluntaria".';
                      case 'no_concurrencia':
                        return 'Art. 160 N° 3 del Código del Trabajo, esto es, "No concurrencia del trabajador a sus labores sin causa justificada".';
                      case 'necesidades_empresa':
                      default:
                        return 'Art. 161 inciso 1° del Código del Trabajo, esto es, "Necesidades de la Empresa, Establecimiento o Servicio".';
                    }
                  })()}
                </p>
              </div>

              {/* Second Paragraph - Conditional based on cargo */}
              <div 
                className={`relative group text-justify indent-8 rounded p-2 mb-2 ${isEditable ? 'border border-dashed border-gray-400 print:border-transparent' : 'border border-transparent'}`}
                style={{ marginTop: `${margins['p2_top'] || 0}mm`, marginBottom: `${margins['p2_bottom'] || 0}mm` }}
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                {renderMarginControls('p2')}
                <p>{getSecondParagraph(employeeData.cargo)}</p>
              </div>

              {/* Third Paragraph - Payment Details */}
              <div 
                className={`relative group text-justify indent-8 rounded p-2 mb-2 ${isEditable ? 'border border-dashed border-gray-400 print:border-transparent' : 'border border-transparent'}`}
                style={{ marginTop: `${margins['p3_top'] || 0}mm`, marginBottom: `${margins['p3_bottom'] || 0}mm` }}
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                {renderMarginControls('p3')}
                <p>A consecuencia del término de sus labores en la empresa, se le pagarán los siguientes valores:</p>
              </div>
            </>
          )}

          {/* HABERES Table */}
          <div 
            className={`relative group ml-8 text-[9pt] rounded p-1 mb-1 ${isEditable ? 'border border-dashed border-gray-400 print:border-transparent' : 'border border-transparent'}`}
            style={{ marginTop: `${margins['haberes_top'] || 0}mm`, marginBottom: `${margins['haberes_bottom'] || 0}mm` }}
            contentEditable={isEditable}
            suppressContentEditableWarning={true}
          >
            {renderMarginControls('haberes')}
            <p className="font-bold underline mb-1 text-[10pt]">HABERES</p>
            <div className="space-y-0.5">
              {isMutuoAcuerdo ? (
                <>
                  {indemnizacionConvencional > 0 && (
                    <div className="flex justify-between">
                      <span>Indemnización convencional</span>
                      <span>{formatCurrency(indemnizacionConvencional)}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {mesDeAviso > 0 && (
                    <div className="flex justify-between">
                      <span>Indemnización mes de aviso</span>
                      <span>{formatCurrency(mesDeAviso)}</span>
                    </div>
                  )}
                  {anosServicio > 0 && (
                    <div className="flex justify-between">
                      <span>Indemnización años de Servicios ({finiquitoData.yearsForIndemnity || 0} años)</span>
                      <span>{formatCurrency(anosServicio)}</span>
                    </div>
                  )}
                </>
              )}
              {vacaciones > 0 && (
                <div className="flex justify-between">
                  <span>Vacaciones Proporcionales ({(finiquitoData.vacationCalendarDays || 0).toFixed(1)} días)</span>
                  <span>{formatCurrency(vacaciones)}</span>
                </div>
              )}
              {liquidacionMesActual > 0 && (
                <div className="flex justify-between">
                  <span>Remuneración adeudada</span>
                  <span>{formatCurrency(liquidacionMesActual)}</span>
                </div>
              )}

              {/* Show Total Haberes unless we have remuneration and no discounts (redundant with Total Payment) */}
              {!(liquidacionMesActual > 0 && totalDescuentosDisplay === 0) && (
                <div className="flex justify-between font-bold text-[9pt]">
                  <span>TOTAL HABERES</span>
                  <span>{formatCurrency(totalHaberesDisplay)}</span>
                </div>
              )}
            </div>
          </div>

          {/* DESCUENTOS Table - Only show if there are actual deductions */}
          {totalDescuentosDisplay > 0 && (
            <div 
              className={`relative group ml-8 text-[9pt] rounded p-1 mb-1 ${isEditable ? 'border border-dashed border-gray-400 print:border-transparent' : 'border border-transparent'}`}
              style={{ marginTop: `${margins['descuentos_top'] || 0}mm`, marginBottom: `${margins['descuentos_bottom'] || 0}mm` }}
              contentEditable={isEditable}
              suppressContentEditableWarning={true}
            >
              {renderMarginControls('descuentos')}
              <p className="font-bold underline mb-1 text-[10pt]">DESCUENTOS</p>
              <div className="space-y-0.5">
                {!isMutuoAcuerdo && aporteCesantia > 0 && (
                  <div className="flex justify-between">
                    <span>Aporte Empleador Seguro de Cesantía</span>
                    <span>{formatCurrency(aporteCesantia)}</span>
                  </div>
                )}
                {prestamoInterno > 0 && (() => {
                    // Find the loan item to get the detail
                    const loanItem = finiquitoData.descuentosPersonalizados?.find(d => d.descripcion?.toLowerCase().includes('préstamo'));
                    return (
                      <div className="flex justify-between">
                        <span>Préstamo interno {loanItem?.detalle ? `(${loanItem.detalle})` : ''}</span>
                        <span>{formatCurrency(prestamoInterno)}</span>
                      </div>
                    );
                })()}
                {/* Show other descuentos from arrays */}
                {/* Show other descuentos from arrays - Filter out duplicates handled in personalizados */}
                {finiquitoData.descuentosItems?.filter(d => 
                    d.monto > 0 && 
                    !(d.descripcion || d.concepto)?.toLowerCase().includes('cesant') && 
                    !(d.descripcion || d.concepto)?.toLowerCase().includes('préstamo') &&
                    !(d.descripcion || d.concepto)?.toLowerCase().includes('prestamo') &&
                    !(d.descripcion || d.concepto)?.toLowerCase().includes('planilla')
                ).map((d, idx) => (
                  <div key={`auto-${idx}`} className="flex justify-between">
                    <span>{(d.descripcion || d.concepto)} {d.detalle ? `(${d.detalle})` : ''}</span>
                    <span>{formatCurrency(d.monto)}</span>
                  </div>
                ))}
                {finiquitoData.descuentosPersonalizados?.filter(d => parseFloat(d.monto) > 0 && !d.descripcion?.toLowerCase().includes('préstamo')).map((d, idx) => (
                  <div key={`custom-${idx}`} className="flex justify-between">
                    <span>{d.descripcion} {d.detalle ? `${d.detalle}` : ''}</span>
                    <span>{formatCurrency(parseFloat(d.monto) * (parseInt(d.cuotas) || 1))}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-[9pt]">
                  <span className="underline">TOTAL DESCUENTOS</span>
                  <span>{formatCurrency(totalDescuentosDisplay)}</span>
                </div>
              </div>
            </div>
          )}




          {/* TOTAL A PAGAR */}
          <div 
            className={`relative group ml-8 rounded p-1 mb-0.5 ${isEditable ? 'border border-dashed border-gray-400 print:border-transparent' : 'border border-transparent'}`}
            style={{ marginTop: `${margins['total_top'] || 0}mm`, marginBottom: `${margins['total_bottom'] || 0}mm` }}
            contentEditable={isEditable}
            suppressContentEditableWarning={true}
          >
            {renderMarginControls('total')}
            <div className="flex justify-between font-bold border-t border-black pt-0.5 text-[9pt]">
              <span>TOTAL A PAGAR</span>
              <span>{formatCurrency(finiquitoData.totalSettlement || (totalHaberesDisplay - totalDescuentosDisplay))}</span>
            </div>
          </div>

          {/* Legal Notes */}
          <div 
            className={`relative group text-justify text-[10pt] rounded p-1 mb-0 ${isEditable ? 'border border-dashed border-gray-400 print:border-transparent' : 'border border-transparent'}`}
            style={{ marginTop: `${margins['legal_top'] || 0}mm`, marginBottom: `${margins['legal_bottom'] || 0}mm` }}
            contentEditable={isEditable}
            suppressContentEditableWarning={true}
          >
            {renderMarginControls('legal')}
            <p className="mb-0">
              A estos valores se le deducirán los descuentos legales que pudieran corresponder.
            </p>
            <p className="mb-0">
              Comunicamos a Ud., que sus cotizaciones previsionales se encuentran al día.
            </p>
          </div>

          {/* Payment Information */}
          <div 
            className={`relative group text-justify rounded p-1 mb-1 ${isEditable ? 'border border-dashed border-gray-400 print:border-transparent' : 'border border-transparent'}`}
            style={{ marginTop: `${margins['payment_top'] || 0}mm`, marginBottom: `${margins['payment_bottom'] || 0}mm` }}
            contentEditable={isEditable}
            suppressContentEditableWarning={true}
          >
            {renderMarginControls('payment')}
            <p>
              {liquidacionMesActual > 0 
                ? "El monto adeudado por concepto de remuneración será pagado en el finiquito." 
                : "El monto por concepto de remuneración fue cancelado el penúltimo día hábil del mes en curso."}
            </p>
            <p>
              Finalmente, le informamos que su finiquito se encontrará disponible para su firma y pago desde el 
              día {formatDate(notaryDate)}, en la Notaría Alvaro González Salinas, ubicada en Avenida 
              Apoquindo #3001, piso 2, donde podrá efectuar reserva de derechos, si lo estima necesario. El 
              horario de atención es de lunes a jueves de 9:00 a 14:00 hrs. y de 15:00 a 17:00 hrs. Viernes de 9:00 
              a 16:00 hrs. Cualquier duda, le solicitamos contactar a Claudia Cisternas Flores al número 09-99996703.
            </p>
          </div>

          {/* Flex spacer - pushes signatures toward bottom */}
          <div className="flex-1" />

          {/* Closing */}
          <div 
            className={`relative group rounded py-0 px-1 mt-2 ${isEditable ? 'border border-dashed border-gray-400 print:border-transparent' : 'border border-transparent'}`}
            style={{ marginTop: `${margins['closing_top'] || 0}mm`, marginBottom: `${margins['closing_bottom'] || 0}mm` }}
            contentEditable={isEditable}
            suppressContentEditableWarning={true}
          >
            {renderMarginControls('closing')}
            <p>Sin otro particular, le saluda atentamente</p>
          </div>

          {/* Manager Signature */}
          <div 
            className={`relative group text-center rounded py-0 px-1 ${isEditable ? 'border border-dashed border-gray-400 print:border-transparent' : 'border border-transparent'}`}
            style={{ marginTop: `${(margins['manager_top'] || 0) + 16}mm`, marginBottom: `${margins['manager_bottom'] || 0}mm` }}
            contentEditable={isEditable}
            suppressContentEditableWarning={true}
          >
            {renderMarginControls('manager')}
            <p className="font-bold">{selectedManager.name}</p>
            <p>{selectedManager.title}</p>
            <p>{companyDetails.legalName}</p>
          </div>

          {/* Worker and Inspection Signatures */}
          <div 
            className={`relative group flex justify-between rounded py-0 px-1 ${isEditable ? 'border border-dashed border-gray-400 print:border-transparent' : 'border border-transparent'}`}
            style={{ marginTop: `${(margins['worker_top'] || 0) + 16}mm`, marginBottom: `${margins['worker_bottom'] || 0}mm` }}
          >
            {renderMarginControls('worker')}
            <div 
              className={`rounded py-0 px-1 ${isEditable ? 'border border-dashed border-gray-400 print:border-transparent' : 'border border-transparent'}`}
              contentEditable={isEditable}
              suppressContentEditableWarning={true}
            >
              <p>------------------------</p>
              <p><strong>Firma del trabajador</strong></p>
              <p>Rut: {employeeData.rut_trabajador}</p>
            </div>
            <div 
              className={`text-right rounded py-0 px-1 ${isEditable ? 'border border-dashed border-gray-400 print:border-transparent' : 'border border-transparent'}`}
              contentEditable={isEditable}
              suppressContentEditableWarning={true}
            >
              <p><strong>C.C.: Inspección del Trabajo</strong></p>
            </div>
          </div>


          <div className="text-center mt-2 text-xs text-gray-400 print:hidden">
            <p>Este documento es un borrador generado automáticamente.</p>
          </div>

          </div> {/* End content container */}
        </div>
      </main>
    </div>
  );
};

export default VisualizadorFiniquito;
