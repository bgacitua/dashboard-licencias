import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
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

  const [isEditable, setIsEditable] = useState(false);

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
  
  // Calculate Gross Haberes (Sum of all income items)
  const totalHaberes = mesDeAviso + anosServicio + vacaciones + liquidacionMesActual;
  
  const aporteCesantia = finiquitoData.aporteCesantia || 0;
  const prestamoInterno = finiquitoData.prestamoInterno || 0;
  const totalDescuentos = aporteCesantia + prestamoInterno;

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

      <main className="flex-1 ml-64 p-8 print:ml-0 print:p-0 flex justify-center">
        <div 
          ref={printRef} 
          className="w-full max-w-[215.9mm] bg-white shadow-lg min-h-[279.4mm] print:shadow-none print:w-full text-[10pt] leading-normal tracking-tighter relative overflow-hidden"
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
          <div className="px-[25mm] pt-[30mm] pb-[25mm] relative z-10">
          
            {/* Actions Bar (Hidden on Print) */}
            <div className="flex justify-between items-center mb-8 print:hidden border-b pb-4 bg-white/90 -mx-[25mm] px-[25mm] -mt-[30mm] pt-[15mm]">
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
                <button 
                  onClick={handlePrint}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined">print</span>
                  Imprimir / Descargar PDF
                </button>
              </div>
            </div>

            {/* Date - positioned to align with letterhead */}
            <div 
              className={`flex justify-end mb-1 ${isEditable ? 'border border-dashed border-gray-400 rounded p-1 print:border-none' : ''}`}
              contentEditable={isEditable}
              suppressContentEditableWarning={true}
            >
              <p className="text-[10pt]">Santiago, {formatDate(terminationDate)}</p>
            </div>

          {/* Addressee */}
          <div 
            className={`mb-2 ${isEditable ? 'border border-dashed border-gray-400 rounded p-1 print:border-none' : ''}`}
            contentEditable={isEditable}
            suppressContentEditableWarning={true}
          >
            <p>Señor</p>
            <p className="font-bold">{employeeData.nombre_trabajador}</p>
            <p>{employeeData.direccion || 'Dirección no especificada'}</p>
            <p>De nuestra consideración,</p>
          </div>

          {/* First Paragraph - Termination Notice */}
          <div 
            className={`mb-1 text-justify indent-8 ${isEditable ? 'border border-dashed border-gray-400 rounded p-1 print:border-none' : ''}`}
            contentEditable={isEditable}
            suppressContentEditableWarning={true}
          >
            <p>
              <strong>{companyDetails.legalName}</strong>, Rut: <strong>{companyDetails.rut}</strong>, le 
              comunica a usted que se procederá a poner término a su Contrato de Trabajo, con fecha {formatDate(terminationDate)}, 
              en virtud de lo dispuesto en el {(() => {
                switch(finiquitoData.terminationReason) {
                  case 'mutuo_acuerdo':
                    return 'Art. 159 N° 1 del Código del Trabajo, esto es, "Mutuo Acuerdo de las Partes".';
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
            className={`mb-1 text-justify indent-8 ${isEditable ? 'border border-dashed border-gray-400 rounded p-1 print:border-none' : ''}`}
            contentEditable={isEditable}
            suppressContentEditableWarning={true}
          >
            <p>{getSecondParagraph(employeeData.cargo)}</p>
          </div>

          {/* Third Paragraph - Payment Details */}
          <div 
            className={`mb-1 text-justify indent-8 ${isEditable ? 'border border-dashed border-gray-400 rounded p-1 print:border-none' : ''}`}
            contentEditable={isEditable}
            suppressContentEditableWarning={true}
          >
            <p>A consecuencia del término de sus labores en la empresa, se le pagarán los siguientes valores:</p>
          </div>

          {/* HABERES Table */}
          <div className="mb-1 ml-8 text-[9pt]">
            <p className="font-bold underline mb-1 text-[10pt]">HABERES</p>
            <div className="space-y-0.5">
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
              {!(liquidacionMesActual > 0 && totalDescuentos === 0) && (
                <div className="flex justify-between font-bold text-[9pt]">
                  <span>TOTAL HABERES</span>
                  <span>{formatCurrency(totalHaberes)}</span>
                </div>
              )}
            </div>
          </div>

          {/* DESCUENTOS Table - Only show if there are actual deductions */}
          {(finiquitoData.totalDescuentos || totalDescuentos) > 0 && (
            <div className="mb-1 ml-8 text-[9pt]">
              <p className="font-bold underline mb-1 text-[10pt]">DESCUENTOS</p>
              <div className="space-y-0.5">
                {aporteCesantia > 0 && (
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
                  <span>{formatCurrency(finiquitoData.totalDescuentos || totalDescuentos)}</span>
                </div>
              </div>
            </div>
          )}




          {/* TOTAL A PAGAR - Final net amount: (Haberes - Descuentos) + Liquidacion */}
          <div className="mb-1 ml-8 flex justify-between font-bold border-t border-black pt-1 text-[9pt]">
            <span>TOTAL A PAGAR</span>
            <span>{formatCurrency(finiquitoData.totalSettlement || (totalHaberes - totalDescuentos))}</span>
          </div>

          {/* Legal Notes */}
          <div 
            className={`mb-0 text-justify text-[10pt] ${isEditable ? 'border border-dashed border-gray-400 rounded p-1 print:border-none' : ''}`}
            contentEditable={isEditable}
            suppressContentEditableWarning={true}
          >
            <p className="mb-0">
              A estos valores se le deducirán los descuentos legales que pudieran corresponder.
            </p>
            <p className="mb-0">
              Comunicamos a Ud., que sus cotizaciones previsionales se encuentran al día.
            </p>
          </div>

          {/* Payment Information */}
          <div 
            className={`mb-1 text-justify ${isEditable ? 'border border-dashed border-gray-400 rounded p-1 print:border-none' : ''}`}
            contentEditable={isEditable}
            suppressContentEditableWarning={true}
          >
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

          {/* Closing */}
          <div 
            className={`mb-4 ${isEditable ? 'border border-dashed border-gray-400 rounded p-1 print:border-none' : ''}`}
            contentEditable={isEditable}
            suppressContentEditableWarning={true}
          >
            <p>Sin otro particular, le saluda atentamente</p>
          </div>

          {/* Manager Signature */}
          <div 
            className={`mb-6 mt-6 text-center ${isEditable ? 'border border-dashed border-gray-400 rounded p-1 print:border-none' : ''}`}
            contentEditable={isEditable}
            suppressContentEditableWarning={true}
          >
            <p className="font-bold">{selectedManager.name}</p>
            <p>{selectedManager.title}</p>
            <p>{companyDetails.legalName}</p>
          </div>

          {/* Worker and Inspection Signatures */}
          <div className="flex justify-between mt-6">
            <div 
              className={`${isEditable ? 'border border-dashed border-gray-400 rounded p-1 print:border-none' : ''}`}
              contentEditable={isEditable}
              suppressContentEditableWarning={true}
            >
              <p>------------------------</p>
              <p><strong>Firma del trabajador</strong></p>
              <p>Rut: {employeeData.rut_trabajador}</p>
            </div>
            <div 
              className={`text-right ${isEditable ? 'border border-dashed border-gray-400 rounded p-1 print:border-none' : ''}`}
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
