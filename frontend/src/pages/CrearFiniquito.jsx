import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import * as XLSX from "xlsx";
import Sidebar from "../components/Sidebar";
import FiniquitosService from "../services/finiquitos.service";
import EmployeesService from "../services/employees.service";
import { getLicenciasByRut } from "../services/licencias";

// --- Helpers for variable bonus: period parsing, filled months, license overlap ---
function parsePeriodo(periodoStr) {
  if (!periodoStr || typeof periodoStr !== "string") return null;
  const s = periodoStr.trim();
  const dash = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (dash) return { month: parseInt(dash[1], 10), year: parseInt(dash[2], 10) };
  if (s.length === 6 && /^\d{6}$/.test(s))
    return { month: parseInt(s.slice(0, 2), 10), year: parseInt(s.slice(2), 10) };
  const iso = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (iso) return { month: parseInt(iso[2], 10), year: parseInt(iso[1], 10) };
  return null;
}

function getMonthsInRange(minYear, minMonth, maxYear, maxMonth) {
  const out = [];
  let y = minYear;
  let m = minMonth;
  while (y < maxYear || (y === maxYear && m <= maxMonth)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function monthHasLicense(year, month, licencias) {
  if (!licencias || !licencias.length) return false;
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  return licencias.some((lic) => {
    const start = new Date(lic.fecha_inicio);
    const end = new Date(lic.fecha_fin);
    return end >= firstDay && start <= lastDay;
  });
}

function formatPeriodoDisplay(year, month) {
  return new Date(year, month - 1, 1)
    .toLocaleDateString("es-CL", { month: "2-digit", year: "numeric" })
    .replace("/", "-");
}

function getExpandedVariableGroups(
  variableItems,
  variableCustomAdditions,
  licencias,
  variableFilledActive
) {
  const groups = {};
  variableItems.forEach((item, idx) => {
    const key = item.concepto || "Sin Concepto";
    if (!groups[key]) groups[key] = [];
    const p = parsePeriodo(item.periodo);
    const hasLicense = p
      ? monthHasLicense(p.year, p.month, licencias)
      : false;
    groups[key].push({
      ...item,
      type: "fetched",
      originalIndex: idx,
      hasLicense,
    });
  });
  Object.keys(variableCustomAdditions || {}).forEach((key) => {
    if (!groups[key]) groups[key] = [];
    (variableCustomAdditions[key] || []).forEach((item, idx) => {
      const p = item.periodo && item.periodo !== "Manual"
        ? parsePeriodo(item.periodo)
        : null;
      const hasLicense = p
        ? monthHasLicense(p.year, p.month, licencias)
        : false;
      groups[key].push({
        ...item,
        concepto: key,
        type: "custom",
        originalIndex: idx,
        hasLicense,
      });
    });
  });

  Object.keys(groups).forEach((concepto) => {
    const items = groups[concepto];
    const existingMonths = new Set();
    items.forEach((it) => {
      const p = it.periodo && it.type !== "custom" ? parsePeriodo(it.periodo) : null;
      if (p) existingMonths.add(`${p.year}-${p.month}`);
    });
    let minY = Infinity,
      minM = 12,
      maxY = -Infinity,
      maxM = 1;
    items.forEach((it) => {
      const p = it.periodo && it.type !== "custom" ? parsePeriodo(it.periodo) : null;
      if (p) {
        if (p.year < minY || (p.year === minY && p.month < minM)) {
          minY = p.year;
          minM = p.month;
        }
        if (p.year > maxY || (p.year === maxY && p.month > maxM)) {
          maxY = p.year;
          maxM = p.month;
        }
      }
    });
    if (minY === Infinity) return;
    const range = getMonthsInRange(minY, minM, maxY, maxM);
    range.forEach(({ year, month }) => {
      const key = `${year}-${month}`;
      if (existingMonths.has(key)) return;
      const filledKey = `${concepto}-${year}-${month}`;
      const hasLic = monthHasLicense(year, month, licencias);
      const active =
        variableFilledActive[filledKey] !== undefined
          ? variableFilledActive[filledKey]
          : !hasLic;
      groups[concepto].push({
        type: "filled",
        concepto,
        periodo: formatPeriodoDisplay(year, month),
        monto: 0,
        year,
        month,
        filledKey,
        active,
        hasLicense: hasLic,
      });
    });
    groups[concepto].sort((a, b) => {
      const pa = a.year && a.month ? { year: a.year, month: a.month } : parsePeriodo(a.periodo);
      const pb = b.year && b.month ? { year: b.year, month: b.month } : parsePeriodo(b.periodo);
      if (!pa || !pb) return 0;
      if (pa.year !== pb.year) return pa.year - pb.year;
      return pa.month - pb.month;
    });
  });

  return groups;
}

const VALID_VARIABLE_MONTHS_REQUIRED = 3;

function getItemPeriodForSort(item) {
  if (item.year != null && item.month != null)
    return { year: item.year, month: item.month };
  return parsePeriodo(item.periodo);
}

function calculateTotalFromExpandedGroups(groups) {
  return Object.values(groups).reduce((total, groupItems) => {
    // Valid months: active and no license (include filled with 0)
    const validItems = groupItems.filter(
      (i) => i.active !== false && !i.hasLicense
    );
    if (validItems.length === 0) return total;
    // Sort by period descending (most recent first) and take up to 3
    const sorted = [...validItems].sort((a, b) => {
      const pa = getItemPeriodForSort(a);
      const pb = getItemPeriodForSort(b);
      if (!pa || !pb) return 0;
      if (pa.year !== pb.year) return pb.year - pa.year;
      return pb.month - pa.month;
    });
    const toUse = sorted.slice(0, VALID_VARIABLE_MONTHS_REQUIRED);
    const groupSum = toUse.reduce(
      (sum, item) => sum + (parseFloat(item.monto) || 0),
      0
    );
    const groupAvg = groupSum / toUse.length;
    return total + groupAvg;
  }, 0);
}

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
  const [vacationDaysManuallyEdited, setVacationDaysManuallyEdited] =
    useState(false);
  const [vacationValue, setVacationValue] = useState(0);
  const [salary, setSalary] = useState(0);
  const [variableBonus, setVariableBonus] = useState(0);
  const [yearsOfService, setYearsOfService] = useState(0);
  const [yearsForIndemnity, setYearsForIndemnity] = useState(0);
  const [movilizacion, setMovilizacion] = useState(40000);
  const [liquidacionMesActual, setLiquidacionMesActual] = useState(0);
  const [descuentos, setDescuentos] = useState("");
  const [aporteCesantia, setAporteCesantia] = useState("");
  const [selectedManager, setSelectedManager] = useState("");

  // Manager options
  const managers = [
    {
      id: "jcarcamo",
      name: "Juan Heriberto Cárcamo Catalan",
      title: "Gerente de Producción y Logística",
      company: "Carlos Cramer Productos Aromáticos S.A.C.I.",
    },
    {
      id: "mberndt",
      name: "Miguel Andres Berndt Briceño",
      title: "Gerente General",
      company: "Carlos Cramer Productos Aromáticos S.A.C.I.",
    },
    {
      id: "dmisraji",
      name: "Deborah Lissete Misraji Vaizer",
      title: "Gerente de Personas y SSGG",
      company: "Carlos Cramer Productos Aromáticos S.A.C.I.",
    },
    {
      id: "ccisternas",
      name: "Claudia Cisternas Flores",
      title: "Líder de Administración de Personal",
      company: "Carlos Cramer Productos Aromáticos S.A.C.I.",
    },
  ];

  // Items for calculation
  const [items, setItems] = useState([]);
  const [licencias, setLicencias] = useState([]);
  const [variableItems, setVariableItems] = useState([]);
  const [descuentosItems, setDescuentosItems] = useState([]); // Automatic deductions from backend
  const [descuentosPersonalizados, setDescuentosPersonalizados] = useState([]); // Custom added discounts
  const [variableCustomAdditions, setVariableCustomAdditions] = useState({}); // Custom manual additions for variable bonus: { [concepto]: [{ id, descripcion, amount, active }] }
  const [variableFilledActive, setVariableFilledActive] = useState({}); // Active state for filled (zero) months per concepto: { "Concepto-YYYY-MM": boolean }
  const [variableGroupsCollapsed, setVariableGroupsCollapsed] = useState({}); // Collapse state per group: { [concepto]: true } = collapsed
  const [licenciasTableCollapsed, setLicenciasTableCollapsed] = useState(false); // Collapse state for Licencias recientes table
  const [licenciasLimit, setLicenciasLimit] = useState(15); // TOP N (5, 10, 15, 20, 30, 50)
  const [licenciasOrder, setLicenciasOrder] = useState("desc"); // 'desc' = más recientes primero, 'asc' = ascendente
  const [newCustomItems, setNewCustomItems] = useState({}); // Temporary state for new manual item inputs per concept: { [concepto]: { description: '', amount: '' } }
  const [ufValue, setUfValue] = useState(0); // Valor UF del día
  const [isLoadingUf, setIsLoadingUf] = useState(false);
  const [isLoadingVacation, setIsLoadingVacation] = useState(false); // Loading state for vacation days API

  // Helper to recalculate total variable bonus based on current items and custom additions
  const calculateTotalVariableBonus = (
    currentItems,
    currentCustomAdditions,
  ) => {
    // 1. Group fetched items by concept
    const groups = currentItems.reduce((acc, item, idx) => {
      const key = item.concepto || "Sin Concepto";
      if (!acc[key]) acc[key] = [];
      acc[key].push({ ...item, type: "fetched", originalIndex: idx });
      return acc;
    }, {});

    // 2. Merge with custom additions
    if (currentCustomAdditions) {
      Object.keys(currentCustomAdditions).forEach((key) => {
        if (!groups[key]) groups[key] = [];
        const additions = currentCustomAdditions[key] || [];
        // Add custom items to the group
        additions.forEach((item, idx) => {
          groups[key].push({
            ...item,
            concepto: key,
            type: "custom",
            originalIndex: idx,
          });
        });
      });
    }

    // 3. Calculate average for each group and sum them up
    // Rule: Average = Sum of ACTIVE items / Count of ACTIVE items
    // If no active items in a group, average is 0.
    const sumOfAverages = Object.values(groups).reduce((total, groupItems) => {
      const activeItems = groupItems.filter((i) => i.active !== false); // Default true if undefined
      if (activeItems.length === 0) return total;

      const groupSum = activeItems.reduce(
        (sum, item) => sum + (parseFloat(item.monto) || 0),
        0,
      );
      const groupAvg = groupSum / activeItems.length;

      return total + groupAvg;
    }, 0);

    return Math.round(sumOfAverages);
  };

  // Grupos expandidos memoizados (evita recalcular en cada render)
  const expandedVariableGroups = useMemo(
    () =>
      getExpandedVariableGroups(
        variableItems,
        variableCustomAdditions,
        licencias,
        variableFilledActive
      ),
    [variableItems, variableCustomAdditions, licencias, variableFilledActive]
  );

  // Recalculate variable bonus when expanded groups change
  useEffect(() => {
    if (variableItems.length === 0 && Object.keys(variableCustomAdditions).length === 0) {
      setVariableBonus(0);
      return;
    }
    const total = Math.round(calculateTotalFromExpandedGroups(expandedVariableGroups));
    setVariableBonus(total);
  }, [variableItems, variableCustomAdditions, expandedVariableGroups]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1) Items y licencias en paralelo (las dos peticiones más pesadas)
        const [data, employeeLicencias] = await Promise.all([
          FiniquitosService.getItemsByRut(rut),
          getLicenciasByRut(rut, {
            limit: licenciasLimit,
            order: licenciasOrder,
          }).catch((err) => {
            console.error("Error fetching licenses:", err);
            return [];
          }),
        ]);

        const sortedLicencias = Array.isArray(employeeLicencias)
          ? employeeLicencias
          : [];
        setLicencias(sortedLicencias);

        if (Array.isArray(data) && data.length > 0) {
          const empData = data[0];
          setEmployee(empData);
          setItems(data);
          setVacationValue(0);

          // 2) Vacaciones y sueldo base en paralelo
          const [vacationResult, sueldoResult] = await Promise.allSettled([
            EmployeesService.getVacationsAvailable(rut),
            EmployeesService.getSueldoBase(rut),
          ]);

          if (vacationResult.status === "fulfilled" && vacationResult.value?.total_dias_disponibles != null) {
            const rawDays = vacationResult.value.total_dias_disponibles;
            setVacationDaysStock(rawDays);
            setVacationDays(rawDays);
          } else {
            setVacationDaysStock(0);
            setVacationDays(0);
          }

          const baseSalaryItem = data.find((i) => i.concepto === "Sueldo Base")?.monto || 0;
          if (sueldoResult.status === "fulfilled" && sueldoResult.value?.base_wage) {
            setSalary(sueldoResult.value.base_wage);
          } else {
            setSalary(baseSalaryItem > 0 ? baseSalaryItem : 2050000);
          }

          // Filter variable bonuses from the same dataset
          const excludedConceptos = [
            "Bono Empresa",
            "Bono Navidad",
            "Bono Fiestas Patrias",
          ];
          const varData = data.filter(
            (item) =>
              item.income_type === "remuneracion_variable" ||
              (item.income_type === "remuneracion_ocasional" &&
                !excludedConceptos.includes(item.concepto)) ||
              (item.income_type === "remuneracion_fija" &&
                (item.concepto === "Bono Supervisores Noche" ||
                  item.concepto === "Bono Jefe Área Contingencia")),
          );

          if (varData.length > 0) {
            const mappedVarData = varData.map((item, idx) => {
              const p = parsePeriodo(item.periodo);
              const active =
                p && sortedLicencias.length > 0
                  ? !monthHasLicense(p.year, p.month, sortedLicencias)
                  : true;
              return {
                ...item,
                active,
                originalIndex: idx,
              };
            });
            setVariableItems(mappedVarData);
          } else {
            setVariableItems([]);
            setVariableBonus(0);
          }
        }

        // 3) UF y descuentos en paralelo (no dependen de data)
        try {
          const [ufResult, descuentosData] = await Promise.all([
            FiniquitosService.getIndicatorUF().catch(() => 0),
            FiniquitosService.getDescuentosByRut(rut).catch(() => []),
          ]);
          setUfValue(ufResult || 0);

          if (!location.state?.preserveData) {
            const mappedDescuentos = (descuentosData || []).map((item) => {
              let desc = item.concepto || "";
              // Normalize backend strings to match frontend options exact spelling/casing
              if (desc === "Prestamo Interno") desc = "Préstamo Interno"; // Add accent
              if (desc === "Descuento Por Planilla")
                desc = "Descuento por planilla"; // Lowercase 'p'

              return {
                descripcion: desc,
                detalle: item.detalle || "", // Map detailed description
                monto: item.monto || 0,
                cuotas: 1, // Default cuotas
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
  }, [rut, licenciasLimit, licenciasOrder]);

  // Restaurar datos del formulario cuando se navega de vuelta desde el visualizador
  useEffect(() => {
    if (location.state?.preserveData) {
      const savedData = sessionStorage.getItem(`finiquito_${rut}`);
      if (savedData) {
        const data = JSON.parse(savedData);
        // Restaurar valores del formulario
        if (data.lastDayWork) setLastDayWork(data.lastDayWork);
        if (data.terminationReason)
          setTerminationReason(data.terminationReason);
        if (data.noticeGiven !== undefined) setNoticeGiven(data.noticeGiven);
        if (data.selectedManager?.id)
          setSelectedManager(data.selectedManager.id);
        if (data.vacationDays) setVacationDays(data.vacationDays);
        if (data.yearsForIndemnity)
          setYearsForIndemnity(data.yearsForIndemnity);
        // Restaurar descuentos personalizados si existen
        if (data.descuentosPersonalizados)
          setDescuentosPersonalizados(data.descuentosPersonalizados);
        if (data.aporteCesantia) setAporteCesantia(data.aporteCesantia);
        if (data.ufValue) setUfValue(data.ufValue); // Restore stored UF
        console.log("Datos del formulario restaurados desde sessionStorage");
      }
    }
  }, [location.state, rut]);

  // Helper function: Parse date string as local date (avoids UTC timezone issues)
  // When parsing "2026-02-02", JS interprets as UTC midnight, which becomes previous day in local time
  const parseLocalDate = (dateString) => {
    const [year, month, day] = dateString.split("-").map(Number);
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

  // Helper function: Helper function: Check if a date is a business day (Monday-Friday)
  // Also checks specific Chilean holidays for 2026
  const isBusinessDay = (date) => {
    const day = date.getDay();
    // 0 = Sunday, 6 = Saturday
    if (day === 0 || day === 6) return false;

    // Check specific holidays (YYYY-MM-DD)
    // Month is 0-indexed in JS Date, but we formatted strings as 01-12
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const dayOfMonth = String(date.getDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${dayOfMonth}`;

    // Feriados Chile 2026
    const HOLIDAYS_2026 = [
      "2026-01-01", // Año Nuevo
      "2026-04-03", // Viernes Santo
      "2026-04-04", // Sábado Santo
      "2026-05-01", // Día del Trabajo
      "2026-05-21", // Día de las Glorias Navales
      "2026-06-21", // Día Nacional de los Pueblos Indígenas
      "2026-06-29", // San Pedro y San Pablo
      "2026-07-16", // Día de la Virgen del Carmen
      "2026-08-15", // Asunción de la Virgen
      "2026-09-18", // Independencia Nacional
      "2026-09-19", // Día de las Glorias del Ejército
      "2026-10-12", // Encuentro de Dos Mundos
      "2026-10-31", // Día de las Iglesias Evangélicas
      "2026-11-01", // Día de Todos los Santos
      "2026-12-08", // Inmaculada Concepción
      "2026-12-25", // Navidad
    ];

    return !HOLIDAYS_2026.includes(dateString);
  };

  // Helper function:  // State for salary history
  const [salaryHistory, setSalaryHistory] = useState([]);
  const [averageSalary, setAverageSalary] = useState(0);
  const [isLoadingSalaryHistory, setIsLoadingSalaryHistory] = useState(false);

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
    const diasCorridos =
      diasInhabilesInicio +
      diasCorridosEnteros +
      diasInhabilesExtra +
      decimalDays;

    console.log("=== CÁLCULO DÍAS CORRIDOS ===");
    console.log(
      "Fecha de término (último día trabajo):",
      startDate.toLocaleDateString("es-CL"),
      "(" +
        ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][startDate.getDay()] +
        ")",
    );
    console.log("Días pendientes vacaciones:", availableDays);
    console.log(
      "Parte entera:",
      integerDays,
      "| Decimal:",
      decimalDays.toFixed(2),
    );
    console.log(
      "Fecha día siguiente término:",
      trueStartDate.toLocaleDateString("es-CL"),
      "(" +
        ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][
          trueStartDate.getDay()
        ] +
        ")",
    );
    console.log(
      "Días inhábiles ANTES del primer día hábil:",
      diasInhabilesInicio,
    );
    console.log(
      "Fecha INICIO conteo vacaciones (primer día hábil):",
      firstBusinessDate.toLocaleDateString("es-CL"),
      "(" +
        ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][
          firstBusinessDate.getDay()
        ] +
        ")",
    );
    console.log(
      "Fecha FIN días hábiles:",
      lastBusinessDate.toLocaleDateString("es-CL"),
      "(" +
        ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][
          lastBusinessDate.getDay()
        ] +
        ")",
    );
    console.log(
      "Días corridos enteros (calendario hábil):",
      diasCorridosEnteros,
    );
    console.log("Días inhábiles extra (decimal > 0.2):", diasInhabilesExtra);
    console.log("Decimal:", decimalDays.toFixed(2));
    console.log(
      "DÍAS CORRIDOS TOTAL:",
      diasCorridos.toFixed(2),
      "= ",
      diasInhabilesInicio,
      "+",
      diasCorridosEnteros,
      "+",
      diasInhabilesExtra,
      "+",
      decimalDays.toFixed(2),
    );
    console.log("=============================");

    return diasCorridos;
  };

  // Handler to fetch salary history
  const handleFetchSalaryHistory = async () => {
    if (!rut) return;

    setIsLoadingSalaryHistory(true);
    try {
      const history = await EmployeesService.getSalaryHistory(rut, lastDayWork);
      console.log("Salary History Fetch:", history);
      setSalaryHistory(history);

      // Calculate average
      if (history.length > 0) {
        const total = history.reduce(
          (sum, item) => sum + Number(item.amount || 0),
          0,
        );
        const avg = Math.round(total / history.length);
        console.log(
          "Calculated Average:",
          avg,
          "from total:",
          total,
          "items:",
          history.length,
        );
        setAverageSalary(avg);
      } else {
        console.log("No salary history items found.");
        setAverageSalary(0);
      }
    } catch (error) {
      console.error("Error fetching salary history:", error);
    } finally {
      setIsLoadingSalaryHistory(false);
    }
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
          lastDayWork || null,
        );
        const rawDays = vacationData.total_dias_disponibles || 0;

        // Update both stock (initial value without date) and current value
        if (!lastDayWork) {
          setVacationDaysStock(rawDays);
        }
        setVacationDays(rawDays);

        console.log("=== VACACIONES DESDE API ===");
        console.log("Fecha de término:", lastDayWork || "Sin fecha");
        console.log("Días disponibles:", rawDays);
        console.log("============================");
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
      const diasCorridos = calculateDiasCorridos(
        parseLocalDate(lastDayWork),
        vacationDays,
      );

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

        // Calculate Indemnity Years (New Rules):
        // 1. < 1 year: 0
        // 2. >= 1 year: Apply strict 6 months + 1 day rule for rounding.
        //    (Months 1-5 round down. > 6 months round up).

        let indemnityYears = 0;

        // precise full years calculation
        let y = end.getFullYear() - start.getFullYear();
        let m = end.getMonth() - start.getMonth();
        let d = end.getDate() - start.getDate();

        if (m < 0 || (m === 0 && d < 0)) {
          y--;
        }

        if (y < 1) {
          indemnityYears = 0;
        } else {
          // We have at least 1 full year. Current base is 'y'.
          // Check if we have exceeded 6 months and 1 day past the anniversary.

          // Construct the 6-month threshold date relative to the last anniversary
          const thresholdDate = new Date(start.getTime());
          thresholdDate.setFullYear(thresholdDate.getFullYear() + y);
          thresholdDate.setMonth(thresholdDate.getMonth() + 6);

          // If endDate is strictly after the 6-month threshold, round up.
          // Note: end > threshold implies we have passed the 6-month mark (at least 1 day or millisecond).
          if (end > thresholdDate) {
            indemnityYears = y + 1;
          } else {
            indemnityYears = y;
          }
        }
        setYearsForIndemnity(indemnityYears);
      }
    } else if (employee?.duracion_empresa) {
      // Fallback to initial value if no date selected yet
      setYearsOfService(employee.duracion_empresa);
      setYearsForIndemnity(Math.floor(employee.duracion_empresa));
    }
  }, [lastDayWork, employee]);

  // ── AUDITORÍA DE CÁLCULO (EXCEL) ───────────────────────────────────────────
  // Genera y descarga un archivo Excel con los parámetros del finiquito en las
  // filas indicadas (columna A = etiqueta, columna B = valor). Se llama al
  // momento de generar el documento.
  const downloadAuditFile = ({
    causalLabel,
    managerName,
    haberes,
    gratificacion,
    noticeIndemnityResult,
    yearsIndemnityResult,
    vacationIndemnityResult,
    vacationCalendarDays,
    liquidacionMesActual,
    otrosDescuentos,
    aporteCesantiaVal,
    totalSettlementResult,
  }) => {
    const fmt = (n) => `$ ${Math.round(n).toLocaleString("es-CL")}.-`;
    const fmtNum = (n) => Math.round(Number(n) || 0);

    const ws = {};
    // Columna A = etiqueta, Columna B = valor
    const setRow = (row, label, value) => {
      ws[`A${row}`] = { t: "s", v: label };
      const hasValue = value !== undefined && value !== null && value !== "";
      const isNum = typeof value === "number";
      if (hasValue || value === 0) {
        ws[`B${row}`] = isNum ? { t: "n", v: value } : { t: "s", v: String(value ?? "") };
      } else {
        ws[`B${row}`] = { t: "s", v: "" };
      }
    };

    setRow(2, "Causal de término del contrato", causalLabel || "");
    setRow(4, "Nombre trabajador", employee?.nombre_trabajador || "");
    setRow(5, "Cargo del trabajador", employee?.cargo || "");
    setRow(9, "Fecha de ingreso del trabajador", employee?.fecha_ingreso || "");
    setRow(10, "Fecha de salida", lastDayWork || "");
    // Calcular duración exacta en "Años, meses y días" usando lastDayWork y fecha_ingreso
    const formatYearsMonthsDays = (startDate, endDate) => {
      if (!startDate || !endDate) return "";
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start) || isNaN(end)) return "";
      let years = end.getFullYear() - start.getFullYear();
      let months = end.getMonth() - start.getMonth();
      let days = end.getDate() - start.getDate();

      if (days < 0) {
        // Borrow days from previous month
        months -= 1;
        const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
        days += prevMonth.getDate();
      }
      if (months < 0) {
        years -= 1;
        months += 12;
      }
      let result = [];
      if (years > 0) result.push(`${years} año${years > 1 ? 's' : ''}`);
      if (months > 0) result.push(`${months} mes${months > 1 ? 'es' : ''}`);
      if (days > 0) result.push(`${days} día${days > 1 ? 's' : ''}`);
      return result.length ? result.join(', ') : "0 días";
    };
    setRow(
      11,
      "Duración empresa",
      employee?.fecha_ingreso && lastDayWork
        ? formatYearsMonthsDays(employee.fecha_ingreso, lastDayWork)
        : ""
    );
    setRow(15, "Sueldo base del trabajador", fmtNum(salary));
    setRow(16, "Promedio remuneración variable", fmtNum(variableBonus));
    setRow(17, "Gratificación legal", fmtNum(gratificacion));
    setRow(18, "Movilización", fmtNum(movilizacion));
    setRow(20, "Total haber", fmtNum(haberes));

    // Indemnización por Años de Servicio (si corresponde)
    setRow(
      23,
      `Indemnización por Años de Servicio${yearsForIndemnity != null ? ` (${yearsForIndemnity})` : ""}`,
      yearsIndemnityResult != null && yearsIndemnityResult > 0 ? fmtNum(yearsIndemnityResult) : ""
    );

    // Vacaciones pendientes: en columna A solo "Vacaciones pendientes (X.X días)" para que quepa la leyenda; en B el monto
    const vacacionesDiasStr =
      vacationCalendarDays != null && vacationCalendarDays > 0
        ? ` (${Number(vacationCalendarDays).toFixed(1)} días)`
        : "";
    const vacacionesVal = vacationIndemnityResult != null && vacationIndemnityResult > 0 ? fmt(vacationIndemnityResult) : "";
    setRow(24, `Vacaciones pendientes${vacacionesDiasStr}`, vacacionesVal || "");

    // Mes de aviso (si corresponde)
    setRow(25, "Mes de aviso", noticeIndemnityResult != null && noticeIndemnityResult > 0 ? fmtNum(noticeIndemnityResult) : "");

    // Remuneración adeudada (si corresponde)
    setRow(26, "Remuneración adeudada", liquidacionMesActual != null && Number(liquidacionMesActual) > 0 ? fmtNum(liquidacionMesActual) : "");

    // Otros descuentos (si corresponde)
    setRow(27, "Otros descuentos", otrosDescuentos != null && otrosDescuentos > 0 ? `-${fmtNum(otrosDescuentos)}` : "");

    // Aporte Empleador Seguro Cesantía (si corresponde)
    setRow(28, "Aporte Empleador Seguro Cesantía", aporteCesantiaVal != null && aporteCesantiaVal > 0 ? `-${fmtNum(aporteCesantiaVal)}` : "");

    setRow(30, "Total a pagar", fmtNum(totalSettlementResult));

    ws["!ref"] = "A2:B30";
    ws["!cols"] = [{ wch: 38 }, { wch: 24 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Finiquito");
    XLSX.writeFile(wb, `auditoria_finiquito_${employee?.rut_trabajador || "rut"}_${lastDayWork || "fecha"}.xlsx`);
  };
  // ── FIN AUDITORÍA ─────────────────────────────────────────────────────────


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
  const topeGratificacion = (4.75 / 12) * sueldoMinimo;
  const gratificacionLegal = Math.min(
    (salary + variableBonus) * 0.25,
    topeGratificacion,
  );

  // Total Haberes = Sueldo Base + Promedio Bonificaciones + Gratificación Legal + Movilización
  const totalHaberes =
    salary + variableBonus + gratificacionLegal + movilizacion;

  // 1. Vacation Indemnity = (Sueldo Base + Total Bonificaciones / 30) * días corridos
  // vacationValue ya está calculado en el useEffect con la fórmula de días corridos
  // Aplica para: necesidades_empresa (Sí), mutuo_acuerdo (caso a caso), mutuo_acuerdo_especial (como necesidades), no_concurrencia (Sí), renuncia (Sí)
  const vacationApplies =
    terminationReason === "necesidades_empresa" ||
    terminationReason === "mutuo_acuerdo" ||
    terminationReason === "mutuo_acuerdo_especial" ||
    terminationReason === "no_concurrencia" ||
    terminationReason === "renuncia";
  const vacationIndemnity = vacationApplies ? vacationValue : 0;

  // 2. Years of Service Indemnity = Total Haberes * años de indemnización
  // Si tiene menos de 1 año (antigüedad real), no tiene indemnización por años de servicio
  // Aplica para: necesidades_empresa (Sí), mutuo_acuerdo (caso a caso), mutuo_acuerdo_especial (mismo cálculo que necesidades_empresa)
  // NO aplica para: no_concurrencia (No), renuncia (No)
  const yearsIndemnityApplies =
    terminationReason === "necesidades_empresa" ||
    terminationReason === "mutuo_acuerdo" ||
    terminationReason === "mutuo_acuerdo_especial";

  let yearsIndemnity = 0;
  if (yearsIndemnityApplies && yearsOfService >= 1) {
    if (terminationReason === "mutuo_acuerdo" && employee?.fecha_nacimiento) {
      // Mutuo Acuerdo Special Rules
      const birthDate = new Date(employee.fecha_nacimiento);
      const ageDiffMs = Date.now() - birthDate.getTime();
      const ageDate = new Date(ageDiffMs);
      const age = Math.abs(ageDate.getUTCFullYear() - 1970);

      const years = yearsForIndemnity;
      // Base Salary: Use average of last 48 salaries if available, else current total haberes fallback
      // Rule says "Promedio de últimos 48 sueldos base".
      let baseAmount = averageSalary > 0 ? averageSalary : salary || 0;

      const cap90UF = (ufValue || 0) * 90;

      // Rule 4: 65 years old (no caps)
      if (age >= 65) {
        yearsIndemnity = baseAmount * years;
      }
      // Rule 1: 4 to 20 years
      else if (years >= 4 && years < 20) {
        const cappedBase =
          cap90UF > 0 && baseAmount > cap90UF ? cap90UF : baseAmount;
        const cappedYears = Math.min(years, 11);
        yearsIndemnity = cappedBase * cappedYears;
      }
      // Rule 2: 20 to 25 years
      else if (years >= 20 && years < 25) {
        const cappedBase =
          cap90UF > 0 && baseAmount > cap90UF ? cap90UF : baseAmount;
        const cappedYears = Math.min(years, 16);
        yearsIndemnity = cappedBase * cappedYears;
      }
      // Rule 3: More than 25 years (no caps)
      else if (years >= 25) {
        yearsIndemnity = baseAmount * years;
      }
      // Fallback for < 4 years or other cases
      else {
        // Standard rule: Years * TotalHaberes (or maybe Base? The prompt is ambiguous but usually standard is TotalHaberes)
        // However, user prompt says "Promedio de últimos 48 sueldos base" is the key.
        // Let's stick to standard Total Haberes for < 4 years unless specified otherwise.
        yearsIndemnity = years * totalHaberes;
      }

      console.log("Mutuo Acuerdo Calc:", {
        age,
        years,
        baseAmount,
        cap90UF,
        result: yearsIndemnity,
      });
    } else {
      // Standard Calculation (Necesidades de la Empresa or Mutuo w/o special data)
      yearsIndemnity = yearsForIndemnity * totalHaberes;
    }
  }

  // 3. Notice Month = Total Haberes (si no se dio aviso de 30 días)
  // Aplica para: necesidades_empresa (Sí), mutuo_acuerdo (caso a caso), mutuo_acuerdo_especial (como necesidades)
  // NO aplica para: no_concurrencia (No), renuncia (No)
  const noticeIndemnityApplies =
    terminationReason === "necesidades_empresa" ||
    terminationReason === "mutuo_acuerdo" ||
    terminationReason === "mutuo_acuerdo_especial";
  const noticeIndemnity =
    noticeIndemnityApplies && !noticeGiven ? totalHaberes : 0;

  // Total Settlement = (Mes de Aviso + Indemnización por Años de Servicio + Vacaciones Proporcionales) - Todos los Descuentos
  const descuentosNum = parseFloat(descuentos) || 0;
  const aporteCesantiaNum = parseFloat(aporteCesantia) || 0;
  const descuentosAutomaticos = descuentosItems.reduce(
    (sum, d) => sum + (d.monto || 0),
    0,
  );

  // Custom discount calculation with UF support for "Préstamo Interno"
  const descuentosCustom = descuentosPersonalizados.reduce((sum, d) => {
    let monto = parseFloat(d.monto) || 0;
    const cuotas = parseInt(d.cuotas) || 1;

    // If it's a loan, backend usually sends UF value. We need to convert it to CLP for the monthly deduction if desired.
    // However, usually the 'monto' received is the quota in UF.
    // User request: "el valor de la UF del día y que se multiplique por el valor del concepto 'Préstamo interno'?"
    if (d.descripcion === "Préstamo Interno" && ufValue > 0) {
      // Assume 'monto' is in UF
      // Calculate Total Debt in CLP = Monto(UF) * UF_Value * Cuotas
      // Note: We use Math.round just once at the end if preferred, or per item.
      monto = Math.round(monto * ufValue);
    }

    // Multiply by installments (Total Debt)
    return sum + monto * cuotas;
  }, 0);

  const totalDescuentos =
    descuentosNum +
    aporteCesantiaNum +
    descuentosAutomaticos +
    descuentosCustom;
  const liquidacionMesActualNum = parseFloat(liquidacionMesActual) || 0;
  const totalSettlement =
    noticeIndemnity +
    yearsIndemnity +
    vacationIndemnity +
    liquidacionMesActualNum -
    totalDescuentos;

  // Handle generate document - navigate to visualizer with all data
  const handleGenerate = () => {
    console.log("handleGenerate called");

    // Validar que se hayan completado los campos requeridos
    if (!lastDayWork) {
      alert("Por favor seleccione la fecha de término del contrato");
      return;
    }
    if (!terminationReason) {
      alert("Por favor seleccione la causal de término");
      return;
    }

    // Find selected manager object
    const managerObj =
      managers.find((m) => m.id === selectedManager) || managers[0];

    // Prepare finiquito data to pass to visualizer
    const finiquitoData = {
      // Employee info
      employeeData: employee,

      // Form state to preserve on back navigation
      terminationReason,
      noticeGiven,

      // Dates
      lastDayWork,
      notaryDate: new Date(
        new Date(lastDayWork).getTime() + 3 * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .split("T")[0],

      // Manager
      selectedManager: managerObj,

      // Haberes
      noticeIndemnity: Math.round(noticeIndemnity),
      yearsIndemnity: Math.round(yearsIndemnity),
      vacationIndemnity: Math.round(vacationIndemnity),
      totalHaberes: Math.round(totalHaberes),
      yearsForIndemnity,
      vacationDays,
      vacationCalendarDays: lastDayWork
        ? calculateDiasCorridos(parseLocalDate(lastDayWork), vacationDays)
        : 0,
      liquidacionMesActual: parseFloat(liquidacionMesActual) || 0,

      // Descuentos - find specific types
      aporteCesantia: aporteCesantiaNum,
      // For loan, check if we need to send CLP or UF. Usually visualizer expects CLP.
      prestamoInterno: (() => {
        const loanItem = descuentosPersonalizados.find((d) =>
          d.descripcion?.toLowerCase().includes("préstamo"),
        );
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

      // Total - Sum of rounded components to match Visualizer display
      totalSettlement:
        Math.round(noticeIndemnity) +
        Math.round(yearsIndemnity) +
        Math.round(vacationIndemnity) +
        (parseFloat(liquidacionMesActual) || 0) -
        Math.round(totalDescuentos),
    };

    // Guardar datos en sessionStorage para preservarlos al volver
    sessionStorage.setItem(`finiquito_${rut}`, JSON.stringify(finiquitoData));

    // Descargar archivo Excel de auditoría de cálculo
    const sueldoMinimo = 539000;
    const topeGrat = (4.75 / 12) * sueldoMinimo;
    const gratificacion = Math.min((salary + variableBonus) * 0.25, topeGrat);
    const haberes = salary + variableBonus + gratificacion + movilizacion;
    const causalLabels = {
      necesidades_empresa: "Art. 161 - Necesidades de la empresa",
      mutuo_acuerdo: "Art. 159 N°1 - Mutuo acuerdo",
      mutuo_acuerdo_especial: "Mutuo acuerdo especial",
      no_concurrencia: "Art. 160 N°3 - No concurrencia injustificada",
      renuncia: "Art. 159 N°2 - Renuncia voluntaria",
    };
    const otrosDescuentos = Math.max(0, Math.round(totalDescuentos) - aporteCesantiaNum);
    downloadAuditFile({
      causalLabel: causalLabels[terminationReason] || terminationReason || "",
      managerName: managerObj?.name || "",
      haberes,
      gratificacion,
      noticeIndemnityResult: Math.round(noticeIndemnity),
      yearsIndemnityResult: Math.round(yearsIndemnity),
      vacationIndemnityResult: Math.round(vacationIndemnity),
      vacationCalendarDays: finiquitoData.vacationCalendarDays ?? (lastDayWork ? calculateDiasCorridos(parseLocalDate(lastDayWork), vacationDays) : 0),
      liquidacionMesActual: parseFloat(liquidacionMesActual) || 0,
      otrosDescuentos: otrosDescuentos > 0 ? otrosDescuentos : 0,
      aporteCesantiaVal: aporteCesantiaNum,
      totalSettlementResult: Math.round(noticeIndemnity) + Math.round(yearsIndemnity) + Math.round(vacationIndemnity) + (parseFloat(liquidacionMesActual) || 0) - Math.round(totalDescuentos),
    });

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
            <span
              className="cursor-pointer hover:text-blue-600"
              onClick={() => navigate("/finiquitos")}
            >
              Home
            </span>
            <span className="material-symbols-outlined text-xs">
              chevron_right
            </span>
            <span>Empleados</span>
            <span className="material-symbols-outlined text-xs">
              chevron_right
            </span>
            <span>{employee.nombre_trabajador}</span>
            <span className="material-symbols-outlined text-xs">
              chevron_right
            </span>
            <span className="font-semibold text-gray-900">
              Generador finiquito
            </span>
          </div>

          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Generador finiquito
              </h1>
              <p className="text-gray-500 mt-1">
                Formulario de generación de finiquito
              </p>
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
              <h2 className="text-xl font-bold text-gray-900">
                {employee.nombre_trabajador}
              </h2>
              <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                <span className="font-mono">
                  RUT: {employee.rut_trabajador}
                </span>
                <span>•</span>
                <span className="text-blue-600 font-medium">
                  {employee.cargo}
                </span>
                <span>•</span>
                <span>{employee.nombre_area || "Engineering Dept"}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">
              FECHA INICIO
            </p>
            <p className="font-semibold text-gray-900">
              {new Date(employee.fecha_ingreso).toLocaleDateString("es-CL", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        {/* Termination Details */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <span className="material-symbols-outlined">gavel</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              Detalles de término
            </h3>
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
                <option value="necesidades_empresa">
                  Art. 161 - Necesidades de la empresa
                </option>
                <option value="mutuo_acuerdo">
                  Art. 159 N°1 - Mutuo acuerdo
                </option>
                <option value="mutuo_acuerdo_especial">
                  Mutuo acuerdo especial
                </option>
                <option value="no_concurrencia">
                  Art. 160 N°3 - No concurrencia injustificada
                </option>
                <option value="renuncia">
                  Art. 159 N°2 - Renuncia voluntaria
                </option>
              </select>
              <p className="text-xs text-gray-400 mt-2">
                Esta selección determina la base de cálculo de la indemnización.
              </p>

              {/* Salary History Trigger for Mutuo Acuerdo */}
              {terminationReason === "mutuo_acuerdo" && (
                <div className="mt-4">
                  <button
                    onClick={handleFetchSalaryHistory}
                    disabled={isLoadingSalaryHistory}
                    className="flex items-center gap-2 text-sm text-blue-600 font-medium hover:text-blue-800 disabled:opacity-50"
                  >
                    {isLoadingSalaryHistory ? (
                      <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                    ) : (
                      <span className="material-symbols-outlined text-lg">
                        history
                      </span>
                    )}
                    Consultar últimos 48 sueldos
                  </button>

                  {/* Salary History Table */}
                  {salaryHistory.length > 0 && (
                    <div className="mt-3 border rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-3 py-2 border-b flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-700 uppercase">
                          Historial de Sueldos Base
                        </span>
                        <div className="flex gap-3">
                          <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                            Promedio: $
                            {Math.round(
                              salaryHistory.reduce(
                                (s, i) => s + (i.amount || 0),
                                0,
                              ) / salaryHistory.length,
                            ).toLocaleString("es-CL")}
                          </span>
                          <span className="text-xs text-gray-500">
                            {salaryHistory.length} registros
                          </span>
                        </div>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Periodo
                              </th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Monto
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-100">
                            {salaryHistory.map((item, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-gray-900 font-mono text-xs">
                                  {item.period}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-900 font-medium">
                                  ${(item.amount || 0).toLocaleString("es-CL")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-6 items-start">
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
                    <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                      30 días de aviso
                    </p>
                    <p className="text-xs text-gray-400">
                      Si no se marca, se agregará el mes de aviso.
                    </p>
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
              <p className="text-xs text-gray-400 mt-2">
                Este gerente aparecerá como firmante en el documento de
                finiquito.
              </p>
            </div>
          </div>
        </div>

        {/* Recent Licenses Table (collapsible, shows all 15 from backend) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
          <div
            className="flex items-center gap-2 mb-6 cursor-pointer select-none"
            onClick={() => setLicenciasTableCollapsed((c) => !c)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setLicenciasTableCollapsed((c) => !c);
              }
            }}
          >
            <button
              type="button"
              className="p-0.5 rounded hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
              onClick={(e) => {
                e.stopPropagation();
                setLicenciasTableCollapsed((c) => !c);
              }}
              title={licenciasTableCollapsed ? "Expandir tabla" : "Colapsar tabla"}
            >
              <span className="material-symbols-outlined text-xl">
                {licenciasTableCollapsed ? "expand_more" : "expand_less"}
              </span>
            </button>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <span className="material-symbols-outlined">
                medical_information
              </span>
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              Licencias recientes
            </h3>
            <span className="ml-auto px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
              {licencias.length} registro{licencias.length !== 1 ? "s" : ""}
            </span>
          </div>

          {!licenciasTableCollapsed && (
          <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <span>Mostrar últimos</span>
              <select
                value={licenciasLimit}
                onChange={(e) => setLicenciasLimit(Number(e.target.value))}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              >
                {[5, 10, 15, 20, 30, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-gray-400">registros</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <span>Orden</span>
              <select
                value={licenciasOrder}
                onChange={(e) => setLicenciasOrder(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              >
                <option value="desc">Más recientes primero</option>
                <option value="asc">Ascendente (más antiguas primero)</option>
              </select>
            </label>
          </div>
          {licencias.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
              <span className="material-symbols-outlined text-gray-300 text-4xl mb-2">
                event_busy
              </span>
              <p className="text-gray-500 font-medium">
                No se encontraron licencias
              </p>
              <p className="text-xs text-gray-400">
                Este empleado no tiene licencias registradas.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white shadow-sm z-10">
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 uppercase text-xs tracking-wider">
                      Razón
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 uppercase text-xs tracking-wider">
                      Fecha de inicio
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 uppercase text-xs tracking-wider">
                      Fecha de fin
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 uppercase text-xs tracking-wider">
                      Días
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 uppercase text-xs tracking-wider">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {licencias.map((lic, idx) => {
                    const startDate = new Date(lic.fecha_inicio);
                    const endDate = new Date(lic.fecha_fin);
                    const today = new Date();
                    const diffDays =
                      Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) +
                      1;
                    const isActive = today >= startDate && today <= endDate;
                    const isPast = today > endDate;

                    return (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <span className="font-medium text-gray-900">
                            {lic.tipo_permiso || "Sin especificar"}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-gray-600">
                          {startDate.toLocaleDateString("es-CL")}
                        </td>
                        <td className="py-3 px-4 font-mono text-gray-600">
                          {endDate.toLocaleDateString("es-CL")}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-gray-900">
                            {diffDays}
                          </span>
                          <span className="text-gray-400 ml-1">days</span>
                        </td>
                        <td className="py-3 px-4">
                          {isActive ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold uppercase rounded-full">
                              Active
                            </span>
                          ) : isPast ? (
                            <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-bold uppercase rounded-full">
                              Completed
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold uppercase rounded-full">
                              Scheduled
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </>
          )}
        </div>

        {/* Review Variable Bonuses (Collapsed for now or simplified) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
          <div className="flex justify-between items-center cursor-pointer">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <span className="material-symbols-outlined">payments</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                Resumen remuneración variable
              </h3>
            </div>
            <span className="material-symbols-outlined text-gray-400">
              expand_less
            </span>
          </div>
          <div className="mt-6 space-y-4">
            <p className="text-sm text-gray-500 mb-4">
              El promedio se calcula con los últimos 3 meses válidos por concepto
              (sin licencia; se incluyen meses con valor 0). Los meses sin asignación se muestran con $0.
              Los meses con licencia médica se deseleccionan por defecto.
            </p>
            {variableItems.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
                <span className="material-symbols-outlined text-gray-300 text-4xl mb-2">
                  money_off
                </span>
                <p className="text-gray-500 font-medium">
                  No se encontraron bonos
                </p>
                <p className="text-xs text-gray-400">
                  Este empleado no tiene bonos registrados.
                </p>
              </div>
            ) : (
              (() => {
                return Object.entries(expandedVariableGroups).map(([concepto, items]) => {
                  const allActive = items.every(
                    (item) => item.active !== false,
                  );
                  // Same as total: use up to 3 most recent valid months (no license; include filled with 0)
                  const validItems = items.filter(
                    (i) => i.active !== false && !i.hasLicense,
                  );
                  const sortedValid = [...validItems].sort((a, b) => {
                    const pa = getItemPeriodForSort(a);
                    const pb = getItemPeriodForSort(b);
                    if (!pa || !pb) return 0;
                    if (pa.year !== pb.year) return pb.year - pa.year;
                    return pb.month - pa.month;
                  });
                  const toUse = sortedValid.slice(
                    0,
                    VALID_VARIABLE_MONTHS_REQUIRED,
                  );
                  const groupSum = toUse.reduce(
                    (sum, item) => sum + (parseFloat(item.monto) || 0),
                    0,
                  );
                  const groupAverage =
                    toUse.length > 0 ? groupSum / toUse.length : 0;

                  const isCollapsed = variableGroupsCollapsed[concepto];

                  return (
                    <div
                      key={concepto}
                      className="border border-gray-200 rounded-lg overflow-hidden mb-3"
                    >
                      {/* Header del grupo */}
                      <div
                        className={`flex items-center justify-between p-4 bg-gray-100 ${isCollapsed ? "" : "border-b border-gray-200"}`}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="p-0.5 rounded hover:bg-gray-200 transition-colors text-gray-500 hover:text-gray-700"
                            onClick={() =>
                              setVariableGroupsCollapsed((prev) => ({
                                ...prev,
                                [concepto]: !prev[concepto],
                              }))
                            }
                            title={isCollapsed ? "Expandir listado" : "Colapsar listado"}
                          >
                            <span className="material-symbols-outlined text-xl">
                              {isCollapsed ? "expand_more" : "expand_less"}
                            </span>
                          </button>
                          {/* Group Toggle */}
                          <div
                            className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${allActive ? "bg-blue-600" : "bg-gray-300"}`}
                            onClick={() => {
                              const newState = !allActive;

                              // Update fetched items
                              const newVariableItems = [...variableItems];
                              items.forEach((item) => {
                                if (item.type === "fetched") {
                                  newVariableItems[item.originalIndex].active =
                                    newState;
                                }
                              });
                              setVariableItems(newVariableItems);

                              // Update custom items
                              const newCustomAdditions = {
                                ...variableCustomAdditions,
                              };
                              if (newCustomAdditions[concepto]) {
                                newCustomAdditions[concepto] =
                                  newCustomAdditions[concepto].map((i) => ({
                                    ...i,
                                    active: newState,
                                  }));
                                setVariableCustomAdditions(newCustomAdditions);
                              }

                              // Update filled items for this concept
                              const newFilled = { ...variableFilledActive };
                              items.forEach((item) => {
                                if (item.type === "filled" && item.filledKey) {
                                  newFilled[item.filledKey] = newState;
                                }
                              });
                              setVariableFilledActive(newFilled);
                            }}
                          >
                            <div
                              className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${allActive ? "translate-x-6" : ""}`}
                            ></div>
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">
                              {concepto}
                            </p>
                            <p className="text-xs text-gray-500">
                              {items.length} registro(s) • Promedio ({toUse.length} de {VALID_VARIABLE_MONTHS_REQUIRED} meses válidos): ${" "}
                              {Math.round(groupAverage).toLocaleString("es-CL")}
                            </p>
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
                                value={
                                  newCustomItems[concepto]?.description || ""
                                }
                                onChange={(e) => {
                                  const newState = { ...newCustomItems };
                                  if (!newState[concepto])
                                    newState[concepto] = {};
                                  newState[concepto].description =
                                    e.target.value;
                                  setNewCustomItems(newState);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    // Trigger add logic
                                    const state =
                                      newCustomItems[concepto] || {};
                                    if (state.description && state.amount) {
                                      const amount = parseFloat(state.amount);
                                      if (!isNaN(amount)) {
                                        const newCustomAdditions = {
                                          ...variableCustomAdditions,
                                        };
                                        if (!newCustomAdditions[concepto])
                                          newCustomAdditions[concepto] = [];

                                        newCustomAdditions[concepto].push({
                                          id: Date.now(),
                                          descripcion: state.description,
                                          monto: amount,
                                          active: true,
                                          periodo: "Manual",
                                        });

                                        setVariableCustomAdditions(
                                          newCustomAdditions,
                                        );
                                        const total =
                                          calculateTotalVariableBonus(
                                            variableItems,
                                            newCustomAdditions,
                                          );
                                        setVariableBonus(total);

                                        // Reset input
                                        setNewCustomItems({
                                          ...newCustomItems,
                                          [concepto]: {
                                            isAdding: false,
                                            description: "",
                                            amount: "",
                                          },
                                        });
                                      }
                                    }
                                  }
                                }}
                              />
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                                  $
                                </span>
                                <input
                                  type="number"
                                  placeholder="Monto"
                                  className="w-24 pl-5 pr-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                                  value={newCustomItems[concepto]?.amount || ""}
                                  onChange={(e) => {
                                    const newState = { ...newCustomItems };
                                    if (!newState[concepto])
                                      newState[concepto] = {};
                                    newState[concepto].amount = e.target.value;
                                    setNewCustomItems(newState);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      // Trigger add logic (same as above)
                                      const state =
                                        newCustomItems[concepto] || {};
                                      if (state.description && state.amount) {
                                        const amount = parseFloat(state.amount);
                                        if (!isNaN(amount)) {
                                          const newCustomAdditions = {
                                            ...variableCustomAdditions,
                                          };
                                          if (!newCustomAdditions[concepto])
                                            newCustomAdditions[concepto] = [];

                                          newCustomAdditions[concepto].push({
                                            id: Date.now(),
                                            descripcion: state.description,
                                            monto: amount,
                                            active: true,
                                            periodo: "Manual",
                                          });

                                          setVariableCustomAdditions(
                                            newCustomAdditions,
                                          );
                                          const total =
                                            calculateTotalVariableBonus(
                                              variableItems,
                                              newCustomAdditions,
                                            );
                                          setVariableBonus(total);

                                          setNewCustomItems({
                                            ...newCustomItems,
                                            [concepto]: {
                                              isAdding: false,
                                              description: "",
                                              amount: "",
                                            },
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
                                      const newCustomAdditions = {
                                        ...variableCustomAdditions,
                                      };
                                      if (!newCustomAdditions[concepto])
                                        newCustomAdditions[concepto] = [];

                                      newCustomAdditions[concepto].push({
                                        id: Date.now(),
                                        descripcion: state.description,
                                        monto: amount,
                                        active: true,
                                        periodo: "Manual",
                                      });

                                      setVariableCustomAdditions(
                                        newCustomAdditions,
                                      );
                                      const total = calculateTotalVariableBonus(
                                        variableItems,
                                        newCustomAdditions,
                                      );
                                      setVariableBonus(total);

                                      setNewCustomItems({
                                        ...newCustomItems,
                                        [concepto]: {
                                          isAdding: false,
                                          description: "",
                                          amount: "",
                                        },
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
                                  newState[concepto] = {
                                    isAdding: false,
                                    description: "",
                                    amount: "",
                                  };
                                  setNewCustomItems(newState);
                                }}
                              >
                                <span className="material-symbols-outlined text-sm">
                                  close
                                </span>
                              </button>
                            </>
                          ) : (
                            <button
                              className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium px-2 py-1 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                              onClick={() => {
                                const newState = { ...newCustomItems };
                                newState[concepto] = {
                                  isAdding: true,
                                  description: "",
                                  amount: "",
                                };
                                setNewCustomItems(newState);
                              }}
                            >
                              <span className="material-symbols-outlined text-sm">
                                add
                              </span>
                              Agregar Item
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Items del grupo (colapsable) */}
                      {!isCollapsed && (
                      <div className="divide-y divide-gray-100">
                        {items.map((bonus, idx) => (
                          <div
                            key={bonus.type === "filled" ? bonus.filledKey : idx}
                            className={`flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors ${bonus.type === "custom" ? "bg-blue-50/30" : ""} ${bonus.type === "filled" ? "bg-gray-50/50" : ""}`}
                          >
                            <div className="flex items-center gap-2">
                              {bonus.type === "custom" && (
                                <span
                                  className="material-symbols-outlined text-xs text-blue-500"
                                  title="Item Manual"
                                >
                                  edit_note
                                </span>
                              )}
                              {bonus.type === "filled" && (
                                <span
                                  className="material-symbols-outlined text-xs text-gray-400"
                                  title="Mes sin asignación"
                                >
                                  remove_circle_outline
                                </span>
                              )}
                              {bonus.hasLicense && (
                                <span
                                  className="material-symbols-outlined text-xs text-amber-600"
                                  title="Mes con licencia médica"
                                >
                                  medical_services
                                </span>
                              )}
                              <div>
                                <p className="font-medium text-gray-700">
                                  {bonus.type === "custom"
                                    ? bonus.descripcion
                                    : bonus.periodo}
                                </p>
                                {bonus.type === "custom" && (
                                  <p className="text-xs text-gray-400">
                                    Manual
                                  </p>
                                )}
                                {bonus.type === "filled" && (
                                  <p className="text-xs text-gray-400">
                                    Sin asignación
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <span
                                className={`font-mono font-medium ${bonus.active !== false ? "text-gray-900" : "text-gray-400"}`}
                              >
                                $ {(bonus.monto || 0).toLocaleString("es-CL")}
                              </span>

                              {/* Item Toggle */}
                              <div
                                className={`w-10 h-5 rounded-full p-0.5 cursor-pointer transition-colors ${bonus.active !== false ? "bg-blue-600" : "bg-gray-300"}`}
                                onClick={() => {
                                  if (bonus.type === "fetched") {
                                    const newItems = [...variableItems];
                                    newItems[bonus.originalIndex].active =
                                      !newItems[bonus.originalIndex].active;
                                    setVariableItems(newItems);
                                  } else if (bonus.type === "filled") {
                                    setVariableFilledActive((prev) => ({
                                      ...prev,
                                      [bonus.filledKey]:
                                        !bonus.active,
                                    }));
                                  } else {
                                    const newCustomAdditions = {
                                      ...variableCustomAdditions,
                                    };
                                    const groupAdditions = [
                                      ...newCustomAdditions[concepto],
                                    ];
                                    groupAdditions[bonus.originalIndex].active =
                                      !groupAdditions[bonus.originalIndex]
                                        .active;
                                    newCustomAdditions[concepto] =
                                      groupAdditions;
                                    setVariableCustomAdditions(
                                      newCustomAdditions,
                                    );
                                  }
                                }}
                              >
                                <div
                                  className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${bonus.active !== false ? "translate-x-5" : ""}`}
                                ></div>
                              </div>

                              {/* Delete button for custom items */}
                              {bonus.type === "custom" && (
                                <button
                                  className="text-gray-400 hover:text-red-500 transition-colors"
                                  onClick={() => {
                                    if (
                                      confirm("¿Eliminar este item manual?")
                                    ) {
                                      const newCustomAdditions = {
                                        ...variableCustomAdditions,
                                      };
                                      newCustomAdditions[concepto] =
                                        newCustomAdditions[concepto].filter(
                                          (_, i) => i !== bonus.originalIndex,
                                        );
                                      setVariableCustomAdditions(
                                        newCustomAdditions,
                                      );
                                      const total = calculateTotalVariableBonus(
                                        variableItems,
                                        newCustomAdditions,
                                      );
                                      setVariableBonus(total);
                                    }
                                  }}
                                >
                                  <span className="material-symbols-outlined text-lg">
                                    delete
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      )}
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
            <h3 className="text-lg font-bold text-gray-900">
              Compensación y Vacaciones
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-semibold text-gray-700">
                  Días de Vacaciones Pendientes
                </label>
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
                  <span className="material-symbols-outlined text-[10px]">
                    check_circle
                  </span>
                  Stock Buk: {vacationDaysStock.toFixed(2)} días
                </p>
                {lastDayWork &&
                  vacationDays !== vacationDaysStock &&
                  !vacationDaysManuallyEdited && (
                    <p className="text-xs text-blue-600 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[10px]">
                        trending_up
                      </span>
                      Proyectado al{" "}
                      {parseLocalDate(lastDayWork).toLocaleDateString("es-CL")}:
                      +{(vacationDays - vacationDaysStock).toFixed(2)} días
                    </p>
                  )}
                {vacationDaysManuallyEdited && (
                  <p className="text-xs text-orange-600 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[10px]">
                      edit
                    </span>
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
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Valor Vacaciones (Calculado)
              </label>
              <div className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-mono">
                $ {vacationValue.toLocaleString("es-CL")}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Base Salary Input */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Sueldo Base <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-gray-400">$</span>
                <input
                  type="number"
                  className="w-full p-3 pl-8 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  value={salary}
                  onChange={(e) => setSalary(Number(e.target.value))}
                />
              </div>
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[10px]">
                  check_circle
                </span>
                Extraído desde Buk
              </p>
              {terminationReason === "mutuo_acuerdo" && averageSalary > 0 && (
                <p className="text-xs text-blue-600 mt-1 flex items-center gap-1 bg-blue-50 p-1.5 rounded border border-blue-100">
                  <span className="material-symbols-outlined text-sm">
                    info
                  </span>
                  <span>
                    Promedio 48 sueldos:{" "}
                    <span className="font-bold">
                      ${averageSalary.toLocaleString("es-CL")}
                    </span>
                  </span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Bonos Variables (Calculado)
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-mono">
                  $ {variableBonus.toLocaleString("es-CL")}
                </div>
                <span className="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-bold uppercase rounded tracking-wider">
                  Calculado
                </span>
              </div>
            </div>
          </div>

          <button className="mt-6 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
            <span className="material-symbols-outlined text-lg">
              add_circle
            </span>
            Agregar items (en desarrollo)
          </button>
        </div>

        {/* Indemnity Calculations */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <span className="material-symbols-outlined">calculate</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              Cálculo indemnización
            </h3>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">
                Años de servicio
              </p>
              <p className="text-xl font-bold text-gray-900">
                {yearsOfService.toFixed(1)} Años
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">
                Años para indemnización
              </p>
              <p className="text-xl font-bold text-gray-900">
                {yearsOfService >= 1
                  ? typeof yearsForIndemnity === "number"
                    ? yearsForIndemnity.toFixed(2)
                    : yearsForIndemnity
                  : 0}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Redondeado hacia arriba &gt; 6 meses
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">
                (Sueldo base + Bonificaciones) / 30
              </p>
              <p className="text-xl font-bold text-gray-900">$ {dailySalary}</p>
            </div>
          </div>

          <div className="space-y-3 border-t border-gray-100 pt-6">
            {/* Sección 1: Haberes */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Gratificación Legal</span>
              <span className="font-mono font-medium">
                $ {Math.round(gratificacionLegal).toLocaleString("es-CL")}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                Promedio de Bonificaciones Mensuales
              </span>
              <span className="font-mono font-medium">
                $ {Math.round(variableBonus).toLocaleString("es-CL")}
              </span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-gray-600">Movilización</span>
              <div className="flex items-center gap-2">
                <span className="text-gray-400">$</span>
                <input
                  type="number"
                  className="w-28 p-1 text-right bg-white border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  value={movilizacion}
                  onChange={(e) =>
                    setMovilizacion(parseFloat(e.target.value) || 0)
                  }
                />
              </div>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-gray-900 font-bold">Total Haberes</span>
              <span className="font-mono font-bold">
                $ {Math.round(totalHaberes).toLocaleString("es-CL")}
              </span>
            </div>

            <div className="border-t border-gray-100 my-2"></div>

            {/* Sección 2: Indemnizaciones */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                Indemnización por Años de Servicio (
                {typeof yearsForIndemnity === "number"
                  ? yearsForIndemnity.toFixed(2)
                  : yearsForIndemnity}{" "}
                años)
              </span>
              <span className="font-mono font-medium">
                $ {Math.round(
                  terminationReason === "mutuo_acuerdo"
                    ? yearsIndemnity - aporteCesantiaNum
                    : yearsIndemnity
                ).toLocaleString("es-CL")}
              </span>
            </div>
            {terminationReason === "mutuo_acuerdo" && averageSalary > 0 && (
              <div className="flex justify-between text-sm items-center bg-blue-50 p-2 rounded border border-blue-100">
                <span className="text-blue-700 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">
                    info
                  </span>
                  Promedio últimas 48 liquidaciones
                </span>
                <span className="font-mono font-bold text-blue-700">
                  $ {averageSalary.toLocaleString("es-CL")}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Vacaciones Pendientes</span>
              <span className="font-mono font-medium">
                $ {Math.round(vacationIndemnity).toLocaleString("es-CL")}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Mes de Aviso</span>
              <span className="font-mono font-medium">
                $ {Math.round(noticeIndemnity).toLocaleString("es-CL")}
              </span>
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
                    const val = e.target.value.replace(/[^0-9]/g, "");
                    setLiquidacionMesActual(val ? parseFloat(val) : "");
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
                    const value = e.target.value.replace(/[^0-9]/g, "");
                    setDescuentos(value);
                  }}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex justify-between text-sm items-center mb-2">
              <span className="text-red-600 font-medium">
                Aporte Empleador Seguro Cesantía
              </span>
              <div className="flex items-center gap-2">
                <span className="text-red-400">- $</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-28 p-1 text-right bg-red-50 border border-red-200 rounded focus:ring-2 focus:ring-red-500 outline-none font-mono text-red-700"
                  value={aporteCesantia}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, "");
                    setAporteCesantia(value);
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
              const isLoan = desc.descripcion === "Préstamo Interno";
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
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 text-sm items-center mb-2 bg-white p-2 rounded border border-gray-100 shadow-sm"
                >
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
                      <option value="Descuento por planilla">
                        Descuento por planilla
                      </option>
                    </select>
                    {desc.detalle && (
                      <span
                        className="text-[10px] text-gray-400 pl-1 truncate"
                        title={desc.detalle}
                      >
                        {desc.detalle}
                      </span>
                    )}
                  </div>

                  {/* Monto Input */}
                  <div className="col-span-3">
                    <div className="flex items-center gap-1 justify-end">
                      {isLoan && (
                        <span className="text-[9px] text-blue-600 font-bold">
                          UF
                        </span>
                      )}
                      <input
                        type="text"
                        className="w-full text-right bg-red-50 border border-red-200 rounded px-1 py-0.5 text-xs font-mono text-red-700 outline-none focus:ring-1 focus:ring-red-500"
                        value={desc.monto}
                        onChange={(e) => {
                          // Allow decimals for UF
                          const val = e.target.value.replace(/[^0-9.]/g, "");
                          const newDescuentos = [...descuentosPersonalizados];
                          newDescuentos[idx].monto = val;
                          setDescuentosPersonalizados(newDescuentos);
                        }}
                        placeholder="0"
                      />
                    </div>
                    {isLoan && ufValue > 0 && (
                      <div className="text-[9px] text-gray-400 text-right mt-0.5">
                        ~ ${displayMonto.toLocaleString("es-CL")}
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
                        const val = e.target.value.replace(/[^0-9]/g, "");
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
                    <span
                      className="text-xs font-mono font-medium text-gray-700"
                      title="Deuda Total Estimada"
                    >
                      $ {totalDebt.toLocaleString("es-CL")}
                    </span>
                    <button
                      onClick={() => {
                        const newDescuentos = descuentosPersonalizados.filter(
                          (_, i) => i !== idx,
                        );
                        setDescuentosPersonalizados(newDescuentos);
                      }}
                      className="text-gray-400 hover:text-red-500 transition-colors ml-1"
                    >
                      <span className="material-symbols-outlined text-base">
                        close
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Botón para agregar descuento */}
            <button
              onClick={() => {
                setDescuentosPersonalizados([
                  ...descuentosPersonalizados,
                  { descripcion: "", monto: "", cuotas: 1 },
                ]);
              }}
              className="mt-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border border-red-200"
            >
              <span className="material-symbols-outlined text-lg">
                add_circle
              </span>
              Agregar descuento
            </button>
          </div>

          <div className="mt-4 flex justify-end">
            <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg text-xs text-blue-700 border border-blue-100 shadow-sm">
              <span className="font-bold">Valor UF Hoy:</span>
              <span className="text-gray-400 ml-1">$</span>
              <input
                type="number"
                step="0.01"
                className="w-28 bg-transparent font-mono text-blue-700 text-right outline-none border-b border-blue-200 focus:border-blue-500 py-0.5"
                value={ufValue}
                onChange={(e) => setUfValue(Number(e.target.value))}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="mt-2 bg-gray-900 text-white p-6 rounded-xl flex justify-between items-center shadow-lg">
            <div>
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">
                Total finiquito
              </p>
              <p className="text-xs text-gray-500">
                Sujeto a revisión final y deducciones
              </p>
            </div>
            <p className="text-3xl font-bold font-mono">
              $ {Math.round(totalSettlement).toLocaleString("es-CL")}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 pb-12">
          <button
            onClick={() => navigate("/finiquitos")}
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
