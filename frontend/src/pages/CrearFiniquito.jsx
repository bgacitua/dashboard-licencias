import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import FiniquitosService from '../services/finiquitos.service';
import EmployeesService from '../services/employees.service';

const CrearFiniquito = () => {
  const { rut } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState(null);
  
  // Form State
  const [terminationReason, setTerminationReason] = useState("");
  const [lastDayWork, setLastDayWork] = useState("");
  const [noticeGiven, setNoticeGiven] = useState(false);
  const [vacationDays, setVacationDays] = useState(0);
  const [vacationValue, setVacationValue] = useState(0);
  const [salary, setSalary] = useState(0);
  const [variableBonus, setVariableBonus] = useState(0);
  const [yearsOfService, setYearsOfService] = useState(0);
  const [yearsForIndemnity, setYearsForIndemnity] = useState(0);
  const [movilizacion, setMovilizacion] = useState(40000);
  const [descuentos, setDescuentos] = useState(0);
  
  // Items for calculation
  const [items, setItems] = useState([]);
  const [variableItems, setVariableItems] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await FiniquitosService.getItemsByRut(rut);
        if (Array.isArray(data) && data.length > 0) {
          const empData = data[0];
          setEmployee(empData);
          setItems(data);
          
 
          
          // Fetch vacation days from external API
          try {
            const vacationData = await EmployeesService.getVacationsAvailable(rut);
            setVacationDays(vacationData.total_dias_disponibles);
          } catch (err) {
            console.error("Error fetching vacation days:", err);
            setVacationDays(0);
          }

          // Fetch base wage from external API
          try {
            const sueldoData = await EmployeesService.getSueldoBase(rut);
            if (sueldoData && sueldoData.base_wage) {
                 setSalary(sueldoData.base_wage);
            } else {
                 // Fallback if base_wage is null or 0
                 const baseSalaryItem = data.find(i => i.concepto === 'Sueldo Base')?.monto || 0;
                 setSalary(baseSalaryItem > 0 ? baseSalaryItem : 2050000);
            }
          } catch (err) {
            console.error("Error fetching base wage:", err);
             // Fallback on error
             const baseSalaryItem = data.find(i => i.concepto === 'Sueldo Base')?.monto || 0; 
             setSalary(baseSalaryItem > 0 ? baseSalaryItem : 2050000); 
          }

          setVacationValue(850000); 
          
          // Filter variable bonuses from the same dataset
          const varData = data.filter(item => item.income_type === 'remuneracion_variable');
          
          if (varData.length > 0) {
             const mappedVarData = varData.map(item => ({
               ...item,
               active: true 
             }));
             setVariableItems(mappedVarData);
             
             // Group by concepto, average each group, then sum the averages
             const grouped = mappedVarData.reduce((acc, item) => {
               const key = item.concepto || 'Sin Concepto';
               if (!acc[key]) acc[key] = [];
               acc[key].push(item.monto || 0);
               return acc;
             }, {});
             
             const sumOfAverages = Object.values(grouped).reduce((total, values) => {
               const avg = values.reduce((a, b) => a + b, 0) / values.length;
               return total + avg;
             }, 0);
             
             setVariableBonus(Math.round(sumOfAverages));
          } else {
              setVariableItems([]);
              setVariableBonus(0);
          }
        }
      } catch (error) {
        console.error("Error fetching employee data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (rut) {
      fetchData();
    }
  }, [rut]);

  // Helper function: Check if a date is a business day (Monday-Friday)
  const isBusinessDay = (date) => {
    const day = date.getDay();
    return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
  };

  // Helper function: Get next business day
  const getNextBusinessDay = (date) => {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    while (!isBusinessDay(nextDay)) {
      nextDay.setDate(nextDay.getDate() + 1);
    }
    return nextDay;
  };

  // Helper function: Calculate "días corridos" (calendar days) from available vacation days
  // Starting from the day after lastDayWork, count business days until we reach vacationDays,
  // then return total calendar days (including weekends within the period)
  // IMPORTANT: Preserves decimal portion of vacation days (e.g., 13.75 → 19.75 días corridos)
  const calculateDiasCorridos = (startDate, availableDays) => {
    if (!startDate || availableDays <= 0) return 0;
    
    // Separate integer and decimal parts
    const integerDays = Math.floor(availableDays);
    const decimalDays = availableDays - integerDays;
    
    // If there are no integer days, just return the decimal portion
    if (integerDays === 0) return decimalDays;
    
    // Start counting from the day after lastDayWork
    let currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() + 1); // Fecha de salida + 1
    
    const periodStartDate = new Date(currentDate);
    let businessDaysCount = 0;
    
    // Count business days until we reach the integer target
    while (businessDaysCount < integerDays) {
      if (isBusinessDay(currentDate)) {
        businessDaysCount++;
      }
      if (businessDaysCount < integerDays) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
    
    // Calculate total calendar days (días corridos) for integer portion
    const timeDiff = currentDate.getTime() - periodStartDate.getTime();
    const diasCorridosEnteros = Math.floor(timeDiff / (1000 * 60 * 60 * 24)) + 1;
    
    // Always add the decimal days directly to the calendar days
    // Example: 13 business days → 19 calendar days, + 0.75 = 19.75 días corridos
    return diasCorridosEnteros + decimalDays;
  };

  // Auto-calculate Vacation Value
  // Formula: (Sueldo Base + Promedio Bonos / 30) * Días corridos
  useEffect(() => {
    if (salary > 0 && vacationDays >= 0) {
      // Calculate daily rate: (Base Salary + Average Bonus) / 30
      const dailyRate = (salary + variableBonus) / 30;
      
      // Calculate días corridos based on lastDayWork and vacation days
      let diasCorridos = vacationDays; // Default to vacation days if no date selected
      
      if (lastDayWork) {
        diasCorridos = calculateDiasCorridos(new Date(lastDayWork), vacationDays);
      }
      
      setVacationValue(Math.round(dailyRate * diasCorridos));
    }
  }, [salary, vacationDays, variableBonus, lastDayWork]);

  // Auto-calculate Years of Service and Indemnity
  useEffect(() => {
    if (employee?.fecha_ingreso && lastDayWork) {
      const start = new Date(employee.fecha_ingreso);
      const end = new Date(lastDayWork);
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
        // Calculate difference in milliseconds
        const diffTime = Math.abs(end - start);
        // Convert to years (approximate)
        const years = diffTime / (1000 * 60 * 60 * 24 * 365.25);
        setYearsOfService(years);

        // Calculate Indemnity Years (Chilean Law: > 6 months rounds up)
        // We can use a more precise month diff if needed, but this is a good approximation
        // Logic: Full years + (remainder >= 0.5 ? 1 : 0)
        const fullYears = Math.floor(years);
        const remainder = years - fullYears;
        const indemnityYears = remainder >= 0.5 ? fullYears + 1 : fullYears;
        setYearsForIndemnity(indemnityYears);
      }
    } else if (employee?.duracion_empresa) {
        // Fallback to initial value if no date selected yet
        setYearsOfService(employee.duracion_empresa);
        setYearsForIndemnity(Math.floor(employee.duracion_empresa));
    }
  }, [lastDayWork, employee]);

  const handleGenerate = async () => {
    try {
        // Here we would send the data to the backend to save/update the finiquito
        // For now, we just navigate to the visualizer
        // await FiniquitosService.updateFiniquito(rut, { ...data });
        
        navigate(`/finiquitos/visualizar/${rut}`);
    } catch (error) {
        console.error("Error generating document:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-[#f8f9fa] items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!employee) {
    return <div className="p-8">Employee not found</div>;
  }

  // Calculations
  // yearsOfService and yearsForIndemnity are now state variables
  const dailySalary = (salary / 30).toFixed(0);
  
  // Gratificación Legal = (Sueldo Base + Promedio Bonificaciones) * 25% (tope $213.000)
  const topeGratificacion = 213000;
  const gratificacionLegal = Math.min((salary + variableBonus) * 0.25, topeGratificacion);
  
  // Total Haberes = Sueldo Base + Promedio Bonificaciones + Gratificación Legal + Movilización
  const totalHaberes = salary + variableBonus + gratificacionLegal + movilizacion;
  
  const vacationIndemnity = vacationValue;
  const yearsIndemnity = yearsForIndemnity * salary; // Simplified
  const noticeIndemnity = noticeGiven ? 0 : salary; // If notice not given, pay 1 month
  
  // Total Settlement = Vacation + Years Indemnity + Notice + Variable Bonus + Gratificación + Movilización - Descuentos
  const totalSettlement = vacationIndemnity + yearsIndemnity + noticeIndemnity + variableBonus + gratificacionLegal + movilizacion - descuentos;

  return (
    <div className="flex min-h-screen bg-[#f8f9fa] font-['Public_Sans']">
      <Sidebar />
      
      <main className="flex-1 ml-64 p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <span className="cursor-pointer hover:text-blue-600" onClick={() => navigate('/finiquitos')}>Home</span>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span>Employees</span>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span>{employee.nombre_trabajador}</span>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span className="font-semibold text-gray-900">Generate Severance</span>
          </div>
          
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Generate Severance Document</h1>
              <p className="text-gray-500 mt-1">Draft a new finiquito for review and legal processing.</p>
            </div>
            <div className="bg-orange-50 text-orange-700 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 border border-orange-100">
              <span className="material-symbols-outlined text-lg">warning</span>
              Pending Approval
            </div>
          </div>
        </div>

        {/* Employee Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xl font-bold">
               {employee.nombre_trabajador.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{employee.nombre_trabajador}</h2>
              <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                <span className="font-mono">RUT: {employee.rut_trabajador}</span>
                <span>•</span>
                <span className="text-blue-600 font-medium">{employee.cargo}</span>
                <span>•</span>
                <span>{employee.nombre_area || 'Engineering Dept'}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">START DATE</p>
            <p className="font-semibold text-gray-900">{new Date(employee.fecha_ingreso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </div>

        {/* Termination Details */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <span className="material-symbols-outlined">gavel</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900">Termination Details</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Reason for Termination <span className="text-red-500">*</span>
              </label>
              <select 
                className="w-full p-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                value={terminationReason}
                onChange={(e) => setTerminationReason(e.target.value)}
              >
                <option value="">Select a legal cause...</option>
                <option value="Art. 161">Art. 161 - Necesidades de la empresa</option>
                <option value="Art. 159">Art. 159 - Renuncia voluntaria</option>
                <option value="Art. 160">Art. 160 - Despido disciplinario</option>
              </select>
              <p className="text-xs text-gray-400 mt-2">This selection determines the calculation basis for indemnity.</p>
            </div>

            <div className="flex gap-6">
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Last Day of Work <span className="text-red-500">*</span>
                </label>
                <input 
                  type="date" 
                  className="w-full p-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={lastDayWork}
                  onChange={(e) => setLastDayWork(e.target.value)}
                />
              </div>
              <div className="flex items-center pt-8">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    checked={noticeGiven}
                    onChange={(e) => setNoticeGiven(e.target.checked)}
                  />
                  <div>
                    <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">30-Day Notice Given</p>
                    <p className="text-xs text-gray-400">If unchecked, "Mes de Aviso" indemnity will be added.</p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Review Variable Bonuses (Collapsed for now or simplified) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
            <div className="flex justify-between items-center cursor-pointer">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <span className="material-symbols-outlined">payments</span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">Review Variable Bonuses</h3>
                </div>
                <span className="material-symbols-outlined text-gray-400">expand_less</span>
            </div>
            <div className="mt-6 space-y-4">
                <p className="text-sm text-gray-500 mb-4">Select the bonuses from the last months to be included in the average calculation.</p>
                {variableItems.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
                        <span className="material-symbols-outlined text-gray-300 text-4xl mb-2">money_off</span>
                        <p className="text-gray-500 font-medium">No variable remuneration found</p>
                        <p className="text-xs text-gray-400">This employee does not have variable bonuses in the records.</p>
                    </div>
                ) : (
                    variableItems.map((bonus, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
                        <div>
                            <p className="font-bold text-gray-900">{bonus.periodo}</p>
                            <p className="text-xs text-gray-500">{bonus.concepto}</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="font-mono font-medium">$ {(bonus.monto || 0).toLocaleString('es-CL')}</span>
                            <div 
                                className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${bonus.active ? 'bg-blue-600' : 'bg-gray-300'}`}
                                onClick={() => {
                                    const newItems = [...variableItems];
                                    newItems[idx].active = !newItems[idx].active;
                                    setVariableItems(newItems);
                                    
                                    // Recalculate: group by concepto, average each group, sum averages
                                    const activeItems = newItems.filter(i => i.active);
                                    const grouped = activeItems.reduce((acc, item) => {
                                      const key = item.concepto || 'Sin Concepto';
                                      if (!acc[key]) acc[key] = [];
                                      acc[key].push(item.monto || 0);
                                      return acc;
                                    }, {});
                                    
                                    const sumOfAverages = Object.values(grouped).reduce((total, values) => {
                                      const avg = values.reduce((a, b) => a + b, 0) / values.length;
                                      return total + avg;
                                    }, 0);
                                    
                                    setVariableBonus(Math.round(sumOfAverages));
                                }}
                            >
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${bonus.active ? 'translate-x-6' : ''}`}></div>
                            </div>
                        </div>
                    </div>
                )))}
            </div>
        </div>

        {/* Compensation & Vacation */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
             <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                    <span className="material-symbols-outlined">beach_access</span>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Compensation & Vacation</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                    <div className="flex justify-between mb-2">
                        <label className="text-sm font-semibold text-gray-700">Pending Vacation Days</label>
                        <button className="text-xs text-blue-600 font-medium hover:underline">View balance history</button>
                    </div>
                    <div className="relative">
                        <input 
                            type="number" 
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-500 cursor-not-allowed"
                            value={vacationDays}
                            readOnly
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">Days</span>
                    </div>
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[10px]">check_circle</span>
                        Auto-fetched from Buk
                    </p>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Vacation Value (Estimated)</label>
                    <div className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-mono">
                        $ {vacationValue.toLocaleString('es-CL')}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                 <div>
                    <label className="block text-sm font-semibold text-blue-600 mb-2">Outstanding Salary (Editable)</label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-600 font-bold">$</span>
                        <input 
                            type="number" 
                            className="w-full pl-8 p-3 bg-blue-50 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-900"
                            value={salary}
                            onChange={(e) => setSalary(parseFloat(e.target.value))}
                        />
                    </div>
                </div>
                 <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Calculated Variable Bonuses (Avg.)</label>
                    <div className="flex items-center gap-2">
                        <div className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-mono">
                            $ {variableBonus.toLocaleString('es-CL')}
                        </div>
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-bold uppercase rounded tracking-wider">Auto-Calculated</span>
                    </div>
                </div>
            </div>
            
            <button className="mt-6 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                <span className="material-symbols-outlined text-lg">add_circle</span>
                Add Other Adjustments
            </button>
        </div>

        {/* Indemnity Calculations */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
            <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                    <span className="material-symbols-outlined">calculate</span>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Indemnity Calculations</h3>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">YEARS OF SERVICE</p>
                    <p className="text-xl font-bold text-gray-900">{yearsOfService.toFixed(1)} Years</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">YEARS FOR INDEMNITY</p>
                    <p className="text-xl font-bold text-gray-900">{yearsForIndemnity}</p>
                    <p className="text-xs text-gray-400 mt-1">Rounded up &gt; 6 months</p>
                </div>
                 <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">DAILY SALARY BASE</p>
                    <p className="text-xl font-bold text-gray-900">$ {dailySalary}</p>
                </div>
            </div>

            <div className="space-y-3 border-t border-gray-100 pt-6">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600 font-medium">Total Haberes</span>
                    <span className="font-mono font-medium">$ {totalHaberes.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Gratificación Legal</span>
                    <span className="font-mono font-medium">$ {Math.round(gratificacionLegal).toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                    <span className="text-gray-600">Movilización</span>
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400">$</span>
                        <input 
                            type="number" 
                            className="w-28 p-1 text-right bg-white border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                            value={movilizacion}
                            onChange={(e) => setMovilizacion(parseFloat(e.target.value) || 0)}
                        />
                    </div>
                </div>
                <div className="border-t border-gray-100 my-2"></div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Vacation Indemnity</span>
                    <span className="font-mono font-medium">$ {vacationIndemnity.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Years of Service Indemnity ({yearsForIndemnity} years)</span>
                    <span className="font-mono font-medium">$ {yearsIndemnity.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Notice Month (Mes de Aviso)</span>
                    <span className="font-mono font-medium">$ {noticeIndemnity.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-blue-600 font-medium">Variable Bonus Average Adjustment</span>
                    <span className="font-mono font-bold text-blue-600">$ {variableBonus.toLocaleString('es-CL')}</span>
                </div>
                <div className="border-t border-gray-100 my-2"></div>
                <div className="flex justify-between text-sm items-center">
                    <span className="text-red-600 font-medium">Descuentos</span>
                    <div className="flex items-center gap-2">
                        <span className="text-red-400">- $</span>
                        <input 
                            type="number" 
                            className="w-28 p-1 text-right bg-red-50 border border-red-200 rounded focus:ring-2 focus:ring-red-500 outline-none font-mono text-red-700"
                            value={descuentos}
                            onChange={(e) => setDescuentos(parseFloat(e.target.value) || 0)}
                        />
                    </div>
                </div>
            </div>

            <div className="mt-6 bg-gray-900 text-white p-6 rounded-xl flex justify-between items-center shadow-lg">
                <div>
                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">TOTAL SETTLEMENT</p>
                    <p className="text-xs text-gray-500">Subject to final review and deductions</p>
                </div>
                <p className="text-3xl font-bold font-mono">$ {totalSettlement.toLocaleString('es-CL')}</p>
            </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 pb-12">
            <button 
                onClick={() => navigate('/finiquitos')}
                className="px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
                CANCEL
            </button>
            <button 
                onClick={handleGenerate}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md flex items-center gap-2"
            >
                <span className="material-symbols-outlined">description</span>
                GENERATE DOCUMENT
            </button>
        </div>

      </main>
    </div>
  );
};

export default CrearFiniquito;
