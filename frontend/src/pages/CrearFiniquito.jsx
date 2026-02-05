import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import FiniquitosService from '../services/finiquitos.service';
import EmployeesService from '../services/employees.service';
import { getLicenciasByRut } from '../services/licencias';

const CrearFiniquito = () => {
  const { rut } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState(null);
  
  // Form State
  const [terminationReason, setTerminationReason] = useState("");
  const [lastDayWork, setLastDayWork] = useState("");
  const [noticeGiven, setNoticeGiven] = useState(false);
  const [vacationDays, setVacationDays] = useState(0);
  const [vacationDaysStock, setVacationDaysStock] = useState(0); // Original API value
  const [vacationDaysManuallyEdited, setVacationDaysManuallyEdited] = useState(false);
  const [vacationValue, setVacationValue] = useState(0);
  const [salary, setSalary] = useState(0);
  const [variableBonus, setVariableBonus] = useState(0);
  const [yearsOfService, setYearsOfService] = useState(0);
  const [yearsForIndemnity, setYearsForIndemnity] = useState(0);
  const [movilizacion, setMovilizacion] = useState(40000);
  const [liquidacionMesActual, setLiquidacionMesActual] = useState(0);
  const [descuentos, setDescuentos] = useState('');
  const [selectedManager, setSelectedManager] = useState('');
  
  // Manager options
  const managers = [
    { id: 'jcarcamo', name: 'Juan Heriberto Cárcamo Catalan', title: 'Gerente de Producción y Logística', company: 'Carlos Cramer Productos Aromáticos S.A.C.I.' },
    { id: 'mberndt', name: 'Miguel Andres Berndt Briceño', title: 'Gerente General', company: 'Carlos Cramer Productos Aromáticos S.A.C.I.' },
    { id: 'dmisraji', name: 'Deborah Lissete Misraji Vaizer', title: 'Gerente de Personas y SSGG', company: 'Carlos Cramer Productos Aromáticos S.A.C.I.' },
    { id: 'ccisternas', name: 'Claudia Cisternas Flores', title: 'Líder de Administración de Personal', company: 'Carlos Cramer Productos Aromáticos S.A.C.I.' },
  ];
  
  // Items for calculation
  const [items, setItems] = useState([]);
  const [licencias, setLicencias] = useState([]);
  const [variableItems, setVariableItems] = useState([]);
  const [descuentosItems, setDescuentosItems] = useState([]); // Automatic deductions from backend
  const [descuentosPersonalizados, setDescuentosPersonalizados] = useState([]); // Custom added discounts
  const [variableCustomAdditions, setVariableCustomAdditions] = useState({}); // Custom manual additions for variable bonus: { [concepto]: [{ id, descripcion, amount, active }] }
  const [newCustomItems, setNewCustomItems] = useState({}); // Temporary state for new manual item inputs per concept: { [concepto]: { description: '', amount: '' } }
  const [ufValue, setUfValue] = useState(0); // Valor UF del día
  const [isLoadingUf, setIsLoadingUf] = useState(false);
  const [isLoadingVacation, setIsLoadingVacation] = useState(false); // Loading state for vacation days API

  // Helper to recalculate total variable bonus based on current items and custom additions
  const calculateTotalVariableBonus = (currentItems, currentCustomAdditions) => {
    // 1. Group fetched items by concept
    const groups = currentItems.reduce((acc, item, idx) => {
      const key = item.concepto || 'Sin Concepto';
      if (!acc[key]) acc[key] = [];
      acc[key].push({ ...item, type: 'fetched', originalIndex: idx });
      return acc;
    }, {});

    // 2. Merge with custom additions
    if (currentCustomAdditions) {
      Object.keys(currentCustomAdditions).forEach(key => {
        if (!groups[key]) groups[key] = [];
        const additions = currentCustomAdditions[key] || [];
        // Add custom items to the group
        additions.forEach((item, idx) => {
            groups[key].push({ 
                ...item, 
                concepto: key, 
                type: 'custom', 
                originalIndex: idx 
            });
        });
      });
    }

    // 3. Calculate average for each group and sum them up
    // Rule: Average = Sum of ACTIVE items / Count of ACTIVE items
    // If no active items in a group, average is 0.
    const sumOfAverages = Object.values(groups).reduce((total, groupItems) => {
      const activeItems = groupItems.filter(i => i.active !== false); // Default true if undefined
      if (activeItems.length === 0) return total;
      
      const groupSum = activeItems.reduce((sum, item) => sum + (parseFloat(item.monto) || 0), 0);
      const groupAvg = groupSum / activeItems.length;
      
      return total + groupAvg;
    }, 0);

    return Math.round(sumOfAverages);
  };

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
            const rawDays = vacationData.total_dias_disponibles || 0;
            // Store raw value without rounding - rounding only for display
            setVacationDaysStock(rawDays);
            setVacationDays(rawDays);
          } catch (err) {
            console.error("Error fetching vacation days:", err);
            setVacationDaysStock(0);
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

          setVacationValue(0); 
          
          // Filter variable bonuses from the same dataset
          // Include both 'remuneracion_variable' and 'remuneracion_ocasional'
          // But exclude specific occasional bonuses that should not be averaged
          const excludedConceptos = ['Bono Empresa', 'Bono Navidad', 'Bono Fiestas Patrias'];
          const varData = data.filter(item => 
            item.income_type === 'remuneracion_variable' || 
            (item.income_type === 'remuneracion_ocasional' && !excludedConceptos.includes(item.concepto)) ||
            (item.income_type === 'remuneracion_fija' && item.concepto === 'Bono Supervisores Noche')
          );
          
          if (varData.length > 0) {
             const mappedVarData = varData.map((item, idx) => ({
               ...item,
               active: true,
               originalIndex: idx
             }));
             setVariableItems(mappedVarData);
             
             // Initial calculation using the helper
             const total = calculateTotalVariableBonus(mappedVarData, {});
             setVariableBonus(total);
          } else {
              setVariableItems([]);
              setVariableBonus(0);
          }
        }
          try {
            const employeeLicencias = await getLicenciasByRut(rut);
            // Sort by fecha_fin descending (most recent first) and take last 5
            const sortedLicencias = employeeLicencias.sort(
              (a, b) => new Date(b.fecha_fin) - new Date(a.fecha_fin)
            ).slice(0, 5);
            setLicencias(sortedLicencias);
          } catch (err) {
            console.error("Error fetching licenses:", err);
            setLicencias([]);
          }
          
          // Fetch automatic deductions for this employee (Prestamo Interno, Descuento Por Planilla)
          try {
            // First fetch UF in parallel or before
            let currentUF = 0;
            try {
                currentUF = await FiniquitosService.getIndicatorUF();
                setUfValue(currentUF);
            } catch (ufErr) {
                console.error("Error fetching UF:", ufErr);
            }

            const descuentosData = await FiniquitosService.getDescuentosByRut(rut);
            
            // Map backend data (concepto) to frontend format (descripcion)
            // Normalize strings to match frontend dropdown options
            if (!location.state?.preserveData) {
              const mappedDescuentos = (descuentosData || []).map(item => {
                let desc = item.concepto || '';
                // Normalize backend strings to match frontend options exact spelling/casing
                if (desc === 'Prestamo Interno') desc = 'Préstamo Interno'; // Add accent
                if (desc === 'Descuento Por Planilla') desc = 'Descuento por planilla'; // Lowercase 'p'
                
                
                return {
                  descripcion: desc, 
                  detalle: item.detalle || '', // Map detailed description
                  monto: item.monto || 0,
                  cuotas: 1 // Default cuotas
                };
              });
              setDescuentosPersonalizados(mappedDescuentos);
            }
            
            // Keep legacy state empty as we moved to normalized list
            setDescuentosItems([]);
          } catch (err) {
            console.error("Error fetching deductions:", err);
            if (!location.state?.preserveData) {
               setDescuentosPersonalizados([]);
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

  // Restaurar datos del formulario cuando se navega de vuelta desde el visualizador
  useEffect(() => {
    if (location.state?.preserveData) {
      const savedData = sessionStorage.getItem(`finiquito_${rut}`);
      if (savedData) {
        const data = JSON.parse(savedData);
        // Restaurar valores del formulario
        if (data.lastDayWork) setLastDayWork(data.lastDayWork);
        if (data.terminationReason) setTerminationReason(data.terminationReason);
        if (data.noticeGiven !== undefined) setNoticeGiven(data.noticeGiven);
        if (data.selectedManager?.id) setSelectedManager(data.selectedManager.id);
        if (data.vacationDays) setVacationDays(data.vacationDays);
        if (data.yearsForIndemnity) setYearsForIndemnity(data.yearsForIndemnity);
        // Restaurar descuentos personalizados si existen
        if (data.descuentosPersonalizados) setDescuentosPersonalizados(data.descuentosPersonalizados);
        if (data.ufValue) setUfValue(data.ufValue); // Restore stored UF
        console.log('Datos del formulario restaurados desde sessionStorage');
      }
    }
  }, [location.state, rut]);

  // Helper function: Parse date string as local date (avoids UTC timezone issues)
  // When parsing "2026-02-02", JS interprets as UTC midnight, which becomes previous day in local time
  const parseLocalDate = (dateString) => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed
  };

  // Helper function: Custom rounding for vacation days
  // Rounds up from 0.45 decimal (instead of standard 0.5)
  // Returns value with 1 decimal place
  const customRoundVacation = (value) => {
    const integerPart = Math.floor(value);
    const decimalPart = value - integerPart;
    
    // If decimal >= 0.45, round up to next integer
    if (decimalPart >= 0.45) {
      return integerPart + 1;
    }
    // Otherwise, keep 1 decimal place
    return Math.round(value * 10) / 10;
  };

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
  // Rules:
  // 1. Start counting from termination date + 1 (regardless of weekend)
  // 2. Vacation days are counted as business days
  // 3. Weekend days between termination and first business day are included in total
  // 4. If decimal > 0.2 AND last day is Friday or next day is non-business,
  //    extend to next business day and add those non-business days
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
    
    // This is the TRUE start date (could be a weekend day)
    const trueStartDate = new Date(currentDate);
    
    // Count non-business days BEFORE the first business day (these will be added to total)
    let diasInhabilesInicio = 0;
    while (!isBusinessDay(currentDate)) {
      diasInhabilesInicio++;
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Now currentDate is the first business day where we start counting vacation days
    const firstBusinessDate = new Date(currentDate);
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
    
    // currentDate is now the last business day of the integer portion
    const lastBusinessDate = new Date(currentDate);
    
    // Calculate calendar days from first business day to last business day
    const timeDiff = lastBusinessDate.getTime() - firstBusinessDate.getTime();
    let diasCorridosEnteros = Math.floor(timeDiff / (1000 * 60 * 60 * 24)) + 1;
    
    // Extra weekend days to add when decimal > 0.2 falls on Friday or before weekend
    let diasInhabilesExtra = 0;
    
    // Rule: If decimal > 0.2 AND (last day is Friday OR next day is non-business)
    // Add the weekend days to the total (without moving the end date)
    if (decimalDays > 0.2) {
      const dayOfWeek = lastBusinessDate.getDay(); // 5 = Friday
      const nextDay = new Date(lastBusinessDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      // Check if it's Friday (5) or if next day is non-business
      if (dayOfWeek === 5 || !isBusinessDay(nextDay)) {
        // Count non-business days until next business day
        let tempDate = new Date(lastBusinessDate);
        tempDate.setDate(tempDate.getDate() + 1);
        while (!isBusinessDay(tempDate)) {
          diasInhabilesExtra++;
          tempDate.setDate(tempDate.getDate() + 1);
        }
      }
    }
    
    // Total días corridos = weekend before first business day + calendar days for vacation + weekend extension + decimal
    const diasCorridos = diasInhabilesInicio + diasCorridosEnteros + diasInhabilesExtra + decimalDays;
    
    console.log('=== CÁLCULO DÍAS CORRIDOS ===');
    console.log('Fecha de término (último día trabajo):', startDate.toLocaleDateString('es-CL'), '(' + ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][startDate.getDay()] + ')');
    console.log('Días pendientes vacaciones:', availableDays);
    console.log('Parte entera:', integerDays, '| Decimal:', decimalDays.toFixed(2));
    console.log('Fecha día siguiente término:', trueStartDate.toLocaleDateString('es-CL'), '(' + ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][trueStartDate.getDay()] + ')');
    console.log('Días inhábiles ANTES del primer día hábil:', diasInhabilesInicio);
    console.log('Fecha INICIO conteo vacaciones (primer día hábil):', firstBusinessDate.toLocaleDateString('es-CL'), '(' + ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][firstBusinessDate.getDay()] + ')');
    console.log('Fecha FIN días hábiles:', lastBusinessDate.toLocaleDateString('es-CL'), '(' + ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][lastBusinessDate.getDay()] + ')');
    console.log('Días corridos enteros (calendario hábil):', diasCorridosEnteros);
    console.log('Días inhábiles extra (decimal > 0.2):', diasInhabilesExtra);
    console.log('Decimal:', decimalDays.toFixed(2));
    console.log('DÍAS CORRIDOS TOTAL:', diasCorridos.toFixed(2), '= ', diasInhabilesInicio, '+', diasCorridosEnteros, '+', diasInhabilesExtra, '+', decimalDays.toFixed(2));
    console.log('=============================');
    
    return diasCorridos;
  };

  // Fetch vacation days from backend when termination date changes
  // The backend calculates the projection using the BUK API with the date parameter
  // Uses debounce to avoid excessive API calls when user changes date rapidly
  useEffect(() => {
    if (vacationDaysManuallyEdited) return; // Skip if manually edited
    
    const fetchVacationDays = async () => {
      if (!rut) return;
      
      setIsLoadingVacation(true);
      try {
        // Pass the termination date to the API if selected
        const vacationData = await EmployeesService.getVacationsAvailable(
          rut, 
          lastDayWork || null
        );
        const rawDays = vacationData.total_dias_disponibles || 0;
        
        // Update both stock (initial value without date) and current value
        if (!lastDayWork) {
          setVacationDaysStock(rawDays);
        }
        setVacationDays(rawDays);
        
        console.log('=== VACACIONES DESDE API ===');
        console.log('Fecha de término:', lastDayWork || 'Sin fecha');
        console.log('Días disponibles:', rawDays);
        console.log('============================');
        
      } catch (err) {
        console.error("Error fetching vacation days:", err);
      } finally {
        setIsLoadingVacation(false);
      }
    };
    
    // Debounce the API call by 300ms
    const debounceTimer = setTimeout(fetchVacationDays, 300);
    
    return () => clearTimeout(debounceTimer);
  }, [rut, lastDayWork, vacationDaysManuallyEdited]);

  // Auto-calculate Vacation Value
  // Formula: (Sueldo Base + Promedio Bonos / 30) * Días corridos
  useEffect(() => {
    // Only calculate when we have a termination date selected
    if (!lastDayWork) {
      setVacationValue(0);
      return;
    }
    
    if (salary > 0 && vacationDays >= 0) {
      // Calculate daily rate: (Base Salary + Average Bonus) / 30
      const dailyRate = (salary + variableBonus) / 30;
      
      // Calculate días corridos based on lastDayWork and vacation days
      const diasCorridos = calculateDiasCorridos(parseLocalDate(lastDayWork), vacationDays);
      
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

        // Calculate Indemnity Years (Chilean Law Rules):
        // 1. Si < 1 año: No hay indemnización (0)
        // 2. Si >= 1 año y < 1.5 años: Usar duración real
        // 3. Si >= 1.5 años: Aplica regla de 6 meses + 1 día (>= 0.5 redondea hacia arriba)
        let indemnityYears = 0;
        if (years < 1) {
          indemnityYears = 0;
        } else if (years >= 1 && years < 1.5) {
          // Usar la duración real (ej: 1.3 años)
          indemnityYears = years;
        } else {
          // >= 1.5 años: aplicar regla de redondeo 6 meses + 1 día
          const fullYears = Math.floor(years);
          const remainder = years - fullYears;
          indemnityYears = remainder >= 0.5 ? fullYears + 1 : fullYears;
        }
        setYearsForIndemnity(indemnityYears);
      }
    } else if (employee?.duracion_empresa) {
        // Fallback to initial value if no date selected yet
        setYearsOfService(employee.duracion_empresa);
        setYearsForIndemnity(Math.floor(employee.duracion_empresa));
    }
  }, [lastDayWork, employee]);

  if (loading) {
    return (
      <div className="flex min-h-screen bg-[#f8f9fa] items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!employee) {
    return <div className="p-8">Empleado no encontrado</div>;
  }

  // Calculations
  // yearsOfService and yearsForIndemnity are now state variables
  // Daily Salary Base = (Sueldo Base + Promedio Bonificaciones) / 30
  const dailySalary = ((salary + variableBonus) / 30).toFixed(0);
  
  // Gratificación Legal = (Sueldo Base + Promedio Bonificaciones) * 25%
  // Tope = ((4.75/12) * Sueldo Mínimo) * 25%
  const sueldoMinimo = 539000;
  const topeGratificacion = ((4.75 / 12) * sueldoMinimo);
  const gratificacionLegal = Math.min((salary + variableBonus) * 0.25, topeGratificacion);
  
  // Total Haberes = Sueldo Base + Promedio Bonificaciones + Gratificación Legal + Movilización
  const totalHaberes = salary + variableBonus + gratificacionLegal + movilizacion;
  
  // 1. Vacation Indemnity = (Sueldo Base + Total Bonificaciones / 30) * días corridos
  // vacationValue ya está calculado en el useEffect con la fórmula de días corridos
  // Aplica para: necesidades_empresa (Sí), mutuo_acuerdo (caso a caso), no_concurrencia (Sí), renuncia (Sí)
  const vacationApplies = terminationReason === 'necesidades_empresa' || 
                          terminationReason === 'mutuo_acuerdo' ||
                          terminationReason === 'no_concurrencia' || 
                          terminationReason === 'renuncia';
  const vacationIndemnity = vacationApplies ? vacationValue : 0;
  
  // 2. Years of Service Indemnity = Total Haberes * años de indemnización
  // Si tiene menos de 1 año (antigüedad real), no tiene indemnización por años de servicio
  // Aplica para: necesidades_empresa (Sí), mutuo_acuerdo (caso a caso)
  // NO aplica para: no_concurrencia (No), renuncia (No)
  const yearsIndemnityApplies = terminationReason === 'necesidades_empresa' || 
                                 terminationReason === 'mutuo_acuerdo';
  const yearsIndemnity = (yearsIndemnityApplies && yearsOfService >= 1) ? yearsForIndemnity * totalHaberes : 0;
  
  // 3. Notice Month = Total Haberes (si no se dio aviso de 30 días)
  // Aplica para: necesidades_empresa (Sí), mutuo_acuerdo (caso a caso)
  // NO aplica para: no_concurrencia (No), renuncia (No)
  const noticeIndemnityApplies = terminationReason === 'necesidades_empresa' || 
                                  terminationReason === 'mutuo_acuerdo';
  const noticeIndemnity = (noticeIndemnityApplies && !noticeGiven) ? totalHaberes : 0;
  
  // Total Settlement = (Mes de Aviso + Indemnización por Años de Servicio + Vacaciones Proporcionales) - Todos los Descuentos
  const descuentosNum = parseFloat(descuentos) || 0;
  const descuentosAutomaticos = descuentosItems.reduce((sum, d) => sum + (d.monto || 0), 0);
  
  // Custom discount calculation with UF support for "Préstamo Interno"
  const descuentosCustom = descuentosPersonalizados.reduce((sum, d) => {
    let monto = parseFloat(d.monto) || 0;
    const cuotas = parseInt(d.cuotas) || 1;
    
    // If it's a loan, backend usually sends UF value. We need to convert it to CLP for the monthly deduction if desired.
    // However, usually the 'monto' received is the quota in UF.
    // User request: "el valor de la UF del día y que se multiplique por el valor del concepto 'Préstamo interno'?"
    if (d.descripcion === 'Préstamo Interno' && ufValue > 0) {
        // Assume 'monto' is in UF
        // Calculate Total Debt in CLP = Monto(UF) * UF_Value * Cuotas
        // Note: We use Math.round just once at the end if preferred, or per item.
        monto = Math.round(monto * ufValue);
    }
    
    // Multiply by installments (Total Debt)
    return sum + (monto * cuotas);
  }, 0);

  const totalDescuentos = descuentosNum + descuentosAutomaticos + descuentosCustom;
  const liquidacionMesActualNum = parseFloat(liquidacionMesActual) || 0;
  const totalSettlement = noticeIndemnity + yearsIndemnity + vacationIndemnity + liquidacionMesActualNum - totalDescuentos;

  // Handle generate document - navigate to visualizer with all data
  const handleGenerate = () => {
    console.log('handleGenerate called');
    
    // Validar que se hayan completado los campos requeridos
    if (!lastDayWork) {
      alert('Por favor seleccione la fecha de término del contrato');
      return;
    }
    if (!terminationReason) {
      alert('Por favor seleccione la causal de término');
      return;
    }
    
    // Find selected manager object
    const managerObj = managers.find(m => m.id === selectedManager) || managers[0];
    
    // Prepare finiquito data to pass to visualizer
    const finiquitoData = {
      // Employee info
      employeeData: employee,
      
      // Form state to preserve on back navigation
      terminationReason,
      noticeGiven,
      
      // Dates
      lastDayWork,
      notaryDate: new Date(new Date(lastDayWork).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      
      // Manager
      selectedManager: managerObj,
      
      // Haberes
      noticeIndemnity: Math.round(noticeIndemnity),
      yearsIndemnity: Math.round(yearsIndemnity),
      vacationIndemnity: Math.round(vacationIndemnity),
      totalHaberes: Math.round(totalHaberes),
      yearsForIndemnity,
      vacationDays,
      liquidacionMesActual: parseFloat(liquidacionMesActual) || 0,
      
      // Descuentos - find specific types
      aporteCesantia: descuentosPersonalizados.find(d => d.descripcion?.toLowerCase().includes('cesant'))?.monto || 0,
      // For loan, check if we need to send CLP or UF. Usually visualizer expects CLP.
      prestamoInterno: (() => {
          const loanItem = descuentosPersonalizados.find(d => d.descripcion?.toLowerCase().includes('préstamo'));
          if (!loanItem) return 0;
          let val = parseFloat(loanItem.monto) || 0;
          const cuotas = parseInt(loanItem.cuotas) || 1;
          
          if (ufValue > 0) val = Math.round(val * ufValue);
          
          // Return Total Debt: Monthly * Cuotas
          return val * cuotas;
      })(),
      totalDescuentos: Math.round(totalDescuentos),
      
      ufValue, // Pass UF to visualizer if needed
      
      // All deductions for flexibility
      descuentosItems,
      descuentosPersonalizados,
      
      // Total
      totalSettlement: Math.round(totalSettlement),
    };
    
    // Guardar datos en sessionStorage para preservarlos al volver
    sessionStorage.setItem(`finiquito_${rut}`, JSON.stringify(finiquitoData));
    
    // Navegar al visualizador en la misma pestaña
    navigate(`/finiquitos/visualizar/${rut}`, { state: finiquitoData });
  };

  return (
    <div className="flex min-h-screen bg-[#f8f9fa] font-['Public_Sans']">
      <Sidebar />
      
      <main className="flex-1 ml-64 p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <span className="cursor-pointer hover:text-blue-600" onClick={() => navigate('/finiquitos')}>Home</span>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span>Empleados</span>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span>{employee.nombre_trabajador}</span>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span className="font-semibold text-gray-900">Generador finiquito</span>
          </div>
          
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Generador finiquito</h1>
              <p className="text-gray-500 mt-1">Formulario de generación de finiquito</p>
            </div>
            <div className="bg-orange-50 text-orange-700 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 border border-orange-100">
              <span className="material-symbols-outlined text-lg">warning</span>
              Aprobación pendiente
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
            <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">FECHA INICIO</p>
            <p className="font-semibold text-gray-900">{new Date(employee.fecha_ingreso).toLocaleDateString('es-CL', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </div>

        {/* Termination Details */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <span className="material-symbols-outlined">gavel</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900">Detalles de término</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Razón de término <span className="text-red-500">*</span>
              </label>
              <select 
                className="w-full p-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                value={terminationReason}
                onChange={(e) => setTerminationReason(e.target.value)}
              >
                <option value="">Seleccione una causal...</option>
                <option value="necesidades_empresa">Art. 161 - Necesidades de la empresa</option>
                <option value="mutuo_acuerdo">Art. 159 N°1 - Mutuo acuerdo</option>
                <option value="no_concurrencia">Art. 160 N°3 - No concurrencia injustificada</option>
                <option value="renuncia">Art. 159 N°2 - Renuncia voluntaria</option>
              </select>
              <p className="text-xs text-gray-400 mt-2">Esta selección determina la base de cálculo de la indemnización.</p>
            </div>

            <div className="flex gap-6">
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Fecha de salida <span className="text-red-500">*</span>
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
                    <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">30 días de aviso</p>
                    <p className="text-xs text-gray-400">Si no se marca, se agregará el mes de aviso.</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Manager Selection */}
            <div className="mt-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Gerente firmante <span className="text-red-500">*</span>
              </label>
              <select 
                className="w-full p-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                value={selectedManager}
                onChange={(e) => setSelectedManager(e.target.value)}
              >
                <option value="">Seleccione un gerente...</option>
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name} - {manager.title}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-2">Este gerente aparecerá como firmante en el documento de finiquito.</p>
            </div>
          </div>
        </div>

        {/* Recent Licenses Table */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <span className="material-symbols-outlined">medical_information</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900">Licencias recientes</h3>
            <span className="ml-auto px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
              Últimos 5 registros
            </span>
          </div>
          
          {licencias.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
              <span className="material-symbols-outlined text-gray-300 text-4xl mb-2">event_busy</span>
              <p className="text-gray-500 font-medium">No se encontraron licencias</p>
              <p className="text-xs text-gray-400">Este empleado no tiene licencias registradas.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 uppercase text-xs tracking-wider">Razón</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 uppercase text-xs tracking-wider">Fecha de inicio</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 uppercase text-xs tracking-wider">Fecha de fin</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 uppercase text-xs tracking-wider">Días</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 uppercase text-xs tracking-wider">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {licencias.map((lic, idx) => {
                    const startDate = new Date(lic.fecha_inicio);
                    const endDate = new Date(lic.fecha_fin);
                    const today = new Date();
                    const diffDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
                    const isActive = today >= startDate && today <= endDate;
                    const isPast = today > endDate;
                    
                    return (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-medium text-gray-900">{lic.tipo_permiso || 'Sin especificar'}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-gray-600">
                          {startDate.toLocaleDateString('es-CL')}
                        </td>
                        <td className="py-3 px-4 font-mono text-gray-600">
                          {endDate.toLocaleDateString('es-CL')}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-gray-900">{diffDays}</span>
                          <span className="text-gray-400 ml-1">days</span>
                        </td>
                        <td className="py-3 px-4">
                          {isActive ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold uppercase rounded-full">Active</span>
                          ) : isPast ? (
                            <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-bold uppercase rounded-full">Completed</span>
                          ) : (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold uppercase rounded-full">Scheduled</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Review Variable Bonuses (Collapsed for now or simplified) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
            <div className="flex justify-between items-center cursor-pointer">
                <div className="flex items-center gap-2"> 
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <span className="material-symbols-outlined">payments</span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">Resumen remuneración variable</h3>
                </div>
                <span className="material-symbols-outlined text-gray-400">expand_less</span>
            </div>
            <div className="mt-6 space-y-4">
                <p className="text-sm text-gray-500 mb-4">Selecciona los bonos de los últimos meses que serán incluídos en el promedio de cálculo.</p>
                {variableItems.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
                        <span className="material-symbols-outlined text-gray-300 text-4xl mb-2">money_off</span>
                        <p className="text-gray-500 font-medium">No se encontraron bonos</p>
                        <p className="text-xs text-gray-400">Este empleado no tiene bonos registrados.</p>
                    </div>
                ) : (
                    // Group iterarion logic updated to handle custom additions
                    (() => {
                        // 1. Prepare groups uniting fetched and custom items
                        const allGroups = variableItems.reduce((acc, item, idx) => {
                            const key = item.concepto || 'Sin Concepto';
                            if (!acc[key]) acc[key] = [];
                            acc[key].push({ ...item, type: 'fetched', originalIndex: idx });
                            return acc;
                        }, {});

                        // Merge custom additions into groups
                        Object.keys(variableCustomAdditions).forEach(key => {
                            if (!allGroups[key]) allGroups[key] = []; // Should usually exist, but just in case
                            
                            variableCustomAdditions[key].forEach((item, idx) => {
                                allGroups[key].push({ 
                                    ...item, 
                                    concepto: key,
                                    type: 'custom', 
                                    originalIndex: idx 
                                });
                            });
                        });

                        return Object.entries(allGroups).map(([concepto, items]) => {
                             // Calculate stats for this group
                             const activeItems = items.filter(item => item.active !== false);
                             const allActive = items.every(item => item.active !== false);
                             const groupSum = activeItems.reduce((sum, item) => sum + (parseFloat(item.monto) || 0), 0);
                             const groupAverage = activeItems.length > 0 ? groupSum / activeItems.length : 0;
                             
                             return (
                                <div key={concepto} className="border border-gray-200 rounded-lg overflow-hidden mb-3">
                                  {/* Header del grupo */}
                                  <div className="flex items-center justify-between p-4 bg-gray-100 border-b border-gray-200">
                                    <div className="flex items-center gap-3">
                                      {/* Group Toggle */}
                                      <div 
                                        className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${allActive ? 'bg-blue-600' : 'bg-gray-300'}`}
                                        onClick={() => {
                                          const newState = !allActive;
                                          
                                          // Update fetched items
                                          const newVariableItems = [...variableItems];
                                          items.forEach(item => {
                                              if (item.type === 'fetched') {
                                                  newVariableItems[item.originalIndex].active = newState;
                                              }
                                          });
                                          setVariableItems(newVariableItems);

                                          // Update custom items
                                          const newCustomAdditions = { ...variableCustomAdditions };
                                          if (newCustomAdditions[concepto]) {
                                              newCustomAdditions[concepto] = newCustomAdditions[concepto].map(i => ({ ...i, active: newState }));
                                              setVariableCustomAdditions(newCustomAdditions);
                                          }
                                          
                                          // Recalculate Total
                                          const newTotal = calculateTotalVariableBonus(newVariableItems, newCustomAdditions[concepto] ? newCustomAdditions : variableCustomAdditions);
                                          setVariableBonus(newTotal);
                                        }}
                                      >
                                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${allActive ? 'translate-x-6' : ''}`}></div>
                                      </div>
                                      <div>
                                        <p className="font-bold text-gray-900">{concepto}</p>
                                        <p className="text-xs text-gray-500">{items.length} registro(s) • Promedio: $ {Math.round(groupAverage).toLocaleString('es-CL')}</p>
                                      </div>
                                    </div>
                                    

                                    {/* Action to add manual item */}
                                    <div className="flex items-center gap-2">
                                        {newCustomItems[concepto]?.isAdding ? (
                                            <>
                                                <input 
                                                    type="text" 
                                                    placeholder="Descripción"
                                                    className="w-32 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                                                    value={newCustomItems[concepto]?.description || ''}
                                                    onChange={(e) => {
                                                        const newState = { ...newCustomItems };
                                                        if (!newState[concepto]) newState[concepto] = {};
                                                        newState[concepto].description = e.target.value;
                                                        setNewCustomItems(newState);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            // Trigger add logic
                                                            const state = newCustomItems[concepto] || {};
                                                            if (state.description && state.amount) {
                                                                const amount = parseFloat(state.amount);
                                                                if (!isNaN(amount)) {
                                                                    const newCustomAdditions = { ...variableCustomAdditions };
                                                                    if (!newCustomAdditions[concepto]) newCustomAdditions[concepto] = [];
                                                                    
                                                                    newCustomAdditions[concepto].push({
                                                                        id: Date.now(),
                                                                        descripcion: state.description,
                                                                        monto: amount,
                                                                        active: true,
                                                                        periodo: 'Manual'
                                                                    });
                                                                    
                                                                    setVariableCustomAdditions(newCustomAdditions);
                                                                    const total = calculateTotalVariableBonus(variableItems, newCustomAdditions);
                                                                    setVariableBonus(total);
                                                                    
                                                                    // Reset input
                                                                    setNewCustomItems({
                                                                        ...newCustomItems,
                                                                        [concepto]: { isAdding: false, description: '', amount: '' }
                                                                    });
                                                                }
                                                            }
                                                        }
                                                    }}
                                                />
                                                <div className="relative">
                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
                                                    <input 
                                                        type="number" 
                                                        placeholder="Monto"
                                                        className="w-24 pl-5 pr-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                                                        value={newCustomItems[concepto]?.amount || ''}
                                                        onChange={(e) => {
                                                            const newState = { ...newCustomItems };
                                                            if (!newState[concepto]) newState[concepto] = {};
                                                            newState[concepto].amount = e.target.value;
                                                            setNewCustomItems(newState);
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                // Trigger add logic (same as above)
                                                                 const state = newCustomItems[concepto] || {};
                                                                if (state.description && state.amount) {
                                                                    const amount = parseFloat(state.amount);
                                                                    if (!isNaN(amount)) {
                                                                        const newCustomAdditions = { ...variableCustomAdditions };
                                                                        if (!newCustomAdditions[concepto]) newCustomAdditions[concepto] = [];
                                                                        
                                                                        newCustomAdditions[concepto].push({
                                                                            id: Date.now(),
                                                                            descripcion: state.description,
                                                                            monto: amount,
                                                                            active: true,
                                                                            periodo: 'Manual'
                                                                        });
                                                                        
                                                                        setVariableCustomAdditions(newCustomAdditions);
                                                                        const total = calculateTotalVariableBonus(variableItems, newCustomAdditions);
                                                                        setVariableBonus(total);
                                                                        
                                                                        setNewCustomItems({
                                                                            ...newCustomItems,
                                                                            [concepto]: { isAdding: false, description: '', amount: '' }
                                                                        });
                                                                    }
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>
                                                <button 
                                                    className="p-1 px-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-medium"
                                                    onClick={() => {
                                                        const state = newCustomItems[concepto] || {};
                                                        if (state.description && state.amount) {
                                                            const amount = parseFloat(state.amount);
                                                            if (!isNaN(amount)) {
                                                                const newCustomAdditions = { ...variableCustomAdditions };
                                                                if (!newCustomAdditions[concepto]) newCustomAdditions[concepto] = [];
                                                                
                                                                newCustomAdditions[concepto].push({
                                                                    id: Date.now(),
                                                                    descripcion: state.description,
                                                                    monto: amount,
                                                                    active: true,
                                                                    periodo: 'Manual'
                                                                });
                                                                
                                                                setVariableCustomAdditions(newCustomAdditions);
                                                                const total = calculateTotalVariableBonus(variableItems, newCustomAdditions);
                                                                setVariableBonus(total);
                                                                
                                                                setNewCustomItems({
                                                                    ...newCustomItems,
                                                                    [concepto]: { isAdding: false, description: '', amount: '' }
                                                                });
                                                            }
                                                        }
                                                    }}
                                                >
                                                    Agregar
                                                </button>
                                                <button 
                                                    className="p-1 text-gray-500 hover:text-gray-700"
                                                    onClick={() => {
                                                        const newState = { ...newCustomItems };
                                                        newState[concepto] = { isAdding: false, description: '', amount: '' };
                                                        setNewCustomItems(newState);
                                                    }}
                                                >
                                                    <span className="material-symbols-outlined text-sm">close</span>
                                                </button>
                                            </>
                                        ) : (
                                            <button 
                                                className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium px-2 py-1 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                                                onClick={() => {
                                                    const newState = { ...newCustomItems };
                                                    newState[concepto] = { isAdding: true, description: '', amount: '' };
                                                    setNewCustomItems(newState);
                                                }}
                                            >
                                                <span className="material-symbols-outlined text-sm">add</span>
                                                Agregar Item
                                            </button>
                                        )}
                                    </div>
                                  </div>
                                  
                                  {/* Items del grupo */}
                                  <div className="divide-y divide-gray-100">
                                    {items.map((bonus, idx) => (
                                      <div key={idx} className={`flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors ${bonus.type === 'custom' ? 'bg-blue-50/30' : ''}`}>
                                        <div className="flex items-center gap-2">
                                            {bonus.type === 'custom' && <span className="material-symbols-outlined text-xs text-blue-500" title="Item Manual">edit_note</span>}
                                            <div>
                                                <p className="font-medium text-gray-700">{bonus.type === 'custom' ? bonus.descripcion : bonus.periodo}</p>
                                                {bonus.type === 'custom' && <p className="text-xs text-gray-400">Manual</p>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                          <span className={`font-mono font-medium ${bonus.active !== false ? 'text-gray-900' : 'text-gray-400'}`}>$ {(bonus.monto || 0).toLocaleString('es-CL')}</span>
                                          
                                          {/* Item Toggle */}
                                          <div 
                                            className={`w-10 h-5 rounded-full p-0.5 cursor-pointer transition-colors ${bonus.active !== false ? 'bg-blue-600' : 'bg-gray-300'}`}
                                            onClick={() => {
                                              // Handle toggle based on type
                                              if (bonus.type === 'fetched') {
                                                  const newItems = [...variableItems];
                                                  newItems[bonus.originalIndex].active = !newItems[bonus.originalIndex].active;
                                                  setVariableItems(newItems);
                                                  const total = calculateTotalVariableBonus(newItems, variableCustomAdditions);
                                                  setVariableBonus(total);
                                              } else {
                                                  // Custom item
                                                  const newCustomAdditions = { ...variableCustomAdditions };
                                                  const groupAdditions = [...newCustomAdditions[concepto]];
                                                  groupAdditions[bonus.originalIndex].active = !groupAdditions[bonus.originalIndex].active;
                                                  newCustomAdditions[concepto] = groupAdditions;
                                                  setVariableCustomAdditions(newCustomAdditions);
                                                  const total = calculateTotalVariableBonus(variableItems, newCustomAdditions);
                                                  setVariableBonus(total);
                                              }
                                            }}
                                          >
                                            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${bonus.active !== false ? 'translate-x-5' : ''}`}></div>
                                          </div>
                                          
                                          {/* Delete button for custom items */}
                                          {bonus.type === 'custom' && (
                                              <button 
                                                  className="text-gray-400 hover:text-red-500 transition-colors"
                                                  onClick={() => {
                                                      if (confirm('¿Eliminar este item manual?')) {
                                                          const newCustomAdditions = { ...variableCustomAdditions };
                                                          newCustomAdditions[concepto] = newCustomAdditions[concepto].filter((_, i) => i !== bonus.originalIndex);
                                                          setVariableCustomAdditions(newCustomAdditions);
                                                          const total = calculateTotalVariableBonus(variableItems, newCustomAdditions);
                                                          setVariableBonus(total);
                                                      }
                                                  }}
                                              >
                                                  <span className="material-symbols-outlined text-lg">delete</span>
                                              </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                        });
                    })()
                )}
            </div>
        </div>

        {/* Compensation & Vacation */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
             <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                    <span className="material-symbols-outlined">beach_access</span>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Compensación y Vacaciones</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                    <div className="flex justify-between mb-2">
                        <label className="text-sm font-semibold text-gray-700">Días de Vacaciones Pendientes</label>
                    </div>
                    <div className="relative">
                        <input 
                            type="number" 
                            step="0.01"
                            className="w-full p-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                            value={vacationDays.toFixed(2)}
                            onChange={(e) => {
                              setVacationDays(parseFloat(e.target.value) || 0);
                              setVacationDaysManuallyEdited(true);
                            }}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm flex items-center gap-2">
                            {isLoadingVacation && (
                                <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></span>
                            )}
                            Días
                        </span>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[10px]">check_circle</span>
                        Stock Buk: {vacationDaysStock.toFixed(2)} días
                      </p>
                      {lastDayWork && vacationDays !== vacationDaysStock && !vacationDaysManuallyEdited && (
                        <p className="text-xs text-blue-600 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[10px]">trending_up</span>
                          Proyectado al {parseLocalDate(lastDayWork).toLocaleDateString('es-CL')}: +{(vacationDays - vacationDaysStock).toFixed(2)} días
                        </p>
                      )}
                      {vacationDaysManuallyEdited && (
                        <p className="text-xs text-orange-600 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[10px]">edit</span>
                          Editado manualmente
                          <button 
                            className="ml-1 underline hover:no-underline"
                            onClick={() => {
                              setVacationDaysManuallyEdited(false);
                            }}
                          >
                            Restaurar
                          </button>
                        </p>
                      )}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Valor Vacaciones (Calculado)</label>
                    <div className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-mono">
                        $ {vacationValue.toLocaleString('es-CL')}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                 <div>
                    <label className="block text-sm font-semibold text-blue-600 mb-2">Sueldo Base (Editable)</label>
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
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Bonos Variables (Calculado)</label>
                    <div className="flex items-center gap-2">
                        <div className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-mono">
                            $ {variableBonus.toLocaleString('es-CL')}
                        </div>
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-bold uppercase rounded tracking-wider">Calculado</span>
                    </div>
                </div>
            </div>
            
            <button className="mt-6 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                <span className="material-symbols-outlined text-lg">add_circle</span>
                Agregar items (en desarrollo)
            </button>
        </div>

        {/* Indemnity Calculations */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
            <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                    <span className="material-symbols-outlined">calculate</span>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Cálculo indemnización</h3>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Años de servicio</p>
                    <p className="text-xl font-bold text-gray-900">{yearsOfService.toFixed(1)} Años</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Años para indemnización</p>
                    <p className="text-xl font-bold text-gray-900">{yearsOfService >= 1 ? (typeof yearsForIndemnity === 'number' ? yearsForIndemnity.toFixed(2) : yearsForIndemnity) : 0}</p>
                    <p className="text-xs text-gray-400 mt-1">Redondeado hacia arriba &gt; 6 meses</p>
                </div>
                 <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">(Sueldo base + Bonificaciones) / 30</p>
                    <p className="text-xl font-bold text-gray-900">$ {dailySalary}</p>
                </div>
            </div>

            <div className="space-y-3 border-t border-gray-100 pt-6">
                {/* Sección 1: Haberes */}
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Gratificación Legal</span>
                    <span className="font-mono font-medium">$ {Math.round(gratificacionLegal).toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Promedio de Bonificaciones Mensuales</span>
                    <span className="font-mono font-medium">$ {Math.round(variableBonus).toLocaleString('es-CL')}</span>
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
                
                <div className="flex justify-between text-sm">
                    <span className="text-gray-900 font-bold">Total Haberes</span>
                    <span className="font-mono font-bold">$ {Math.round(totalHaberes).toLocaleString('es-CL')}</span>
                </div>
                
                <div className="border-t border-gray-100 my-2"></div>
                
                {/* Sección 2: Indemnizaciones */}
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Indemnización por Años de Servicio ({typeof yearsForIndemnity === 'number' ? yearsForIndemnity.toFixed(2) : yearsForIndemnity} años)</span>
                    <span className="font-mono font-medium">$ {Math.round(yearsIndemnity).toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Vacaciones Pendientes</span>
                    <span className="font-mono font-medium">$ {Math.round(vacationIndemnity).toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Mes de Aviso</span>
                    <span className="font-mono font-medium">$ {Math.round(noticeIndemnity).toLocaleString('es-CL')}</span>
                </div>

                <div className="flex justify-between text-sm items-center">
                    <span className="text-gray-600">Remuneración adeudada</span>
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400">$</span>
                        <input 
                            type="text" 
                            inputMode="numeric"
                            className="w-28 p-1 text-right bg-white border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                            value={liquidacionMesActual}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9]/g, '');
                              setLiquidacionMesActual(val ? parseFloat(val) : '');
                            }}
                            placeholder="0"
                        />
                    </div>
                </div>
                
                <div className="border-t border-gray-100 my-2"></div>
                
                {/* Sección 3: Descuentos */}
                <div className="flex justify-between text-sm items-center mb-2">
                    <span className="text-red-600 font-medium">Otros Descuentos</span>
                    <div className="flex items-center gap-2">
                        <span className="text-red-400">- $</span>
                        <input 
                            type="text" 
                            inputMode="numeric"
                            className="w-28 p-1 text-right bg-red-50 border border-red-200 rounded focus:ring-2 focus:ring-red-500 outline-none font-mono text-red-700"
                            value={descuentos}
                            onChange={(e) => {
                                const value = e.target.value.replace(/[^0-9]/g, '');
                                setDescuentos(value);
                            }}
                            placeholder="0"
                        />
                    </div>
                </div>
                
                {/* Descuentos personalizados agregados - Table Header */}
                {descuentosPersonalizados.length > 0 && (
                    <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 font-medium mb-1 px-1">
                        <div className="col-span-4">Concepto</div>
                        <div className="col-span-3 text-right">Valor</div>
                        <div className="col-span-2 text-center">Cuotas</div>
                        <div className="col-span-3 text-right">Deuda Total</div>
                    </div>
                )}
                
                {descuentosPersonalizados.map((desc, idx) => {
                    // Calculate Total Debt
                    const isLoan = desc.descripcion === 'Préstamo Interno';
                    const montoVal = parseFloat(desc.monto) || 0;
                    const cuotasVal = parseInt(desc.cuotas) || 1;
                    
                    let totalDebt = 0;
                    let displayMonto = montoVal;
                    
                    if (isLoan && ufValue > 0) {
                        // Loan: Monto is in UF. Total Debt = Monto(UF) * UF * Cuotas
                        totalDebt = Math.round(montoVal * ufValue * cuotasVal);
                        displayMonto = Math.round(montoVal * ufValue); // Monthly deduction in CLP
                    } else {
                        // Planilla: Monto is in CLP. Total Debt = Monto * Cuotas
                        totalDebt = montoVal * cuotasVal;
                    }

                    return (
                  <div key={idx} className="grid grid-cols-12 gap-2 text-sm items-center mb-2 bg-white p-2 rounded border border-gray-100 shadow-sm">
                    {/* Concepto Selector */}
                    <div className="col-span-4 flex flex-col">
                        <select
                          className="text-red-600 font-medium bg-transparent border-none outline-none cursor-pointer w-full text-xs"
                          value={desc.descripcion}
                          onChange={(e) => {
                            const newDescuentos = [...descuentosPersonalizados];
                            newDescuentos[idx].descripcion = e.target.value;
                            setDescuentosPersonalizados(newDescuentos);
                          }}
                        >
                          <option value="">Tipo...</option>
                          <option value="Préstamo Interno">Préstamo Interno</option>
                          <option value="Descuento por planilla">Descuento por planilla</option>
                        </select>
                        {desc.detalle && (
                            <span className="text-[10px] text-gray-400 pl-1 truncate" title={desc.detalle}>{desc.detalle}</span>
                        )}
                    </div>
                    
                    {/* Monto Input */}
                    <div className="col-span-3">
                        <div className="flex items-center gap-1 justify-end">
                            {isLoan && <span className="text-[9px] text-blue-600 font-bold">UF</span>}
                            <input 
                                type="text"
                                className="w-full text-right bg-red-50 border border-red-200 rounded px-1 py-0.5 text-xs font-mono text-red-700 outline-none focus:ring-1 focus:ring-red-500"
                                value={desc.monto}
                                onChange={(e) => {
                                    // Allow decimals for UF
                                    const val = e.target.value.replace(/[^0-9.]/g, ''); 
                                    const newDescuentos = [...descuentosPersonalizados];
                                    newDescuentos[idx].monto = val;
                                    setDescuentosPersonalizados(newDescuentos);
                                }}
                                placeholder="0"
                            />
                        </div>
                         {isLoan && ufValue > 0 && (
                            <div className="text-[9px] text-gray-400 text-right mt-0.5">
                                ~ ${displayMonto.toLocaleString('es-CL')}
                            </div>
                         )}
                    </div>
                    
                    {/* Cuotas Input */}
                    <div className="col-span-2">
                        <input 
                            type="text" 
                            inputMode="numeric"
                            className="w-full text-center bg-white border border-gray-200 rounded px-1 py-0.5 text-xs text-gray-700 outline-none focus:ring-1 focus:ring-blue-500"
                            value={desc.cuotas}
                            onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                const newDescuentos = [...descuentosPersonalizados];
                                newDescuentos[idx].cuotas = val; // Save as string to allow empty
                                setDescuentosPersonalizados(newDescuentos);
                            }}
                            onBlur={() => {
                                const newDescuentos = [...descuentosPersonalizados];
                                let val = parseInt(newDescuentos[idx].cuotas) || 1;
                                if (val < 1) val = 1;
                                if (val > 60) val = 60;
                                newDescuentos[idx].cuotas = val;
                                setDescuentosPersonalizados(newDescuentos);
                            }}
                        />
                    </div>
                    
                    {/* Deuda Total & Delete */}
                    <div className="col-span-3 flex items-center justify-between pl-2">
                         <span className="text-xs font-mono font-medium text-gray-700" title="Deuda Total Estimada">
                            $ {totalDebt.toLocaleString('es-CL')}
                         </span>
                         <button
                            onClick={() => {
                              const newDescuentos = descuentosPersonalizados.filter((_, i) => i !== idx);
                              setDescuentosPersonalizados(newDescuentos);
                            }}
                            className="text-gray-400 hover:text-red-500 transition-colors ml-1"
                        >
                            <span className="material-symbols-outlined text-base">close</span>
                        </button>
                    </div>
                  </div>
                );
            })}
                
                {/* Botón para agregar descuento */}
                <button
                  onClick={() => {
                    setDescuentosPersonalizados([...descuentosPersonalizados, { descripcion: '', monto: '', cuotas: 1 }]);
                  }}
                  className="mt-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border border-red-200"
                >
                  <span className="material-symbols-outlined text-lg">add_circle</span>
                  Agregar descuento
                </button>
            </div>

            {ufValue > 0 && (
                <div className="mt-4 flex justify-end">
                    <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg text-xs text-blue-700 border border-blue-100 shadow-sm">
                        <span className="font-bold">Valor UF Hoy:</span>
                        <span className="font-mono">$ {ufValue.toLocaleString('es-CL')}</span>
                    </div>
                </div>
            )}

            <div className="mt-2 bg-gray-900 text-white p-6 rounded-xl flex justify-between items-center shadow-lg">
                <div>
                    <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Total finiquito</p>
                    <p className="text-xs text-gray-500">Sujeto a revisión final y deducciones</p>
                </div>
                <p className="text-3xl font-bold font-mono">$ {Math.round(totalSettlement).toLocaleString('es-CL')}</p>
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
                GENERAR DOCUMENTO
            </button>
        </div>

      </main>
    </div>
  );
};

export default CrearFiniquito;
