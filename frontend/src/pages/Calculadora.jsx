import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import CalculadoraService from '../services/calculadora.service';

const Calculadora = () => {
  // Estado del formulario
  const [sueldoLiquido, setSueldoLiquido] = useState('');
  const [movilizacion, setMovilizacion] = useState('40000');
  const [afpSeleccionada, setAfpSeleccionada] = useState('Uno');
  const [sistemasSalud, setSistemasSalud] = useState('fonasa');
  const [planIsapreUf, setPlanIsapreUf] = useState('2.822');
  const [bonos, setBonos] = useState([]);
  
  // Estado de datos
  const [afps, setAfps] = useState([]);
  const [parametros, setParametros] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Estado para agregar bonos
  const [nuevoBono, setNuevoBono] = useState({ nombre: '', monto: '', imponible: true });

  useEffect(() => {
    cargarDatosIniciales();
  }, []);

  const cargarDatosIniciales = async () => {
    try {
      const [afpsData, paramsData] = await Promise.all([
        CalculadoraService.getAfps(),
        CalculadoraService.getParametros()
      ]);
      setAfps(afpsData);
      setParametros(paramsData);
    } catch (err) {
      console.error('Error cargando datos:', err);
    }
  };

  const formatearNumero = (valor) => {
    const numero = valor.replace(/\D/g, '');
    return numero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  const parsearNumero = (valor) => {
    return parseInt(valor.replace(/\./g, '')) || 0;
  };

  const agregarBono = () => {
    if (!nuevoBono.nombre || !nuevoBono.monto) return;
    setBonos([...bonos, {
      nombre: nuevoBono.nombre,
      monto: parsearNumero(nuevoBono.monto),
      imponible: nuevoBono.imponible
    }]);
    setNuevoBono({ nombre: '', monto: '', imponible: true });
  };

  const eliminarBono = (index) => {
    setBonos(bonos.filter((_, i) => i !== index));
  };

  const handleCalcular = async () => {
    if (!sueldoLiquido || parsearNumero(sueldoLiquido) <= 0) {
      setError('Ingresa un sueldo líquido válido');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const datos = {
        sueldo_liquido: parsearNumero(sueldoLiquido),
        movilizacion: parsearNumero(movilizacion),
        afp_nombre: afpSeleccionada,
        salud_sistema: sistemasSalud,
        salud_uf: sistemasSalud === 'isapre' ? parseFloat(planIsapreUf.replace(',', '.')) : 0,
        bonos: bonos
      };
      
      const res = await CalculadoraService.calcularSueldoBase(datos);
      setResultado(res);
    } catch (err) {
      setError('Error al calcular. Intenta nuevamente.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatoPesos = (valor) => `$ ${valor.toLocaleString('es-CL')}`;

  return (
    <div className="flex min-h-screen bg-[#f8f9fa] font-['Public_Sans']">
      <Sidebar />
      
      <main className="flex-1 ml-64 p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Calculadora de Sueldos</h1>
          <p className="text-gray-500">
            Calcula el sueldo base necesario para obtener un líquido deseado
          </p>
          {parametros && (
            <div className="mt-2 flex gap-4 text-sm">
              <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
                UF: ${parametros.valor_uf.toLocaleString('es-CL')}
              </span>
              <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full">
                Sueldo Mínimo: ${parametros.sueldo_minimo.toLocaleString('es-CL')}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Formulario */}
          <div className="space-y-6">
            {/* Datos Principales */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600">payments</span>
                Datos Principales
              </h2>
              
              {/* Sueldo Líquido */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Sueldo Líquido Deseado *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="text"
                    value={sueldoLiquido}
                    onChange={(e) => setSueldoLiquido(formatearNumero(e.target.value))}
                    className="w-full pl-8 p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="1.500.000"
                  />
                </div>
              </div>

              {/* Movilización */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Movilización
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="text"
                    value={movilizacion}
                    onChange={(e) => setMovilizacion(formatearNumero(e.target.value))}
                    className="w-full pl-8 p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* AFP */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">AFP</label>
                <select
                  value={afpSeleccionada}
                  onChange={(e) => setAfpSeleccionada(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {afps.map(afp => (
                    <option key={afp} value={afp}>{afp}</option>
                  ))}
                </select>
                {parametros && (
                  <p className="text-xs text-gray-500 mt-1">
                    Tasa: {(parametros.afps[afpSeleccionada] * 100).toFixed(2)}%
                  </p>
                )}
              </div>

              {/* Sistema Salud */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Sistema de Salud</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="fonasa"
                      checked={sistemasSalud === 'fonasa'}
                      onChange={(e) => setSistemasSalud(e.target.value)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span>Fonasa</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="isapre"
                      checked={sistemasSalud === 'isapre'}
                      onChange={(e) => setSistemasSalud(e.target.value)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span>Isapre</span>
                  </label>
                </div>
                
                {sistemasSalud === 'isapre' && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-sm text-gray-600">Plan UF:</span>
                    <input
                      type="text"
                      value={planIsapreUf}
                      onChange={(e) => setPlanIsapreUf(e.target.value)}
                      className="w-24 p-2 border border-gray-200 rounded-lg text-sm"
                    />
                    {parametros && (
                      <span className="text-xs text-gray-500">
                        (≈ ${Math.round(parseFloat(planIsapreUf.replace(',', '.')) * parametros.valor_uf).toLocaleString('es-CL')})
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Bonos */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-green-600">add_circle</span>
                Bonos
              </h2>
              
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  placeholder="Nombre"
                  value={nuevoBono.nombre}
                  onChange={(e) => setNuevoBono({...nuevoBono, nombre: e.target.value})}
                  className="flex-1 p-2 border border-gray-200 rounded-lg text-sm"
                />
                <input
                  type="text"
                  placeholder="Monto"
                  value={nuevoBono.monto}
                  onChange={(e) => setNuevoBono({...nuevoBono, monto: formatearNumero(e.target.value)})}
                  className="w-28 p-2 border border-gray-200 rounded-lg text-sm"
                />
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={nuevoBono.imponible}
                    onChange={(e) => setNuevoBono({...nuevoBono, imponible: e.target.checked})}
                    className="w-4 h-4"
                  />
                  Imp.
                </label>
                <button
                  onClick={agregarBono}
                  className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                >
                  +
                </button>
              </div>
              
              {bonos.length > 0 && (
                <div className="space-y-2">
                  {bonos.map((bono, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                      <span className="text-sm">{bono.nombre}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono">${bono.monto.toLocaleString('es-CL')}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${bono.imponible ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                          {bono.imponible ? 'IMP' : 'NO IMP'}
                        </span>
                        <button onClick={() => eliminarBono(idx)} className="text-red-500 hover:text-red-700">
                          <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Botón Calcular */}
            <button
              onClick={handleCalcular}
              disabled={loading}
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Calculando...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">calculate</span>
                  CALCULAR SUELDO BASE
                </>
              )}
            </button>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Resultados */}
          <div>
            {resultado ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden sticky top-8">
                {/* Header Resultado */}
                <div className="bg-gradient-to-r from-green-600 to-green-500 p-6 text-white">
                  <p className="text-sm opacity-80 mb-1">SUELDO BASE CALCULADO</p>
                  <p className="text-4xl font-bold">{formatoPesos(resultado.sueldo_base)}</p>
                </div>

                <div className="p-6 space-y-4">
                  {/* Haberes */}
                  <div>
                    <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined text-green-600 text-lg">add_box</span>
                      Haberes
                    </h3>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Sueldo Base</span>
                        <span className="font-mono">{formatoPesos(resultado.sueldo_base)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Gratificación</span>
                        <span className="font-mono">{formatoPesos(resultado.gratificacion)}</span>
                      </div>
                      {resultado.bonos_imponibles > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Bonos Imponibles</span>
                          <span className="font-mono">{formatoPesos(resultado.bonos_imponibles)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-blue-700 font-semibold pt-1 border-t">
                        <span>Total Imponible</span>
                        <span className="font-mono">{formatoPesos(resultado.imponible)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Movilización</span>
                        <span className="font-mono">{formatoPesos(resultado.movilizacion)}</span>
                      </div>
                      {resultado.bonos_no_imponibles > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Bonos No Imponibles</span>
                          <span className="font-mono">{formatoPesos(resultado.bonos_no_imponibles)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold pt-1 border-t">
                        <span>TOTAL HABERES</span>
                        <span className="font-mono text-green-700">{formatoPesos(resultado.total_haberes)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Descuentos */}
                  <div>
                    <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined text-red-600 text-lg">remove_circle</span>
                      Descuentos
                    </h3>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">AFP</span>
                        <span className="font-mono text-red-600">-{formatoPesos(resultado.cotizacion_previsional)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Salud</span>
                        <span className="font-mono text-red-600">-{formatoPesos(resultado.cotizacion_salud)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Cesantía</span>
                        <span className="font-mono text-red-600">-{formatoPesos(resultado.cesantia)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Impuesto Único</span>
                        <span className="font-mono text-red-600">-{formatoPesos(resultado.impuesto)}</span>
                      </div>
                      <div className="flex justify-between font-bold pt-1 border-t">
                        <span>TOTAL DESCUENTOS</span>
                        <span className="font-mono text-red-700">-{formatoPesos(resultado.total_descuentos)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Resultado Final */}
                  <div className="bg-gray-900 text-white p-4 rounded-xl">
                    <div className="flex justify-between items-center">
                      <span className="font-bold">SUELDO LÍQUIDO</span>
                      <span className="text-2xl font-bold">{formatoPesos(resultado.sueldo_liquido)}</span>
                    </div>
                    {resultado.diferencia !== 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        Diferencia por redondeo: {resultado.diferencia > 0 ? '+' : ''}{formatoPesos(resultado.diferencia)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
                <span className="material-symbols-outlined text-6xl text-gray-300 mb-4">calculate</span>
                <h3 className="text-xl font-bold text-gray-400 mb-2">Sin resultados</h3>
                <p className="text-gray-400">Ingresa los datos y presiona calcular</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Calculadora;