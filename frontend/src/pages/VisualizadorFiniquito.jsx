import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import FiniquitosService from '../services/finiquitos.service';
import Sidebar from '../components/Sidebar';

const VisualizadorFiniquito = () => {
  const { rut } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [employeeData, setEmployeeData] = useState(null);
  const [items, setItems] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch employee details and settlement items
        // Assuming getItemsByRut returns an array of items or an object with details
        const data = await FiniquitosService.getItemsByRut(rut);
        
        // Based on the service check, it returns a list. 
        // We might need to process this if it returns multiple rows for one employee
        // or if it returns a single object.
        // Let's assume for now it returns an array where the first item has the employee details
        // or it's a list of items.
        
        if (Array.isArray(data) && data.length > 0) {
            // If it's a list of items, we extract common employee data from the first one
            // and use the list for the breakdown
            setEmployeeData(data[0]); 
            setItems(data);
        } else if (data && !Array.isArray(data)) {
            setEmployeeData(data);
            setItems([data]); // Treat as single item if object
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

  // Calculate totals
  const totalHaberes = items.reduce((sum, item) => sum + (item.monto_haber || 0), 0);
  const totalDescuentos = items.reduce((sum, item) => sum + (item.monto_descuento || 0), 0);
  const saldoLiquido = totalHaberes - totalDescuentos;

  return (
    <div className="flex min-h-screen bg-[#525659] font-['Public_Sans'] print:bg-white">
      <div className="print:hidden fixed left-0 top-0 h-full z-10">
        <Sidebar />
      </div>

      <main className="flex-1 ml-64 p-8 print:ml-0 print:p-0 flex justify-center">
        <div className="w-full max-w-[210mm] bg-white shadow-lg p-[20mm] min-h-[297mm] print:shadow-none print:w-full">
          
          {/* Actions Bar (Hidden on Print) */}
          <div className="flex justify-between items-center mb-8 print:hidden border-b pb-4">
            <button 
              onClick={() => navigate('/finiquitos')}
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

          {/* Document Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold uppercase underline mb-2">Finiquito de Contrato de Trabajo</h1>
            <p className="text-sm text-gray-500">Documento Legal</p>
          </div>

          {/* Employee Details */}
          <div className="mb-8 text-sm leading-relaxed text-justify">
            <p className="mb-4">
              En Santiago, a <strong>{new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>, entre <strong>CARLOS CRAMER PRODUCTOS AROMÁTICOS S.A. C.I</strong>, RUT <strong>92.845.000-7</strong>, representada por don(a) <strong>MIGUEL ANDRES BERNDT BRICEÑO</strong>, cédula nacional de identidad <strong>7.811.480-0</strong>, ambos con domicilio para estos efectos en esta ciudad, en calle LUCERNA N°4925, en adelante el "EX EMPLEADOR", y don(a) <strong>{employeeData.nombre_trabajador}</strong>, RUT <strong>{employeeData.rut_trabajador}</strong> en adelante el "EX TRABAJADOR", se ha acordado y deja testimonio del siguiente finiquito y transacción:
            </p>
            
            <div className="grid grid-cols-2 gap-4 mb-4 bg-gray-50 p-4 rounded border border-gray-200">
              <div>
                <span className="font-bold block text-xs text-gray-500 uppercase">Cargo</span>
                <span>{employeeData.cargo}</span>
              </div>
              <div>
                <span className="font-bold block text-xs text-gray-500 uppercase">Fecha Ingreso</span>
                <span>{employeeData.fecha_ingreso}</span>
              </div>
              <div>
                <span className="font-bold block text-xs text-gray-500 uppercase">Fecha Salida</span>
                <span>{employeeData.fecha_salida || new Date().toISOString().split('T')[0]}</span>
              </div>
              <div>
                <span className="font-bold block text-xs text-gray-500 uppercase">Causal</span>
                <span>{employeeData.causal || 'Art. 161 Necesidades de la empresa'}</span>
              </div>
            </div>
          </div>

          {/* Settlement Details Table */}
          <div className="mb-8">
            <h2 className="font-bold text-lg mb-4 border-b pb-2">Detalle de Haberes e Indemnizaciones</h2>
            <table className="w-full text-sm border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-2 text-left">Concepto</th>
                  <th className="border border-gray-300 p-2 text-right w-32">Monto</th>
                </tr>
              </thead>
              <tbody>
                {/* Example Items - Replace with actual items from API if available individually */}
                <tr>
                  <td className="border border-gray-300 p-2">Indemnización por años de servicio</td>
                  <td className="border border-gray-300 p-2 text-right">$ {employeeData.indemnizacion_anos_servicio?.toLocaleString('es-CL') || '0'}</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 p-2">Indemnización sustitutiva del aviso previo</td>
                  <td className="border border-gray-300 p-2 text-right">$ {employeeData.indemnizacion_aviso_previo?.toLocaleString('es-CL') || '0'}</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 p-2">Feriado proporcional</td>
                  <td className="border border-gray-300 p-2 text-right">$ {employeeData.feriado_proporcional?.toLocaleString('es-CL') || '0'}</td>
                </tr>
                {/* Dynamic items if any */}
                {items.filter(i => i.tipo === 'haber').map((item, idx) => (
                   <tr key={idx}>
                    <td className="border border-gray-300 p-2">{item.descripcion}</td>
                    <td className="border border-gray-300 p-2 text-right">$ {item.monto?.toLocaleString('es-CL')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold">
                  <td className="border border-gray-300 p-2 text-right">TOTAL A PAGAR</td>
                  <td className="border border-gray-300 p-2 text-right">$ {(
                    (employeeData.indemnizacion_anos_servicio || 0) + 
                    (employeeData.indemnizacion_aviso_previo || 0) + 
                    (employeeData.feriado_proporcional || 0)
                  ).toLocaleString('es-CL')}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Legal Text */}
          <div className="mb-12 text-sm text-justify leading-relaxed">
            <p className="mb-4">
              El trabajador declara recibir en este acto, a su entera satisfacción, la suma total indicada anteriormente.
            </p>
            <p>
              El trabajador otorga al empleador el más amplio y completo finiquito, declarando no tener cargo ni cobro alguno que formular por concepto de remuneraciones, horas extraordinarias, feriado legal, indemnizaciones, cotizaciones previsionales o cualquier otro concepto derivado de la prestación de sus servicios o de la terminación de los mismos.
            </p>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-16 mt-24">
            <div className="text-center">
              <div className="border-t border-black w-4/5 mx-auto mb-2"></div>
              <p className="font-bold">P.P. EMPLEADOR</p>
              <p className="text-xs">RUT: [RUT EMPRESA]</p>
            </div>
            <div className="text-center">
              <div className="border-t border-black w-4/5 mx-auto mb-2"></div>
              <p className="font-bold">{employeeData.nombre_trabajador}</p>
              <p className="text-xs">RUT: {employeeData.rut_trabajador}</p>
            </div>
          </div>

          <div className="text-center mt-12 text-xs text-gray-400 print:hidden">
            <p>Este documento es un borrador generado automáticamente.</p>
          </div>

        </div>
      </main>
    </div>
  );
};

export default VisualizadorFiniquito;
