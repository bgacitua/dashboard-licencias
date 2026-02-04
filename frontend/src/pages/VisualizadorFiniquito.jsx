import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import FiniquitosService from '../services/finiquitos.service';
import Sidebar from '../components/Sidebar';

const VisualizadorFiniquito = () => {
  const { rut } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [employeeData, setEmployeeData] = useState(null);
  const [items, setItems] = useState([]);

  // Get data passed from CrearFiniquito via navigation state
  const finiquitoData = location.state || {};

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

  const handlePrint = () => {
    window.print();
  };

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
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('es-CL', options);
  };

  // Format currency
  const formatCurrency = (amount) => {
    return `$ ${Math.round(amount || 0).toLocaleString('es-CL')}.-`;
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
  const notaryDate = finiquitoData.notaryDate || new Date(new Date(terminationDate).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
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
  const totalHaberes = mesDeAviso + anosServicio + vacaciones;
  
  const aporteCesantia = finiquitoData.aporteCesantia || 0;
  const prestamoInterno = finiquitoData.prestamoInterno || 0;
  const totalDescuentos = aporteCesantia + prestamoInterno;

  return (
    <div className="flex min-h-screen bg-[#525659] font-['Times_New_Roman',_serif] print:bg-white">
      <div className="print:hidden fixed left-0 top-0 h-full z-10">
        <Sidebar />
      </div>

      <main className="flex-1 ml-64 p-8 print:ml-0 print:p-0 flex justify-center">
        <div className="w-full max-w-[210mm] bg-white shadow-lg px-[25mm] py-[15mm] min-h-[297mm] print:shadow-none print:w-full text-[11pt] leading-relaxed">
          
          {/* Actions Bar (Hidden on Print) */}
          <div className="flex justify-between items-center mb-8 print:hidden border-b pb-4">
            <button 
              onClick={() => navigate(-1)}
              className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
            >
              <span className="material-symbols-outlined mr-2">arrow_back</span>
              Volver
            </button>
            <button 
              onClick={handlePrint}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined">print</span>
              Imprimir
            </button>
          </div>

          {/* Logo and Date */}
          <div className="flex justify-between items-start mb-8">
            <div></div>
            <div className="text-right">
              <img src="/logo-cramer.png" alt="Carlos Cramer" className="h-12 mb-2 ml-auto" onError={(e) => e.target.style.display='none'} />
              <p className="text-[10pt]">Santiago, {formatDate(terminationDate)}</p>
            </div>
          </div>

          {/* Addressee */}
          <div className="mb-6">
            <p>Señor</p>
            <p className="font-bold">{employeeData.nombre_trabajador}</p>
            <p>{employeeData.direccion || 'Dirección no especificada'}</p>
            <p>De nuestra consideración,</p>
          </div>

          {/* First Paragraph - Termination Notice */}
          <div className="mb-4 text-justify indent-8">
            <p>
              <strong>Carlos Cramer Productos Aromáticos S.A.C.I.</strong>, Rut: <strong>92.845.000-7</strong>, le 
              comunica a usted que se procederá a poner término a su Contrato de Trabajo, con fecha {formatDate(terminationDate)}, 
              en virtud de lo dispuesto en el Art. 161 inciso 1° del Código del Trabajo, esto es, 
              "Necesidades de la Empresa, Establecimiento o Servicio".
            </p>
          </div>

          {/* Second Paragraph - Conditional based on cargo */}
          <div className="mb-4 text-justify indent-8">
            <p>{getSecondParagraph(employeeData.cargo)}</p>
          </div>

          {/* Third Paragraph - Payment Details */}
          <div className="mb-4 text-justify indent-8">
            <p>A consecuencia del término de sus labores en la empresa, se le pagarán los siguientes valores:</p>
          </div>

          {/* HABERES Table */}
          <div className="mb-4 ml-8">
            <p className="font-bold underline mb-2">HABERES</p>
            <div className="space-y-1">
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
                  <span>Vacaciones Proporcionales ({(finiquitoData.vacationDays || 0).toFixed(1)} días)</span>
                  <span className="border-b border-black">{formatCurrency(vacaciones)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold">
                <span>TOTAL HABERES</span>
                <span>{formatCurrency(finiquitoData.totalSettlement || totalHaberes)}</span>
              </div>
            </div>
          </div>

          {/* DESCUENTOS Table - Only show if there are actual deductions */}
          {(finiquitoData.totalDescuentos || totalDescuentos) > 0 && (
            <div className="mb-4 ml-8">
              <p className="font-bold underline mb-2">DESCUENTOS</p>
              <div className="space-y-1">
                {aporteCesantia > 0 && (
                  <div className="flex justify-between">
                    <span>Aporte Empleador Seguro de Cesantía</span>
                    <span>{formatCurrency(aporteCesantia)}</span>
                  </div>
                )}
                {prestamoInterno > 0 && (
                  <div className="flex justify-between">
                    <span>Préstamo interno</span>
                    <span className="border-b border-black">{formatCurrency(prestamoInterno)}</span>
                  </div>
                )}
                {/* Show other descuentos from arrays */}
                {finiquitoData.descuentosItems?.filter(d => d.monto > 0 && !d.descripcion?.toLowerCase().includes('cesant') && !d.descripcion?.toLowerCase().includes('préstamo')).map((d, idx) => (
                  <div key={`auto-${idx}`} className="flex justify-between">
                    <span>{d.descripcion}</span>
                    <span>{formatCurrency(d.monto)}</span>
                  </div>
                ))}
                {finiquitoData.descuentosPersonalizados?.filter(d => parseFloat(d.monto) > 0 && !d.descripcion?.toLowerCase().includes('préstamo')).map((d, idx) => (
                  <div key={`custom-${idx}`} className="flex justify-between">
                    <span>{d.descripcion}</span>
                    <span>{formatCurrency(parseFloat(d.monto))}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold">
                  <span className="underline">TOTAL</span>
                  <span> DESCUENTOS</span>
                  <span>{formatCurrency(finiquitoData.totalDescuentos || totalDescuentos)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Legal Notes */}
          <div className="mb-4 text-justify text-[10pt]">
            <p className="mb-2">
              A estos valores se le deducirán los descuentos legales que pudieran corresponder.
            </p>
            <p>
              Comunicamos a Ud., que sus cotizaciones previsionales se encuentran al día.
            </p>
          </div>

          {/* Payment Information */}
          <div className="mb-4 text-justify">
            <p>
              El monto por concepto de remuneración fue cancelado el penúltimo día hábil del mes en curso.
            </p>
            <p>
              Finalmente, le informamos que su finiquito se encontrará disponible para su firma y pago desde el 
              viernes {formatDate(notaryDate)}, en la Notaría Alvaro González Salinas, ubicada en Avenida 
              Apoquindo #3001, piso 2, donde podrá efectuar reserva de derechos, si lo estima necesario. El 
              horario de atención es de lunes a jueves de 9:00 a 14:00 hrs. y de 15:00 a 17:00 hrs. Viernes de 9:00 
              a 16:00 hrs. Cualquier duda, le solicitamos contactar a Claudia Cisternas Flores al número 09-99996703.
            </p>
          </div>

          {/* Closing */}
          <div className="mb-8">
            <p>Sin otro particular, le saluda atentamente</p>
          </div>

          {/* Manager Signature */}
          <div className="mb-12 mt-16 text-center">
            <p className="font-bold">{selectedManager.name}</p>
            <p>{selectedManager.title}</p>
            <p>{selectedManager.company}</p>
          </div>

          {/* Worker and Inspection Signatures */}
          <div className="flex justify-between mt-16">
            <div>
              <p>------------------------</p>
              <p><strong>Firma del trabajador</strong></p>
              <p>Rut: {employeeData.rut_trabajador}</p>
            </div>
            <div className="text-right">
              <p><strong>C.C.: Inspección del Trabajo</strong></p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-16 pt-4 border-t border-gray-300 flex justify-between text-[8pt] text-gray-600">
            <div>
              <p className="font-bold text-red-800">Carlos Cramer</p>
              <p>Productos</p>
              <p>Aromáticos</p>
              <p>S.A.C.I.</p>
            </div>
            <div>
              <p>Lucerna 4925</p>
              <p>Cerrillos</p>
              <p>Santiago,</p>
              <p>Chile</p>
            </div>
            <div className="text-right">
              <p>Tel.: 56-2-2757 3700</p>
              <p>Fax: 56-2-2557 1977</p>
              <p>www.cramer.cl</p>
              <p>contacto@cramer.cl</p>
            </div>
          </div>

          <div className="text-center mt-8 text-xs text-gray-400 print:hidden">
            <p>Este documento es un borrador generado automáticamente.</p>
          </div>

        </div>
      </main>
    </div>
  );
};

export default VisualizadorFiniquito;
