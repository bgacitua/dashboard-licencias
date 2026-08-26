import React, { useState, useEffect, useMemo, useRef } from "react";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import SidebarLayout from "../components/SidebarLayout";
import { truncDias } from "../lib/vacationDays";
import { sufijoCuotas } from "../lib/descuentos";
import FiniquitosService from "../services/finiquitos.service";
import EmployeesService from "../services/employees.service";
import { getLicenciasByRut } from "../services/licencias";

import {
  parsePeriodo,
  monthHasLicense,
  getExpandedVariableGroups,
  getItemPeriodForSort,
  calculateTotalFromExpandedGroups,
  VALID_VARIABLE_MONTHS_REQUIRED,
} from "../lib/variableBonus";

// Formatea fechas como "dd - mes - aaaa" en español
// Tope de años de indemnización por años de servicio, según causal de término.
// null / ausente = sin tope (renuncia, no concurrencia, etc. no generan indemnización).
const TOPE_ANOS_INDEMNIZACION = {
  necesidades_empresa: 11, // Art. 161 - Necesidades de la empresa
  mutuo_acuerdo_especial: 11, // Mismo cálculo que necesidades_empresa; solo cambia la redacción del finiquito/carta
  mutuo_acuerdo: null, // Art. 159 N°1 - se rige por tramos, ver TOPE_MUTUO_ACUERDO
};

// Mutuo acuerdo (Art. 159 N°1): tope de años por tramo de antigüedad.
// Fuera de estos tramos (años < 4, años >= 25) o edad >= 65: sin tope de años ni de base.
const TOPE_MUTUO_ACUERDO = [
  { minAnos: 4, maxAnos: 20, topeAnos: 11 },
  { minAnos: 20, maxAnos: 25, topeAnos: 16 },
];

function formatDateWords(dateString) {
  if (!dateString) return "";
  const clean = dateString.includes("T")
    ? dateString.split("T")[0]
    : dateString;
  const parts = clean.split("-");
  if (parts.length !== 3) return dateString;
  const [yearStr, monthStr, dayStr] = parts;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return dateString;
  const meses = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  const mesNombre = meses[month - 1] || "";
  return `${day.toString().padStart(2, "0")} - ${mesNombre} - ${year}`;
}

// Formatea fechas como "dd mes del aaaa" en español (para documentos Word)
function formatDateWordsLong(dateString) {
  if (!dateString) return "";
  const clean = dateString.includes("T")
    ? dateString.split("T")[0]
    : dateString;
  const parts = clean.split("-");
  if (parts.length !== 3) return dateString;
  const [yearStr, monthStr, dayStr] = parts;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return dateString;
  const meses = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  const mesNombre = meses[month - 1] || "";
  return `${day.toString().padStart(2, "0")} ${mesNombre} del ${year}`;
}

// Convierte un número a letras en español (pesos chilenos, sin centavos)
function numeroALetrasCLP(num) {
  num = Math.round(Number(num) || 0);
  if (num === 0) return "cero pesos";

  const unidades = [
    "",
    "uno",
    "dos",
    "tres",
    "cuatro",
    "cinco",
    "seis",
    "siete",
    "ocho",
    "nueve",
    "diez",
    "once",
    "doce",
    "trece",
    "catorce",
    "quince",
    "dieciséis",
    "diecisiete",
    "dieciocho",
    "diecinueve",
  ];
  const decenas = [
    "",
    "diez",
    "veinte",
    "treinta",
    "cuarenta",
    "cincuenta",
    "sesenta",
    "setenta",
    "ochenta",
    "noventa",
  ];
  const centenas = [
    "",
    "ciento",
    "doscientos",
    "trescientos",
    "cuatrocientos",
    "quinientos",
    "seiscientos",
    "setecientos",
    "ochocientos",
    "novecientos",
  ];

  const centenasDecenasUnidades = (n) => {
    if (n === 0) return "";
    if (n === 100) return "cien";
    let c = Math.floor(n / 100);
    let d = Math.floor((n % 100) / 10);
    let u = n % 10;
    let textoCentenas = centenas[c];
    let resto = n % 100;
    if (resto < 20) {
      return `${textoCentenas} ${unidades[resto]}`.trim();
    }
    let textoDecenas = decenas[d];
    let textoUnidades = unidades[u];
    if (d === 2 && u > 0) {
      textoDecenas = "veinti";
      textoUnidades = textoUnidades.replace(/^uno$/, "ún");
      return `${textoCentenas} ${textoDecenas}${textoUnidades}`.trim();
    }
    const separador = u > 0 ? " y " : "";
    return `${textoCentenas} ${textoDecenas}${separador}${textoUnidades}`.trim();
  };

  const seccion = (n, divisor, singular, plural) => {
    const cientos = Math.floor(n / divisor);
    const resto = n - cientos * divisor;
    let letras = "";
    if (cientos > 0) {
      letras = cientos === 1 ? singular : `${centenasDecenasUnidades(cientos)} ${plural}`;
    }
    return { letras, resto };
  };

  const miles = (n) => {
    const { letras, resto } = seccion(n, 1000, "mil", "mil");
    const letrasResto = centenasDecenasUnidades(resto);
    if (!letras) return letrasResto;
    if (!letrasResto) return letras;
    return `${letras} ${letrasResto}`;
  };

  const millones = (n) => {
    const { letras, resto } = seccion(n, 1000000, "un millón", "millones");
    const letrasMiles = miles(resto);
    if (!letras) return letrasMiles;
    if (!letrasMiles) return letras;
    return `${letras} ${letrasMiles}`;
  };

  const letrasEntero = millones(num);
  return `${letrasEntero} pesos`.replace(/\s+/g, " ").trim();
}

// Detalles de empresa (razón social y RUT) según nombre_empresa,
// alineado con la lógica de VisualizadorFiniquito.
export function getCompanyDetails(empresaRaw) {
  const normalized = (empresaRaw || "").toLowerCase();

  if (normalized.includes("sabores")) {
    return {
      legalName: "Sabores y Fragancias.CL Comercial Ltda.",
      rut: "76.165.072-6",
    };
  }
  if (normalized.includes("servicios") || normalized.includes("logística")) {
    return {
      legalName: "SERVICIOS DE PRODUCCIÓN Y LOGÍSTICA CCPA LTDA",
      rut: "76.479.573-3",
    };
  }
  // Default Carlos Cramer
  return {
    legalName: "Carlos Cramer Productos Aromáticos S.A.C.I.",
    rut: "92.845.000-7",
  };
}

const CrearFiniquito = () => {
  const { rut } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState(null);
  const [proceso, setProceso] = useState(null); // estado persistido de la desvinculación
  const [tabActiva, setTabActiva] = useState(0); // solo UI: no se persiste

  // Cambiar de paso vuelve al tope: si no, entras al paso nuevo a media altura.
  const irATab = (i) => {
    setTabActiva(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // Toggles variables por aplicar. Es estado y no ref porque el proceso guardado y los items
  // de la API llegan en orden impredecible: quien llegue segundo debe disparar el efecto.
  const [variableActivePorAplicar, setVariableActivePorAplicar] = useState(null);
  // Moneda elegida a mano por descuento ({ descripcion: 'UF' | 'CLP' }), pendiente de aplicar
  // por el mismo motivo: los descuentos se recargan de la API en cada visita.
  const [descuentosMonedaPorAplicar, setDescuentosMonedaPorAplicar] = useState(null);

  // Form State
  const [terminationReason, setTerminationReason] = useState("");
  const [lastDayWork, setLastDayWork] = useState("");
  const [noticeGiven, setNoticeGiven] = useState(true);
  const [vacationDays, setVacationDays] = useState(0);
  const [vacationDaysStock, setVacationDaysStock] = useState(0); // Original API value
  // Texto crudo del input. Separado del numero para poder escribir "12." o borrar
  // el campo sin que un toFixed reformatee en cada tecla y mueva el cursor.
  const [vacationDaysInput, setVacationDaysInput] = useState("");
  const vacationInputRef = useRef(null);
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
  const [licenciasTableCollapsed, setLicenciasTableCollapsed] = useState(true); // Colapsada por defecto
  const [licenciasLimit, setLicenciasLimit] = useState(15); // TOP N (5, 10, 15, 20, 30, 50)
  const [licenciasOrder, setLicenciasOrder] = useState("desc"); // 'desc' = más recientes primero, 'asc' = ascendente
  const [newCustomItems, setNewCustomItems] = useState({}); // Temporary state for new manual item inputs per concept: { [concepto]: { description: '', amount: '' } }
  const [ufValue, setUfValue] = useState(0); // Valor UF del día
  const [isLoadingUf, setIsLoadingUf] = useState(false);
  const [isLoadingVacation, setIsLoadingVacation] = useState(false); // Loading state for vacation days API
  const [itemsLimit, setItemsLimit] = useState(15); // TOP N períodos de remuneración (para variable)
  const [itemsRefreshToken, setItemsRefreshToken] = useState(0); // Fuerza refresco manual para items/variable

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
        variableFilledActive,
        lastDayWork
      ),
    [variableItems, variableCustomAdditions, licencias, variableFilledActive, lastDayWork]
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
        // Disparar TODO en paralelo para reducir el tiempo total de carga.
        // Antes: (items+licencias) -> (vacaciones+sueldo) -> (uf+descuentos) en serie.
        const [
          itemsResult,
          licenciasResult,
          vacacionesResult,
          sueldoResult,
          ufResult,
          descuentosResult,
        ] = await Promise.allSettled([
          FiniquitosService.getItemsByRut(rut, itemsLimit),
          getLicenciasByRut(rut, { limit: licenciasLimit, order: licenciasOrder }),
          EmployeesService.getVacationsAvailable(rut),
          EmployeesService.getSueldoBase(rut),
          FiniquitosService.getIndicatorUF(),
          FiniquitosService.getDescuentosByRut(rut),
        ]);

        const data =
          itemsResult.status === "fulfilled" ? itemsResult.value : [];

        const employeeLicencias =
          licenciasResult.status === "fulfilled" ? licenciasResult.value : [];

        const sortedLicencias = Array.isArray(employeeLicencias)
          ? employeeLicencias
          : [];
        setLicencias(sortedLicencias);

        if (Array.isArray(data) && data.length > 0) {
          const empData = data[0];
          setEmployee(empData);
          setItems(data);
          setVacationValue(0);

          // Vacaciones
          if (
            vacacionesResult.status === "fulfilled" &&
            vacacionesResult.value?.total_dias_disponibles != null
          ) {
            const rawDays = truncDias(vacacionesResult.value.total_dias_disponibles);
            setVacationDaysStock(rawDays);
          } else {
            setVacationDaysStock(0);
          }
          // vacationDays lo fija el efecto con fecha (y respeta la edicion manual);
          // aqui solo se guarda el stock para mostrarlo de referencia.

          // Sueldo base (fallback a "Sueldo Base" desde items)
          const baseSalaryItem =
            data.find((i) => i.concepto === "Sueldo Base")?.monto || 0;
          if (
            sueldoResult.status === "fulfilled" &&
            sueldoResult.value?.base_wage
          ) {
            setSalary(sueldoResult.value.base_wage);
          } else {
            setSalary(baseSalaryItem > 0 ? baseSalaryItem : 2050000);
          }

          // Remuneración variable (se calcula usando licencias)
          const excludedConceptos = [
            "Bono Empresa",
            "Bono Navidad",
            "Bono Fiestas Patrias",
            "Horas Extras 50%",
            "Horas Extras 100%",
            "Bono De Escolaridad",
            "Colación Adicional",
            "Movilización Adicional",
            "Bono Seniors",
            "Liqui Difgrat 1 Sem",
          ];
          const varData = data.filter(
            (item) =>
              item.income_type === "remuneracion_variable" ||
              (item.income_type === "remuneracion_ocasional" &&
                (item.concepto === "Bono Especial Mensual" ||
                  !excludedConceptos.includes(item.concepto))) ||
              (item.income_type === "remuneracion_fija" &&
                (item.concepto === "Bono Supervisores Noche" ||
                  item.concepto === "Bono Jefe Área Contingencia" ||
                  item.concepto === "Bono Auditores Internos" ||
                  item.concepto === "Bono Operario Master")),
          );

          if (varData.length > 0) {
            const mappedVarData = varData.map((item, idx) => {
              const p = parsePeriodo(item.periodo);
              const active =
                p && sortedLicencias.length > 0
                  ? !monthHasLicense(p.year, p.month, sortedLicencias)
                  : true;
              return { ...item, active, originalIndex: idx };
            });
            setVariableItems(mappedVarData);
          } else {
            setVariableItems([]);
            setVariableBonus(0);
          }
        }

        // UF
        const ufValueResolved =
          ufResult.status === "fulfilled" ? ufResult.value : 0;
        setUfValue(ufValueResolved || 0);

        // Descuentos (si el usuario vuelve desde el visualizador, respetamos preserveData)
        const descuentosData =
          descuentosResult.status === "fulfilled" ? descuentosResult.value : [];
        if (!location.state?.preserveData) {
          const mappedDescuentos = (descuentosData || []).map((item) => {
            let desc = item.concepto || "";
            if (desc === "Prestamo Interno") desc = "Préstamo Interno";
            if (desc === "Descuento Por Planilla") desc = "Descuento por planilla";
            return {
              descripcion: desc,
              detalle: item.detalle || "",
              monto: item.monto || 0,
              cuotas: 1,
              // El backend entrega el préstamo interno en UF. Si el usuario cambió la
              // moneda antes, el efecto de más abajo restaura su elección.
              moneda: desc === "Préstamo Interno" ? "UF" : "CLP",
            };
          });
          setDescuentosPersonalizados(mappedDescuentos);
        }
        setDescuentosItems([]);
      } catch (error) {
        console.error("Error fetching employee data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (rut) {
      fetchData();
    }
  }, [rut, licenciasLimit, licenciasOrder, itemsLimit, itemsRefreshToken]);

  // Restaurar datos del formulario: primero el proceso guardado en BD (sobrevive al cierre
  // del navegador), y si no hay, el sessionStorage que usa el visualizador como transporte.
  useEffect(() => {
    const aplicar = (data) => {
      if (!data) return false;
      if (data.lastDayWork) setLastDayWork(data.lastDayWork);
      if (data.terminationReason) setTerminationReason(data.terminationReason);
      if (data.noticeGiven !== undefined) setNoticeGiven(data.noticeGiven);
      if (data.selectedManager?.id) setSelectedManager(data.selectedManager.id);
      if (data.vacationDaysManuallyEdited !== undefined)
        setVacationDaysManuallyEdited(data.vacationDaysManuallyEdited);
      if (data.vacationDays) setVacationDays(data.vacationDays);
      if (data.yearsForIndemnity) setYearsForIndemnity(data.yearsForIndemnity);
      if (data.descuentosPersonalizados)
        setDescuentosPersonalizados(data.descuentosPersonalizados);
      // Campos que el usuario escribe a mano. `!== undefined` y no truthy: 0 es un
      // valor válido que se perdía con `if (data.x)`.
      if (data.movilizacion !== undefined) setMovilizacion(data.movilizacion);
      if (data.liquidacionMesActual !== undefined)
        setLiquidacionMesActual(data.liquidacionMesActual);
      if (data.descuentos !== undefined) setDescuentos(data.descuentos);
      if (data.aporteCesantia !== undefined) setAporteCesantia(data.aporteCesantia);
      if (data.ufValue) setUfValue(data.ufValue);
      if (data.variableCustomAdditions)
        setVariableCustomAdditions(data.variableCustomAdditions);
      if (data.variableFilledActive)
        setVariableFilledActive(data.variableFilledActive);
      // Los items fetched pueden no haber llegado de la API todavía; los aplica el efecto.
      if (data.variableItemsActive)
        setVariableActivePorAplicar(data.variableItemsActive);
      if (data.descuentosMoneda)
        setDescuentosMonedaPorAplicar(data.descuentosMoneda);
      return true;
    };

    const restaurar = async () => {
      try {
        const proceso = await FiniquitosService.getProceso(rut);
        setProceso(proceso);
        if (aplicar(proceso?.payload_json)) {
          console.log("Formulario restaurado desde el proceso guardado");
          return;
        }
      } catch (e) {
        console.warn("No se pudo leer el proceso guardado:", e);
      }
      if (location.state?.preserveData) {
        const savedData = sessionStorage.getItem(`finiquito_${rut}`);
        if (savedData && aplicar(JSON.parse(savedData))) {
          console.log("Formulario restaurado desde sessionStorage");
        }
      }
    };

    if (rut) restaurar();
  }, [location.state, rut]);

  // Aplica los toggles guardados a los items variables cuando ya están ambos: el proceso
  // restaurado y los items de la API. Se consume una sola vez para no pisar lo que el
  // usuario toque después.
  useEffect(() => {
    if (!variableActivePorAplicar || variableItems.length === 0) return;
    setVariableItems((prev) =>
      prev.map((i) => {
        const clave = `${i.concepto}|${i.periodo}`;
        return clave in variableActivePorAplicar
          ? { ...i, active: variableActivePorAplicar[clave] }
          : i;
      }),
    );
    setVariableActivePorAplicar(null);
  }, [variableItems, variableActivePorAplicar]);

  // Restaura la moneda que el usuario eligió para cada descuento, una vez que llegan de la API.
  useEffect(() => {
    if (!descuentosMonedaPorAplicar || descuentosPersonalizados.length === 0) return;
    setDescuentosPersonalizados((prev) =>
      prev.map((d) =>
        d.descripcion in descuentosMonedaPorAplicar
          ? { ...d, moneda: descuentosMonedaPorAplicar[d.descripcion] }
          : d,
      ),
    );
    setDescuentosMonedaPorAplicar(null);
  }, [descuentosPersonalizados, descuentosMonedaPorAplicar]);

  // Guarda el formulario y sella el hito ('carta' | 'finiquito'). Nunca lanza:
  // registrar el proceso no debe impedir que el usuario obtenga su documento.
  const persistirProceso = async (payload, hito, total) => {
    try {
      await FiniquitosService.guardarProceso(rut, {
        causal: terminationReason,
        fechaTermino: lastDayWork,
        payload,
        total,
      });
      setProceso(await FiniquitosService.marcarHito(rut, hito));
    } catch (e) {
      console.warn(`No se pudo registrar el hito '${hito}' del proceso:`, e);
    }
  };

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

  // Cache de dias de vacaciones por (rut, fecha). La API devuelve siempre lo mismo para
  // la misma fecha, asi que basta con recordar la respuesta: al volver desde el
  // visualizador no se vuelve a consultar ni se pisa el valor en pantalla.
  // localStorage y no sessionStorage: el valor debe seguir ahi despues de cerrar el navegador.
  // ponytail: sin expiracion ni limpieza; si Buk corrige dias hacia atras, el boton
  // "Restaurar" fuerza la reconsulta.
  // v2 en la clave: lo guardado antes se pidio sin discount=true y sobreestima los dias.
  const vacationCacheKey = (fecha) => `vacDaysV2:${rut}:${fecha || "stock"}`;
  const readVacationCache = (fecha) => {
    try {
      const raw = localStorage.getItem(vacationCacheKey(fecha));
      return raw == null ? null : parseFloat(raw);
    } catch {
      return null;
    }
  };
  const writeVacationCache = (fecha, dias) => {
    try {
      localStorage.setItem(vacationCacheKey(fecha), String(dias));
    } catch {
      /* localStorage lleno o bloqueado: seguir sin cache */
    }
  };
  const clearVacationCache = (fecha) => {
    try {
      localStorage.removeItem(vacationCacheKey(fecha));
    } catch {
      /* nada que hacer */
    }
  };

  // Fetch vacation days from backend when termination date changes
  // The backend calculates the projection using the BUK API with the date parameter
  // Uses debounce to avoid excessive API calls when user changes date rapidly
  useEffect(() => {
    if (vacationDaysManuallyEdited) return; // Skip if manually edited

    const fetchVacationDays = async () => {
      if (!rut) return;

      const cached = readVacationCache(lastDayWork);
      if (cached != null && !Number.isNaN(cached)) {
        if (!lastDayWork) setVacationDaysStock(cached);
        setVacationDays(cached);
        return;
      }

      setIsLoadingVacation(true);
      try {
        // Pass the termination date to the API if selected
        const vacationData = await EmployeesService.getVacationsAvailable(
          rut,
          lastDayWork || null,
        );
        const rawDays = truncDias(vacationData.total_dias_disponibles);
        writeVacationCache(lastDayWork, rawDays);

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

  const ajustarVacationDays = (delta) => {
    setVacationDaysManuallyEdited(true);
    setVacationDays((prev) => Math.max(0, truncDias(prev + delta)));
  };

  // Espejo numero -> texto. Si el usuario esta escribiendo (foco en el input) no se toca.
  useEffect(() => {
    if (document.activeElement === vacationInputRef.current) return;
    setVacationDaysInput(vacationDays.toFixed(1));
  }, [vacationDays]);

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
          // Redondear hacia arriba solo cuando hay MÁS de 6 meses después del último aniversario
          // (6 meses y 1 día o más). Así 1.5 años exactos cuenta como 1 año, no 2.

          const thresholdDate = new Date(start.getTime());
          thresholdDate.setFullYear(thresholdDate.getFullYear() + y);
          thresholdDate.setMonth(thresholdDate.getMonth() + 6);
          thresholdDate.setDate(thresholdDate.getDate() + 1); // +1 día: más de 6 meses

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



  if (loading) {
    // ponytail: skeleton estático con animate-pulse; sin librería de skeletons
    const bar = "bg-app-line rounded animate-pulse";
    return (
      <SidebarLayout>
        <main className="p-8">
          <div className={`${bar} h-8 w-72 mb-2`} />
          <p className="text-app-muted mb-8">Lo bueno tarda en llegar...</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="bg-white rounded-xl  border border-app-line p-6 space-y-4">
                  <div className={`${bar} h-5 w-48`} />
                  <div className={`${bar} h-10 w-full`} />
                  <div className={`${bar} h-10 w-full`} />
                  <div className={`${bar} h-10 w-2/3`} />
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl  border border-app-line p-6 space-y-4 h-fit">
              <div className={`${bar} h-5 w-32`} />
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex justify-between gap-4">
                  <div className={`${bar} h-4 w-32`} />
                  <div className={`${bar} h-4 w-20`} />
                </div>
              ))}
              <div className={`${bar} h-12 w-full`} />
            </div>
          </div>
        </main>
      </SidebarLayout>
    );
  }

  if (!employee) {
    return <div className="p-8">Empleado no encontrado</div>;
  }

  // Calculations
  // yearsOfService and yearsForIndemnity are now state variables
  // Daily Salary Base = (Sueldo Base + Promedio Bonificaciones) / 30
  // ponytail: redondeo a peso una sola vez, en el origen de cada monto.
  // Antes cada consumidor (pantalla, Excel, carta, persistirProceso) hacía su
  // propio Math.round sobre floats, y las sumas de redondeados no coincidían
  // con el redondeo de la suma (±1-2 pesos de diferencia).
  const dailySalary = Math.round((salary + variableBonus) / 30);

  // Gratificación Legal = (Sueldo Base + Promedio Bonificaciones) * 25%
  // Tope = ((4.75/12) * Sueldo Mínimo) * 25%f
  const sueldoMinimo = 553553;
  const topeGratificacion = (4.75 / 12) * sueldoMinimo;
  const gratificacionLegal = Math.round(
    Math.min((salary + variableBonus) * 0.25, topeGratificacion),
  );

  // Total Haberes = Sueldo Base + Promedio Bonificaciones + Gratificación Legal + Movilización
  const totalHaberes = Math.round(
    salary + variableBonus + gratificacionLegal + movilizacion,
  );

  // 1. Vacation Indemnity = (Sueldo Base + Total Bonificaciones / 30) * días corridos
  // vacationValue ya está calculado en el useEffect con la fórmula de días corridos
  // Aplica para: necesidades_empresa (Sí), mutuo_acuerdo (caso a caso), mutuo_acuerdo_especial (como necesidades), no_concurrencia (Sí), renuncia (Sí)
  const vacationApplies =
    terminationReason === "necesidades_empresa" ||
    terminationReason === "mutuo_acuerdo" ||
    terminationReason === "mutuo_acuerdo_especial" ||
    terminationReason === "no_concurrencia" ||
    terminationReason === "renuncia" ||
    terminationReason === "vencimiento_plazo" ||
    terminationReason === "termino_anticipado";
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
  let mutuoEspecialRules = null;
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

      // Used for audit/logs
      let ruleApplied = "";
      let cappedBase = null;
      let cappedYears = null;

      // Rule 4: 65 years old (no caps)
      if (age >= 65) {
        ruleApplied = "Rule 4 (edad >= 65): sin topes";
        yearsIndemnity = baseAmount * years;
      }
      // Rule 1: 4 to 20 years
      else if (years >= 4 && years < 20) {
        ruleApplied = "Rule 1 (4 <= años < 20): topes por 90 UF y años acotados";
        cappedBase =
          cap90UF > 0 && baseAmount > cap90UF ? cap90UF : baseAmount;
        cappedYears = Math.min(years, TOPE_MUTUO_ACUERDO[0].topeAnos);
        yearsIndemnity = cappedBase * cappedYears;
      }
      // Rule 2: 20 to 25 years
      else if (years >= 20 && years < 25) {
        ruleApplied = "Rule 2 (20 <= años < 25): topes por 90 UF y años acotados";
        cappedBase =
          cap90UF > 0 && baseAmount > cap90UF ? cap90UF : baseAmount;
        cappedYears = Math.min(years, TOPE_MUTUO_ACUERDO[1].topeAnos);
        yearsIndemnity = cappedBase * cappedYears;
      }
      // Rule 3: More than 25 years (no caps)
      else if (years >= 25) {
        ruleApplied = "Rule 3 (años >= 25): sin topes";
        yearsIndemnity = baseAmount * years;
      }
      // Fallback for < 4 years or other cases
      else {
        ruleApplied = "Fallback (años < 4): años * totalHaberes";
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

      // Persist audit/logs so Excel can display them
      mutuoEspecialRules = {
        applied: true,
        ruleApplied,
        age,
        years,
        baseAmount,
        cap90UF,
        cappedBase,
        cappedYears,
        result: yearsIndemnity,
      };
    } else {
      // Standard Calculation (Necesidades de la Empresa or Mutuo w/o special data)
      const topeAnos = TOPE_ANOS_INDEMNIZACION[terminationReason];
      const anosTopeados = topeAnos
        ? Math.min(yearsForIndemnity, topeAnos)
        : yearsForIndemnity;
      yearsIndemnity = anosTopeados * totalHaberes;
    }
  }
  yearsIndemnity = Math.round(yearsIndemnity);

  // Años efectivamente pagados (ya topeados), para mostrar en pantalla/Excel/carta.
  const topeAnosCausal = TOPE_ANOS_INDEMNIZACION[terminationReason];
  const yearsForIndemnityCapped =
    mutuoEspecialRules?.cappedYears ??
    (topeAnosCausal ? Math.min(yearsForIndemnity, topeAnosCausal) : yearsForIndemnity);

  // 3. Notice Month = Total Haberes (si no se dio aviso de 30 días)
  // Aplica para: necesidades_empresa (Sí), mutuo_acuerdo (caso a caso), mutuo_acuerdo_especial (como necesidades)
  // NO aplica para: no_concurrencia (No), renuncia (No)
  const noticeIndemnityApplies =
    terminationReason === "necesidades_empresa" ||
    terminationReason === "mutuo_acuerdo" ||
    terminationReason === "mutuo_acuerdo_especial";
  const noticeIndemnity =
    noticeIndemnityApplies && noticeGiven ? totalHaberes : 0;

  // Total Settlement = (Mes de Aviso + Indemnización por Años de Servicio + Vacaciones Proporcionales) - Todos los Descuentos
  const descuentosNum = Math.round(parseFloat(descuentos) || 0);
  const aporteCesantiaNum = Math.round(parseFloat(aporteCesantia) || 0);
  const descuentosAutomaticos = descuentosItems.reduce(
    (sum, d) => sum + Math.round(d.monto || 0),
    0,
  );

  const descuentosCustom = descuentosPersonalizados.reduce((sum, d) => {
    let monto = parseFloat(d.monto) || 0;
    const cuotas = parseInt(d.cuotas) || 1;

    if ((d.moneda || "CLP") === "UF" && ufValue > 0) {
      monto = monto * ufValue;
    }

    return sum + Math.round(monto) * cuotas;
  }, 0);

  const totalDescuentos =
    descuentosNum +
    aporteCesantiaNum +
    descuentosAutomaticos +
    descuentosCustom;
  const liquidacionMesActualNum = Math.round(
    parseFloat(liquidacionMesActual) || 0,
  );
  const totalSettlement =
    noticeIndemnity +
    yearsIndemnity +
    vacationIndemnity +
    liquidacionMesActualNum -
    totalDescuentos;

  // ponytail: guardia en dev. Si algún monto vuelve a quedar con decimales,
  // la pantalla y el Excel se desalinean otra vez; esto lo avisa al tiro.
  if (import.meta.env.DEV && !Number.isInteger(totalSettlement)) {
    console.error("Finiquito: monto con decimales", {
      noticeIndemnity,
      yearsIndemnity,
      vacationIndemnity,
      liquidacionMesActualNum,
      totalDescuentos,
      totalSettlement,
    });
  }

  // Handle generate document - navigate to visualizer with all data
  const handleGenerate = () => {
    try {
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

      // Toggles de remuneración variable. Los items "fetched" se vuelven a pedir a la API
      // al recargar, así que su `active` se guarda por concepto+periodo y no por índice.
      variableCustomAdditions,
      variableFilledActive,
      variableItemsActive: Object.fromEntries(
        variableItems.map((i) => [`${i.concepto}|${i.periodo}`, i.active !== false]),
      ),

      // Moneda elegida por descuento, para que sobreviva a la recarga desde la API.
      descuentosMoneda: Object.fromEntries(
        descuentosPersonalizados.map((d) => [d.descripcion, d.moneda || "CLP"]),
      ),

      // Dates
      lastDayWork,
      notaryDate: new Date(
        new Date(lastDayWork).getTime() + 3 * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .split("T")[0],

      // Manager
      selectedManager: managerObj,

      // Haberes (ya redondeados en el origen)
      noticeIndemnity,
      yearsIndemnity,
      vacationIndemnity,
      totalHaberes,
      yearsForIndemnity,
      vacationDays,
      vacationDaysManuallyEdited,
      vacationCalendarDays: lastDayWork
        ? calculateDiasCorridos(parseLocalDate(lastDayWork), vacationDays)
        : 0,
      liquidacionMesActual: liquidacionMesActualNum,

      movilizacion,

      // Descuentos - find specific types
      descuentos: descuentosNum,
      aporteCesantia: aporteCesantiaNum,
      // For loan, check if we need to send CLP or UF. Usually visualizer expects CLP.
      prestamoInterno: (() => {
        const loanItem = descuentosPersonalizados.find((d) =>
          d.descripcion?.toLowerCase().includes("préstamo"),
        );
        if (!loanItem) return 0;
        let val = parseFloat(loanItem.monto) || 0;
        const cuotas = parseInt(loanItem.cuotas) || 1;

        if ((loanItem.moneda || "CLP") === "UF" && ufValue > 0) val = val * ufValue;

        // Return Total Debt: Monthly * Cuotas
        return Math.round(val) * cuotas;
      })(),
      totalDescuentos,

      ufValue, // Pass UF to visualizer if needed

      // All deductions for flexibility
      descuentosItems,
      descuentosPersonalizados,

      // Total - componentes ya redondeados, misma cifra en pantalla y en Excel
      totalSettlement,

      // Datos para generar Excel de auditoría desde el visualizador (descarga opcional)
      audit: (() => {
        // ponytail: reutiliza los montos ya redondeados en vez de recalcularlos
        const grat = gratificacionLegal;
        const haberesVal = totalHaberes;
        const variableConcepts = Object.keys(expandedVariableGroups || {});
        const variableDetails = variableConcepts.length
          ? variableConcepts.join(", ")
          : "";
        // Detalle solo de ítems efectivamente usados en el promedio:
        // por concepto, activos, sin licencia y hasta 3 meses más recientes
        const variableItemsDetail = [];
        Object.entries(expandedVariableGroups || {}).forEach(
          ([concepto, items]) => {
            const validItems = (items || []).filter(
              (i) => i.active !== false && !i.hasLicense,
            );
            if (!validItems.length) return;
            const sorted = [...validItems].sort((a, b) => {
              const pa = getItemPeriodForSort(a);
              const pb = getItemPeriodForSort(b);
              if (!pa || !pb) return 0;
              if (pa.year !== pb.year) return pb.year - pa.year;
              return pb.month - pa.month;
            });
            const toUse = sorted.slice(0, VALID_VARIABLE_MONTHS_REQUIRED);
            toUse.forEach((it) => {
              variableItemsDetail.push({
                concepto,
                periodo: it.periodo || "",
                monto: parseFloat(it.monto) || 0,
              });
            });
          },
        );
        const causalLabels = {
          necesidades_empresa: "Art. 161 - Necesidades de la empresa",
          mutuo_acuerdo: "Art. 159 N°1 - Mutuo acuerdo",
          mutuo_acuerdo_especial: "Mutuo acuerdo especial",
          no_concurrencia: "Art. 160 N°3 - No concurrencia injustificada",
          renuncia: "Art. 159 N°2 - Renuncia voluntaria",
          vencimiento_plazo: "Art. 159 N°4 - Vencimiento del plazo",
          termino_anticipado: "Art. 159 N°4 - Término anticipado",
        };
        const otrosDesc = Math.max(0, totalDescuentos - aporteCesantiaNum);
        const vacCalendarDays = lastDayWork
          ? calculateDiasCorridos(parseLocalDate(lastDayWork), vacationDays)
          : 0;
        return {
          causalLabel: causalLabels[terminationReason] || terminationReason || "",
          managerName: managerObj?.name || "",
          haberes: haberesVal,
          gratificacion: grat,
          noticeIndemnityResult: noticeIndemnity,
          yearsIndemnityResult: yearsIndemnity,
          vacationIndemnityResult: vacationIndemnity,
          vacationCalendarDays: vacCalendarDays,
          liquidacionMesActual: liquidacionMesActualNum,
          otrosDescuentos: otrosDesc > 0 ? otrosDesc : 0,
          aporteCesantiaVal: aporteCesantiaNum,
          totalSettlementResult: totalSettlement,
          yearsForIndemnity,
          salary,
          variableBonus,
          movilizacion,
          variableDetails,
          variableItemsDetail,
          mutuoEspecialRules,
        };
      })(),
      };

      // Navegar primero para no depender de sessionStorage (state se pasa por location.state)
      navigate(`/finiquitos/visualizar/${rut}`, { state: finiquitoData });

      // Persistir en sessionStorage para pestaña nueva / volver (no debe bloquear la navegación)
      try {
        sessionStorage.setItem(`finiquito_${rut}`, JSON.stringify(finiquitoData));
      } catch (e) {
        console.warn("No se pudo guardar finiquito en sessionStorage:", e);
      }

      // Persistir el proceso y sellar el hito. El registro no es requisito para generar
      // el documento: si falla, el usuario ya tiene su carta.
      // El total se congela aquí: es el monto de la carta que el usuario acaba de generar.
      persistirProceso(finiquitoData, "carta", Math.round(totalSettlement));
    } catch (err) {
      console.error("Error al generar finiquito:", err);
      alert("Ocurrió un error al generar el finiquito. Revise la consola para más detalles.");
    }
  };

  // Descargar Word basado en plantilla de Renuncia Voluntaria
  const handleDownloadWord = async () => {
    try {
      if (!employee) {
        alert("No hay datos de empleado para generar el documento.");
        return;
      }
      if (!lastDayWork) {
        alert("Por favor seleccione la fecha de término del contrato");
        return;
      }

      // Mapeo básico de datos desde CrearFiniquito (similar a Visualizador)
      const terminationDate = lastDayWork;
      const notaryDate = new Date(
        new Date(lastDayWork).getTime() + 10 * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .split("T")[0];

      const fmtCurrency = (n) =>
        `$ ${Math.round(n || 0).toLocaleString("es-CL")}.-`;

      // Construir tabla de haberes como texto multilinea (coherente con sección HABERES)
      const haberesLines = [];
      const descuentosLines = [];

      const isMutuo =
        terminationReason === "mutuo_acuerdo" ||
        terminationReason === "mutuo_acuerdo_especial";
      const isRenuncia = terminationReason === "renuncia";

      // ponytail: usa los montos ya redondeados del cálculo principal
      const descuentosMesActualNum = descuentosNum;

      // Valores coherentes con sección "Cálculo indemnización"
      const yearsIndemnityDisplay = isMutuo
        ? yearsIndemnity - aporteCesantiaNum
        : yearsIndemnity;

      let totalHaberesTabla = 0;
      let totalDescuentosTabla = 0;

      if (isRenuncia) {
        // Para renuncia voluntaria: mostrar Vacaciones pendientes y Remuneración adeudada
        if (vacationIndemnity > 0) {
          const dias =
            lastDayWork && vacationDays
              ? calculateDiasCorridos(
                  parseLocalDate(lastDayWork),
                  vacationDays,
                ).toFixed(1)
              : (vacationDays || 0).toFixed(1);
          haberesLines.push(
            `Vacaciones pendientes (${dias} días)\t${fmtCurrency(vacationIndemnity)}`,
          );
        }

        if (liquidacionMesActualNum > 0) {
          haberesLines.push(
            `Remuneración adeudada\t${fmtCurrency(liquidacionMesActualNum)}`,
          );
        }

        if (descuentosMesActualNum > 0) {
          descuentosLines.push(
            `Diferencia remuneración\t${fmtCurrency(descuentosMesActualNum)}`,
          );
        }

        totalHaberesTabla = (Number(vacationIndemnity) || 0) + liquidacionMesActualNum;
        totalDescuentosTabla = Number(descuentosMesActualNum) || 0;

      } else {
        // Resto de causales: mantener lógica de indemnizaciones + vacaciones proporcionales
        if (terminationReason === "necesidades_empresa" && noticeIndemnity > 0) {
          haberesLines.push(
            `Indemnización mes de aviso\t${fmtCurrency(noticeIndemnity)}`,
          );
        }
        if (yearsIndemnityDisplay > 0) {
          const yearsLabel =
            terminationReason === "mutuo_acuerdo_especial"
              ? `Indemnización Convencional (${yearsForIndemnityCapped || 0} años)`
              : `Indemnización años de Servicios (${yearsForIndemnityCapped || 0} años)`;
          haberesLines.push(`${yearsLabel}\t${fmtCurrency(yearsIndemnityDisplay)}`);
        }
        if (vacationIndemnity > 0) {
          const dias =
            lastDayWork && vacationDays
              ? calculateDiasCorridos(
                  parseLocalDate(lastDayWork),
                  vacationDays,
                ).toFixed(1)
              : (vacationDays || 0).toFixed(1);
          haberesLines.push(
            `Vacaciones Proporcionales (${dias} días)\t${fmtCurrency(vacationIndemnity)}`,
          );
        }
        if (descuentosMesActualNum > 0) {
          descuentosLines.push(
            `Diferencia remuneración (${["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"][Number((terminationDate||"").split("-")[1])-1] || terminationDate})\t${fmtCurrency(descuentosMesActualNum)}`,
          );
        }

        if (liquidacionMesActualNum > 0) {
          haberesLines.push(
            `Remuneración adeudada\t${fmtCurrency(liquidacionMesActualNum)}`,
          );
        }

        totalHaberesTabla =
          (Number(noticeIndemnity) || 0) +
          (Number(yearsIndemnityDisplay) || 0) +
          (Number(vacationIndemnity) || 0) +
          liquidacionMesActualNum;

        totalDescuentosTabla = Number(descuentosMesActualNum) || 0;
      }

      // Agregar descuentos automáticos del backend (independiente de la causal)
      descuentosItems.forEach((d) => {
        const monto = Math.round(d.monto || 0);
        if (monto > 0) {
          let label = d.concepto || "Descuento";
          if (label === "Prestamo Interno") label = "Préstamo Interno";
          if (label === "Descuento Por Planilla") label = "Descuento por planilla";
          descuentosLines.push(`${label}\t${fmtCurrency(monto)}`);
          totalDescuentosTabla += monto;
        }
      });

      // Agregar descuentos personalizados (independiente de la causal)
      descuentosPersonalizados.forEach((d) => {
        let monto = parseFloat(d.monto) || 0;
        const cuotas = parseInt(d.cuotas) || 1;
        if ((d.moneda || "CLP") === "UF" && ufValue > 0) {
          monto = monto * ufValue;
        }
        const total = Math.round(monto) * cuotas;
        if (total > 0) {
          const label = `${d.descripcion || "Descuento"}${sufijoCuotas(d.cuotas)}`;
          descuentosLines.push(`${label}\t${fmtCurrency(total)}`);
          totalDescuentosTabla += total;
        }
      });

      // Aporte Empleador Seguro Cesantía (independiente de la causal)
      if (aporteCesantiaNum > 0 && !isMutuo) {
        descuentosLines.push(`Aporte Empleador Seguro Cesantía\t${fmtCurrency(aporteCesantiaNum)}`);
        totalDescuentosTabla += aporteCesantiaNum;
      }

      // ponytail: guardia en dev. La tabla del Word y el "total a pagar" se
      // arman por caminos distintos; deben dar exactamente lo mismo.
      if (
        import.meta.env.DEV &&
        totalHaberesTabla - totalDescuentosTabla !== totalSettlement
      ) {
        console.error("Finiquito: tabla Word no cuadra con el total", {
          totalHaberesTabla,
          totalDescuentosTabla,
          diferencia: totalHaberesTabla - totalDescuentosTabla - totalSettlement,
          totalSettlement,
        });
      }

      haberesLines.push(`Total haberes\t${fmtCurrency(totalHaberesTabla)}`);
      if (totalDescuentosTabla > 0) {
        descuentosLines.push(`Total descuentos\t${fmtCurrency(totalDescuentosTabla)}`);
      }

      // Convertir líneas en estructura tabular para Word:
      // cada elemento será una fila de tabla: { concepto, monto }.
      const haberesRows = haberesLines.map((line) => {
        const [labelRaw, amountRaw] = line.split("\t");
        return {
          concepto: (labelRaw || "").trim(),
          monto: (amountRaw || "").trim(),
        };
      });

      const descuentosRows = totalDescuentosTabla > 0
        ? descuentosLines.map((line) => {
            const [labelRaw, amountRaw] = line.split("\t");
            return {
              concepto: (labelRaw || "").trim(),
              monto: (amountRaw || "").trim(),
            };
          })
        : [];

      // Representación en texto simple (por compatibilidad)
      const haberesTable = haberesRows
        .map((row) => `${row.concepto}\t${row.monto}`)
        .join("\n");

      const descuentosTable = descuentosRows
        .map((row) => `${row.concepto}\t${row.monto}`)
        .join("\n");

      // Títulos fijos para cada tabla
      const haberesTableTitle = "HABERES";
      const descuentosTableTitle = totalDescuentosTabla > 0 ? "DESCUENTOS" : "";

      // Contexto para placeholders del Word
      const managerObj =
        managers.find((m) => m.id === selectedManager) || managers[0];

      const getCausalDescription = (reason) => {
        switch (reason) {
          case "renuncia":
            return '“Renuncia del trabajador” de conformidad con lo dispuesto en el artículo 159 inciso 2° del Código del Trabajo';
          case "no_concurrencia":
            return 'Art. 160 N° 3 del Código del Trabajo, esto es, "No concurrencia del trabajador a sus labores sin causa justificada".';
          case "vencimiento_plazo":
          case "termino_anticipado":
            return 'Art. 159 N° 4 del Código del Trabajo, esto es, "Vencimiento del plazo convenido en el contrato de trabajo".';
          case "mutuo_acuerdo":
            return 'Art. 159 N° 1 del Código del Trabajo, esto es, "Mutuo acuerdo de las partes".';
          case "mutuo_acuerdo_especial":
            return '"Mutuo acuerdo de las partes" de conformidad con lo dispuesto en el artículo 159 N° 1 del Código del Trabajo.';
          case "necesidades_empresa":
          default:
            return 'Art. 161 inciso 1° del Código del Trabajo, esto es, "Necesidades de la Empresa, Establecimiento o Servicio".';
        }
      };

      const companyDetails = getCompanyDetails(employee?.nombre_empresa);

      const wordContext = {
        // Placeholders solicitados
        fecha_hoy: formatDateWordsLong(new Date().toISOString().split("T")[0]),
        empresa: employee?.nombre_empresa || "",
        rut_empresa: companyDetails.rut,
        nombre_trabajador: employee?.nombre_trabajador || "",
        rut_trabajador: employee?.rut_trabajador || "",
        direccion: (employee?.direccion || "").toUpperCase(),
        comuna: (employee?.comuna || "").toUpperCase(),
        active_since: formatDateWordsLong(employee?.fecha_ingreso || ""),
        causal_despido: getCausalDescription(terminationReason),
        sujeto_termino: terminationReason === "renuncia" ? "el trabajador" : "el empleador",
        total_finiquito: fmtCurrency(totalSettlement),
        total_finiquito_letras: numeroALetrasCLP(totalSettlement),
        haberes_table: haberesTable,
        haberes_rows: haberesRows,
        haberes_title: haberesTableTitle,
        total_haberes_tabla: fmtCurrency(totalHaberesTabla),
        descuentos_title: descuentosTableTitle,
        descuentos_table: descuentosTable,
        descuentos_rows: descuentosRows,
        total_descuentos_tabla: fmtCurrency(totalDescuentosTabla),
        total_a_pagar_tabla: fmtCurrency(totalHaberesTabla - totalDescuentosTabla),

        // Otros campos ya usados en distintas partes (compatibilidad)
        nombre_trabajador: employee?.nombre_trabajador || "",
        rut_trabajador: employee?.rut_trabajador || "",
        direccion: employee?.direccion || "",
        comuna: employee?.comuna || "",
        cargo: employee?.cargo || "",
        fecha_ingreso: employee?.fecha_ingreso || "",
        fecha_salida: formatDateWordsLong(terminationDate || ""),
        nombre_jefe: employee?.nombre_jefe || "",
        nombre_empresa: employee?.nombre_empresa || "",
        nombre_gerente: managerObj?.name || "",
        cargo_gerente: managerObj?.title || "",
        fecha_notaria: notaryDate || "",
        mes_de_aviso: fmtCurrency(noticeIndemnity),
        indemnizacion_anos_servicio: fmtCurrency(yearsIndemnity),
        indemnizacion_convencional: fmtCurrency(yearsIndemnityDisplay),
        aporte_cesantia: fmtCurrency(aporteCesantiaNum),
        vacaciones_proporcionales: fmtCurrency(vacationIndemnity),
        remuneracion_adeudada: fmtCurrency(liquidacionMesActualNum),
        total_haberes: fmtCurrency(totalHaberes),
        total_descuentos: fmtCurrency(totalDescuentos),
        total_a_pagar: fmtCurrency(totalSettlement),
      };

      // IMPORTANTE: la plantilla debe ser .docx para funcionar con docxtemplater
      const empresaNombre = (employee?.nombre_empresa || "").toLowerCase();
      const templateUrl = empresaNombre.includes("sabores")
        ? "/Formato Renuncia Voluntaria Syf.docx"
        : "/Formato Renuncia Voluntaria.docx";
      const templateResponse = await fetch(
        encodeURI(`${templateUrl}?v=${Date.now()}`),
        { cache: "no-store" },
      );
      if (!templateResponse.ok) {
        alert(
          `No se pudo cargar la plantilla Word (${templateUrl}). Asegúrate de que exista en /public.`,
        );
        return;
      }
      const arrayBuffer = await templateResponse.arrayBuffer();
      // Los .docx son ZIP; los .doc antiguos no. Si el archivo fue renombrado de .doc a .docx, falla aquí.
      const bytes = new Uint8Array(arrayBuffer);
      const isZip =
        bytes.length >= 4 &&
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b &&
        (bytes[2] === 0x03 || bytes[2] === 0x05) &&
        (bytes[3] === 0x04 || bytes[3] === 0x06);
      if (!isZip) {
        alert(
          "La plantilla no parece ser un archivo .docx válido. Abre 'Formato Renuncia Voluntaria.doc' en Word y guárdala como 'Formato Renuncia Voluntaria.docx' (formato Word 2007+).",
        );
        return;
      }
      const zip = new PizZip(arrayBuffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => "",
        delimiters: { start: "{{", end: "}}" }, // La plantilla usa {{placeholder}}
      });

      doc.setData(wordContext);
      doc.render();

      const out = doc.getZip().generate({
        type: "blob",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const blobUrl = URL.createObjectURL(out);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `Finiquito_${employee?.rut_trabajador || "trabajador"}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      // El documento ya está descargado; el registro va después y no lo condiciona.
      persistirProceso(proceso?.payload_json || null, "finiquito");
    } catch (err) {
      console.error("Error al generar documento Word:", err);
      if (err?.properties?.errors?.length) {
        err.properties.errors.forEach((e, i) =>
          console.error(`Docxtemplater error ${i + 1}:`, e),
        );
      }
      const msg = err?.message || String(err);
      alert(
        `Ocurrió un error al generar el documento Word: ${msg}. Revisa la consola para más detalles.`,
      );
    }
  };

  // Variación del total respecto al monto congelado al generar la última carta.
  // null mientras no haya carta generada: sin referencia no hay nada que comparar.
  const totalCongelado = proceso?.total_finiquito ?? null;
  const variacionTotal =
    totalCongelado != null ? Math.round(totalSettlement) - Math.round(totalCongelado) : 0;

  // Pestañas del proceso. `listo` marca ✓ en la barra; hoy solo el primer paso tiene
  // campos obligatorios (los mismos que valida handleGenerate).
  const TABS = [
    { nombre: "Datos y término", icono: "person", listo: !!lastDayWork && !!terminationReason },
    { nombre: "Remuneración", icono: "payments", listo: variableItems.length > 0 },
    { nombre: "Compensación", icono: "beach_access", listo: vacationValue > 0 },
    { nombre: "Indemnización", icono: "calculate", listo: totalSettlement > 0 },
    { nombre: "Generar", icono: "description", listo: !!proceso?.carta_generada_at },
  ];

  return (
    <SidebarLayout>
      <main className="p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-app-muted mb-2">
            <span
              className="cursor-pointer hover:text-app-brand"
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
            <span className="font-semibold text-app-ink">
              Generador finiquito
            </span>
          </div>

          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-bold text-app-ink">
                Generador finiquito
              </h1>
              <p className="text-app-muted mt-1">
                Formulario de generación de finiquito
              </p>
            </div>
          </div>
        </div>

        {/* Employee Card */}
        <div className="bg-white p-6 rounded-xl  border border-app-line mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-app-surface flex items-center justify-center text-app-brand text-xl font-bold">
              {employee.nombre_trabajador.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-app-ink">
                {employee.nombre_trabajador}
              </h2>
              <div className="flex items-center gap-3 text-sm text-app-muted mt-1">
                <span className="font-mono">
                  RUT: {employee.rut_trabajador}
                </span>
                <span>•</span>
                <span className="text-app-brand font-medium">
                  {employee.cargo}
                </span>
                <span>•</span>
                <span>{employee.nombre_area || "Engineering Dept"}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-app-outline uppercase font-bold tracking-wider mb-1">
              FECHA INICIO
            </p>
            <p className="font-semibold text-app-ink">
              {new Date(employee.fecha_ingreso).toLocaleDateString("es-CL", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        {/* Barra de pestañas */}
        <div className="bg-white rounded-xl  border border-app-line mb-6 flex overflow-x-auto">
          {TABS.map((t, i) => (
            <button
              key={t.nombre}
              onClick={() => irATab(i)}
              className={`flex-1 min-w-[150px] px-4 py-3 flex items-center justify-center gap-2 text-sm font-medium border-b-2 transition-colors ${
                tabActiva === i
                  ? "border-app-ink text-app-brand bg-app-surface/50"
                  : "border-transparent text-app-muted hover:text-app-muted hover:bg-app-surface"
              }`}
            >
              <span className="material-symbols-outlined text-lg">
                {t.listo ? "check_circle" : t.icono}
              </span>
              <span className="whitespace-nowrap">
                {i + 1}. {t.nombre}
              </span>
            </button>
          ))}
        </div>

        {/* Alerta de variación del monto. Fuera de las pestañas: el total puede cambiar
            desde cualquier paso y el usuario tiene que verlo sin ir a buscarlo. */}
        {variacionTotal !== 0 && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-xl mb-6 flex items-start gap-3">
            <span className="material-symbols-outlined text-red-600">priority_high</span>
            <div className="text-sm">
              <p className="font-bold text-red-800">
                El total cambió respecto a la carta generada
              </p>
              <p className="text-red-700 mt-1">
                Carta del {new Date(proceso.carta_generada_at).toLocaleString("es-CL")}:{" "}
                <strong>$ {Math.round(totalCongelado).toLocaleString("es-CL")}</strong> · Ahora:{" "}
                <strong>$ {Math.round(totalSettlement).toLocaleString("es-CL")}</strong> ·
                Diferencia:{" "}
                <strong>
                  {variacionTotal > 0 ? "+" : "−"} $
                  {Math.abs(variacionTotal).toLocaleString("es-CL")}
                </strong>
              </p>
              <p className="text-red-600 text-xs mt-1">
                Genera la carta de nuevo para congelar el monto actual.
              </p>
            </div>
          </div>
        )}

        {/* --- Paso 1: Datos y término --- */}
        <div hidden={tabActiva !== 0}>

        {/* Termination Details */}
        <div className="bg-white p-6 rounded-xl  border border-app-line mb-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-app-surface text-app-brand flex items-center justify-center">
              <span className="material-symbols-outlined">gavel</span>
            </div>
            <h3 className="text-lg font-bold text-app-ink">
              Detalles de término
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-sm font-semibold text-app-muted mb-2">
                Razón de término <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full p-3 bg-white border border-app-line rounded-lg focus:ring-2 focus:ring-app-ink focus:border-app-ink outline-none transition-all"
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
                <option value="vencimiento_plazo">
                  Art. 159 N°4 - Vencimiento del plazo
                </option>
                <option value="termino_anticipado">
                  Art. 159 N°4 - Término anticipado
                </option>
              </select>
              <p className="text-xs text-app-outline mt-2">
                Esta selección determina la base de cálculo de la indemnización.
              </p>

              {/* Salary History Trigger for Mutuo Acuerdo */}
              {terminationReason === "mutuo_acuerdo" && (
                <div className="mt-4">
                  <button
                    onClick={handleFetchSalaryHistory}
                    disabled={isLoadingSalaryHistory}
                    className="flex items-center gap-2 text-sm text-app-brand font-medium hover:text-app-brand disabled:opacity-50"
                  >
                    {isLoadingSalaryHistory ? (
                      <span className="w-4 h-4 border-2 border-app-ink border-t-transparent rounded-full animate-spin"></span>
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
                      <div className="bg-app-surface px-3 py-2 border-b flex justify-between items-center">
                        <span className="text-xs font-bold text-app-muted uppercase">
                          Historial de Sueldos Base
                        </span>
                        <div className="flex gap-3">
                          <span className="text-xs font-bold text-app-brand bg-app-surface px-2 py-0.5 rounded border border-app-line">
                            Promedio: $
                            {Math.round(
                              salaryHistory.reduce(
                                (s, i) => s + (i.amount || 0),
                                0,
                              ) / salaryHistory.length,
                            ).toLocaleString("es-CL")}
                          </span>
                          <span className="text-xs text-app-muted">
                            {salaryHistory.length} registros
                          </span>
                        </div>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-app-surface sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-app-muted uppercase tracking-wider">
                                Periodo
                              </th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-app-muted uppercase tracking-wider">
                                Monto
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-app-line">
                            {salaryHistory.map((item, idx) => (
                              <tr key={idx} className="hover:bg-app-surface">
                                <td className="px-3 py-2 text-app-ink font-mono text-xs">
                                  {item.period}
                                </td>
                                <td className="px-3 py-2 text-right text-app-ink font-medium">
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
                <label className="block text-sm font-semibold text-app-muted mb-2">
                  Fecha de salida <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  className="w-full p-3 bg-white border border-app-line rounded-lg focus:ring-2 focus:ring-app-ink outline-none"
                  value={lastDayWork}
                  onChange={(e) => setLastDayWork(e.target.value)}
                />
              </div>
              <div className="flex items-center pt-8">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded border-app-line text-app-brand focus:ring-app-ink cursor-pointer"
                    checked={noticeGiven}
                    onChange={(e) => setNoticeGiven(e.target.checked)}
                  />
                  <div>
                    <p className="font-semibold text-app-ink group-hover:text-app-brand transition-colors">
                      30 días de aviso
                    </p>
                    <p className="text-xs text-app-outline">
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Manager Selection */}
            <div className="mt-6">
              <label className="block text-sm font-semibold text-app-muted mb-2">
                Gerente firmante <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full p-3 bg-white border border-app-line rounded-lg focus:ring-2 focus:ring-app-ink focus:border-app-ink outline-none transition-all"
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
              <p className="text-xs text-app-outline mt-2">
                Este gerente aparecerá como firmante en el documento de
                finiquito.
              </p>
            </div>
          </div>
        </div>

        </div>

        {/* --- Paso 2: Remuneración --- */}
        <div hidden={tabActiva !== 1}>

        {/* Recent Licenses Table (collapsible, shows all 15 from backend) */}
        {/* Colapsada solo necesita alto para el título: menos padding y sin margen inferior */}
        <div
          className={`bg-white rounded-xl  border border-app-line mb-6 ${
            licenciasTableCollapsed ? "px-6 py-3" : "p-6"
          }`}
        >
          <div
            className={`flex items-center gap-2 cursor-pointer select-none ${
              licenciasTableCollapsed ? "" : "mb-6"
            }`}
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
              className="p-0.5 rounded hover:bg-app-surface transition-colors text-app-muted hover:text-app-muted"
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
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <span className="material-symbols-outlined">
                medical_information
              </span>
            </div>
            <h3 className="text-lg font-bold text-app-ink">
              Licencias recientes
            </h3>
            <span className="ml-auto px-2 py-1 bg-app-surface text-app-muted text-xs font-medium rounded-full">
              {licencias.length} registro{licencias.length !== 1 ? "s" : ""}
            </span>
          </div>

          {!licenciasTableCollapsed && (
          <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <label className="flex items-center gap-2 text-sm text-app-muted">
              <span>Mostrar últimos</span>
              <select
                value={licenciasLimit}
                onChange={(e) => setLicenciasLimit(Number(e.target.value))}
                className="rounded-lg border border-app-line px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-app-ink focus:border-app-ink"
              >
                {[5, 10, 15, 20, 30, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="text-app-outline">registros</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-app-muted">
              <span>Orden</span>
              <select
                value={licenciasOrder}
                onChange={(e) => setLicenciasOrder(e.target.value)}
                className="rounded-lg border border-app-line px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-app-ink focus:border-app-ink"
              >
                <option value="desc">Más recientes primero</option>
                <option value="asc">Ascendente (más antiguas primero)</option>
              </select>
            </label>
          </div>
          {licencias.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed border-app-line rounded-lg bg-app-surface">
              <span className="material-symbols-outlined text-app-outline text-4xl mb-2">
                event_busy
              </span>
              <p className="text-app-muted font-medium">
                No se encontraron licencias
              </p>
              <p className="text-xs text-app-outline">
                Este empleado no tiene licencias registradas.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white  z-10">
                  <tr className="border-b border-app-line">
                    <th className="text-left py-3 px-4 font-semibold text-app-muted uppercase text-xs tracking-wider">
                      Razón
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-app-muted uppercase text-xs tracking-wider">
                      Fecha de inicio
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-app-muted uppercase text-xs tracking-wider">
                      Fecha de fin
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-app-muted uppercase text-xs tracking-wider">
                      Días
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-app-muted uppercase text-xs tracking-wider">
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
                        className="border-b border-app-line hover:bg-app-surface transition-colors"
                      >
                        <td className="py-3 px-4">
                          <span className="font-medium text-app-ink">
                            {lic.tipo_permiso || "Sin especificar"}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-app-muted">
                          {startDate.toLocaleDateString("es-CL")}
                        </td>
                        <td className="py-3 px-4 font-mono text-app-muted">
                          {endDate.toLocaleDateString("es-CL")}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-app-ink">
                            {diffDays}
                          </span>
                          <span className="text-app-outline ml-1">days</span>
                        </td>
                        <td className="py-3 px-4">
                          {isActive ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold uppercase rounded-full">
                              Active
                            </span>
                          ) : isPast ? (
                            <span className="px-2 py-1 bg-app-surface text-app-muted text-xs font-bold uppercase rounded-full">
                              Completed
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-app-surface text-app-brand text-xs font-bold uppercase rounded-full">
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
        <div className="bg-white p-6 rounded-xl  border border-app-line mb-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-app-surface text-app-brand flex items-center justify-center">
                <span className="material-symbols-outlined">payments</span>
              </div>
              <h3 className="text-lg font-bold text-app-ink">
                Resumen remuneración variable
              </h3>
            </div>
            <div className="flex items-center gap-3 text-sm text-app-muted">
              <label className="flex items-center gap-2">
                <span>Usar últimos</span>
                <select
                  value={itemsLimit}
                  onChange={(e) => setItemsLimit(Number(e.target.value) || 15)}
                  className="rounded-lg border border-app-line px-2 py-1.5 text-xs bg-white focus:ring-2 focus:ring-app-ink focus:border-app-ink"
                >
                  {[6, 12, 15, 24, 36].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span className="text-app-outline">períodos</span>
              </label>

              <button
                type="button"
                onClick={() => setItemsRefreshToken((t) => t + 1)}
                className="p-2 rounded-lg border border-app-line bg-white hover:bg-app-surface transition-colors"
                title="Actualizar lista"
              >
                <span className="material-symbols-outlined text-app-muted">
                  refresh
                </span>
              </button>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            <p className="text-sm text-app-muted mb-4">
              El promedio se calcula con los últimos 3 meses válidos por concepto
              (sin licencia; se incluyen meses con valor 0). Los meses sin asignación se muestran con $0.
              Los meses con licencia médica se deseleccionan por defecto.
            </p>
            {variableItems.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-app-line rounded-lg bg-app-surface">
                <span className="material-symbols-outlined text-app-outline text-4xl mb-2">
                  money_off
                </span>
                <p className="text-app-muted font-medium">
                  No se encontraron bonos
                </p>
                <p className="text-xs text-app-outline">
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
                      className="border border-app-line rounded-lg overflow-hidden mb-3"
                    >
                      {/* Header del grupo */}
                      <div
                        className={`flex items-center justify-between p-4 bg-app-surface ${isCollapsed ? "" : "border-b border-app-line"}`}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="p-0.5 rounded hover:bg-app-line transition-colors text-app-muted hover:text-app-muted"
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
                            className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${allActive ? "bg-app-on" : "bg-app-line"}`}
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
                              className={`w-4 h-4 bg-white rounded-full  transform transition-transform ${allActive ? "translate-x-6" : ""}`}
                            ></div>
                          </div>
                          <div>
                            <p className="font-bold text-app-ink">
                              {concepto}
                            </p>
                            <p className="text-xs text-app-muted">
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
                                className="w-32 px-2 py-1 text-sm border border-app-line rounded focus:ring-1 focus:ring-app-ink outline-none"
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
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-app-muted text-xs">
                                  $
                                </span>
                                <input
                                  type="number"
                                  placeholder="Monto"
                                  className="w-24 pl-5 pr-2 py-1 text-sm border border-app-line rounded focus:ring-1 focus:ring-app-ink outline-none"
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
                                className="p-1 px-2 bg-app-ink text-white rounded hover:bg-app-ink/90 text-xs font-medium"
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
                                className="p-1 text-app-muted hover:text-app-muted"
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
                              className="text-xs flex items-center gap-1 text-app-brand hover:text-app-brand font-medium px-2 py-1 bg-app-surface rounded hover:bg-app-surface transition-colors"
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
                      <div className="divide-y divide-app-line">
                        {items.map((bonus, idx) => (
                          <div
                            key={bonus.type === "filled" ? bonus.filledKey : idx}
                            className={`flex items-center justify-between p-4 bg-white hover:bg-app-surface transition-colors ${bonus.type === "custom" ? "bg-app-surface/30" : ""} ${bonus.type === "filled" ? "bg-app-surface/50" : ""}`}
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
                                  className="material-symbols-outlined text-xs text-app-outline"
                                  title="Mes sin asignación"
                                >
                                  remove_circle_outline
                                </span>
                              )}
                              {bonus.hasLicense && (
                                <span
                                  className="material-symbols-outlined text-xs text-app-brand"
                                  title="Mes con licencia médica"
                                >
                                  medical_services
                                </span>
                              )}
                              <div>
                                <p className="font-medium text-app-muted">
                                  {bonus.type === "custom"
                                    ? bonus.descripcion
                                    : bonus.periodo}
                                </p>
                                {bonus.type === "custom" && (
                                  <p className="text-xs text-app-outline">
                                    Manual
                                  </p>
                                )}
                                {bonus.type === "filled" && (
                                  <p className="text-xs text-app-outline">
                                    Sin asignación
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <span
                                className={`font-mono font-medium ${bonus.active !== false ? "text-app-ink" : "text-app-outline"}`}
                              >
                                $ {(bonus.monto || 0).toLocaleString("es-CL")}
                              </span>

                              {/* Item Toggle */}
                              <div
                                className={`w-10 h-5 rounded-full p-0.5 cursor-pointer transition-colors ${bonus.active !== false ? "bg-app-on" : "bg-app-line"}`}
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
                                  className={`w-4 h-4 bg-white rounded-full  transform transition-transform ${bonus.active !== false ? "translate-x-5" : ""}`}
                                ></div>
                              </div>

                              {/* Delete button for custom items */}
                              {bonus.type === "custom" && (
                                <button
                                  className="text-app-outline hover:text-red-500 transition-colors"
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

        </div>

        {/* --- Paso 3: Compensación --- */}
        <div hidden={tabActiva !== 2}>

        {/* Compensation & Vacation */}
        <div className="bg-white p-6 rounded-xl  border border-app-line mb-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-app-brand flex items-center justify-center">
              <span className="material-symbols-outlined">beach_access</span>
            </div>
            <h3 className="text-lg font-bold text-app-ink">
              Compensación y Vacaciones
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-semibold text-app-muted flex items-center gap-2">
                  Días de Vacaciones Pendientes
                  {/* Punto de respiración: recuerda revisar el valor antes de generar */}
                  <span
                    className="relative flex h-2.5 w-2.5"
                    title="Recuerda ajustar"
                  >
                    <span className="absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75 animate-ping"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-app-ink"></span>
                  </span>
                  <span className="text-xs font-normal text-app-brand">
                    Recuerda ajustar
                  </span>
                </label>
              </div>
              <div className="flex items-stretch gap-2">
                <button
                  type="button"
                  aria-label="Restar medio día"
                  className="px-3 rounded-lg border-2 border-app-ink bg-white font-bold text-app-ink hover:bg-app-ink hover:text-white transition-colors"
                  onClick={() => ajustarVacationDays(-0.5)}
                >
                  −
                </button>
                <div className="relative flex-1">
                  <input
                    ref={vacationInputRef}
                    type="number"
                    step="0.1"
                    min="0"
                    inputMode="decimal"
                    className="w-full p-3 bg-white border-2 border-app-ink rounded-lg focus:ring-2 focus:ring-app-ink focus:border-app-ink outline-none font-medium text-app-ink"
                    value={vacationDaysInput}
                    onChange={(e) => {
                      const texto = e.target.value;
                      setVacationDaysInput(texto);
                      setVacationDaysManuallyEdited(true);
                      // Campo vacío o a medio escribir ("12.") no vale como número todavía:
                      // se deja el texto y el número se fija al salir del campo.
                      const n = parseFloat(texto);
                      if (!Number.isNaN(n)) setVacationDays(truncDias(n));
                    }}
                    onFocus={(e) => e.target.select()}
                    onBlur={() => {
                      const n = truncDias(parseFloat(vacationDaysInput));
                      const limpio = Number.isFinite(n) && n > 0 ? n : 0;
                      setVacationDays(limpio);
                      setVacationDaysInput(limpio.toFixed(1));
                    }}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-app-outline text-sm flex items-center gap-2 pointer-events-none">
                    {isLoadingVacation && (
                      <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-app-ink"></span>
                    )}
                    Días
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Sumar medio día"
                  className="px-3 rounded-lg border-2 border-app-ink bg-white font-bold text-app-ink hover:bg-app-ink hover:text-white transition-colors"
                  onClick={() => ajustarVacationDays(0.5)}
                >
                  +
                </button>
              </div>
              <div className="mt-1 space-y-0.5">
                <p className="text-xs text-app-brand flex items-center gap-1">
                  <span className="material-symbols-outlined text-[10px]">
                    check_circle
                  </span>
                  Stock Buk: {vacationDaysStock.toFixed(1)} días
                </p>
                {lastDayWork &&
                  vacationDays !== vacationDaysStock &&
                  !vacationDaysManuallyEdited && (
                    <p className="text-xs text-app-brand flex items-center gap-1">
                      <span className="material-symbols-outlined text-[10px]">
                        trending_up
                      </span>
                      Proyectado al{" "}
                      {parseLocalDate(lastDayWork).toLocaleDateString("es-CL")}:
                      +{truncDias(vacationDays - vacationDaysStock).toFixed(1)} días
                    </p>
                  )}
                {vacationDaysManuallyEdited && (
                  <p className="text-xs text-app-brand flex items-center gap-1">
                    <span className="material-symbols-outlined text-[10px]">
                      edit
                    </span>
                    Editado manualmente
                    <button
                      className="ml-1 underline hover:no-underline"
                      onClick={() => {
                        clearVacationCache(lastDayWork);
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
              <label className="block text-sm font-semibold text-app-muted mb-2">
                Valor Vacaciones (Calculado)
              </label>
              <div className="w-full p-3 bg-app-surface border border-app-line rounded-lg text-app-muted font-mono">
                $ {vacationValue.toLocaleString("es-CL")}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Base Salary Input */}
            <div>
              <label className="block text-sm font-semibold text-app-muted mb-2">
                Sueldo Base <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-app-outline">$</span>
                <input
                  type="number"
                  className="w-full p-3 pl-8 bg-white border border-app-line rounded-lg focus:ring-2 focus:ring-app-ink focus:border-app-ink outline-none transition-all"
                  value={salary}
                  onChange={(e) => setSalary(Number(e.target.value))}
                />
              </div>
              <p className="text-xs text-app-brand mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[10px]">
                  check_circle
                </span>
                Extraído desde Buk
              </p>
              {terminationReason === "mutuo_acuerdo" && averageSalary > 0 && (
                <p className="text-xs text-app-brand mt-1 flex items-center gap-1 bg-app-surface p-1.5 rounded border border-app-line">
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
              <label className="block text-sm font-semibold text-app-muted mb-2">
                Bonos Variables (Calculado)
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 p-3 bg-app-surface border border-app-line rounded-lg text-app-muted font-mono">
                  $ {variableBonus.toLocaleString("es-CL")}
                </div>
                <span className="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-bold uppercase rounded tracking-wider">
                  Calculado
                </span>
              </div>
            </div>
          </div>

          <button className="mt-6 px-4 py-2 bg-app-surface hover:bg-app-line text-app-muted rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
            <span className="material-symbols-outlined text-lg">
              add_circle
            </span>
            Agregar items (en desarrollo)
          </button>
        </div>

        </div>

        {/* --- Paso 4: Indemnización --- */}
        <div hidden={tabActiva !== 3}>

        {/* Indemnity Calculations */}
        <div className="bg-white p-6 rounded-xl  border border-app-line mb-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-app-surface text-app-brand flex items-center justify-center">
              <span className="material-symbols-outlined">calculate</span>
            </div>
            <h3 className="text-lg font-bold text-app-ink">
              Cálculo indemnización
            </h3>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-app-surface p-4 rounded-lg">
              <p className="text-xs text-app-muted uppercase font-bold tracking-wider mb-1">
                Años de servicio
              </p>
              <p className="text-xl font-bold text-app-ink">
                {yearsOfService.toFixed(1)} Años
              </p>
            </div>
            <div className="bg-app-surface p-4 rounded-lg">
              <p className="text-xs text-app-muted uppercase font-bold tracking-wider mb-1">
                Años para indemnización
              </p>
              <p className="text-xl font-bold text-app-ink">
                {yearsOfService >= 1
                  ? typeof yearsForIndemnityCapped === "number"
                    ? yearsForIndemnityCapped.toFixed(2)
                    : yearsForIndemnityCapped
                  : 0}
              </p>
              <p className="text-xs text-app-outline mt-1">
                {yearsOfService >= 1 && yearsForIndemnityCapped < yearsForIndemnity
                  ? `Topado en ${yearsForIndemnityCapped} años (${yearsForIndemnity} de antigüedad)`
                  : "Redondeado hacia arriba si > 6 meses y 1 día"}
              </p>
            </div>
            <div className="bg-app-surface p-4 rounded-lg">
              <p className="text-xs text-app-muted uppercase font-bold tracking-wider mb-1">
                (Sueldo base + Bonificaciones) / 30
              </p>
              <p className="text-xl font-bold text-app-ink">
                $ {dailySalary.toLocaleString("es-CL")}
              </p>
            </div>
          </div>

          <div className="space-y-3 border-t border-app-line pt-6">
            {/* Sección 1: Haberes */}
            <div className="flex justify-between text-sm">
              <span className="text-app-muted">Gratificación Legal</span>
              <span className="font-mono font-medium">
                $ {Math.round(gratificacionLegal).toLocaleString("es-CL")}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-app-muted">
                Promedio de Bonificaciones Mensuales
              </span>
              <span className="font-mono font-medium">
                $ {Math.round(variableBonus).toLocaleString("es-CL")}
              </span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-app-muted">Movilización</span>
              <div className="flex items-center gap-2">
                <span className="text-app-outline">$</span>
                <input
                  type="number"
                  className="w-28 p-1 text-right bg-white border border-app-line rounded focus:ring-2 focus:ring-app-ink outline-none font-mono"
                  value={movilizacion}
                  onChange={(e) =>
                    setMovilizacion(parseFloat(e.target.value) || 0)
                  }
                />
              </div>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-app-ink font-bold">Total Haberes</span>
              <span className="font-mono font-bold">
                $ {Math.round(totalHaberes).toLocaleString("es-CL")}
              </span>
            </div>

            <div className="border-t border-app-line my-2"></div>

            {/* Sección 2: Indemnizaciones */}
            <div className="flex justify-between text-sm">
              <span className="text-app-muted">
                Indemnización por Años de Servicio (
                {typeof yearsForIndemnityCapped === "number"
                  ? yearsForIndemnityCapped.toFixed(2)
                  : yearsForIndemnityCapped}{" "}
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
              <div className="flex justify-between text-sm items-center bg-app-surface p-2 rounded border border-app-line">
                <span className="text-app-brand flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">
                    info
                  </span>
                  Promedio últimas 48 liquidaciones
                </span>
                <span className="font-mono font-bold text-app-brand">
                  $ {averageSalary.toLocaleString("es-CL")}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-app-muted">Vacaciones Pendientes</span>
              <span className="font-mono font-medium">
                $ {Math.round(vacationIndemnity).toLocaleString("es-CL")}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-app-muted">Mes de Aviso</span>
              <span className="font-mono font-medium">
                $ {Math.round(noticeIndemnity).toLocaleString("es-CL")}
              </span>
            </div>

            <div className="flex justify-between text-sm items-center">
              <span className="text-app-muted">Remuneración adeudada</span>
              <div className="flex items-center gap-2">
                <span className="text-app-outline">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-28 p-1 text-right bg-white border border-app-line rounded focus:ring-2 focus:ring-app-ink outline-none font-mono"
                  value={liquidacionMesActual}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, "");
                    setLiquidacionMesActual(val ? parseFloat(val) : "");
                  }}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="border-t border-app-line my-2"></div>

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
              <div className="grid grid-cols-12 gap-2 text-xs text-app-muted font-medium mb-1 px-1">
                <div className="col-span-4">Concepto</div>
                <div className="col-span-3 text-right">Valor</div>
                <div className="col-span-2 text-center">Cuotas</div>
                <div className="col-span-3 text-right">Deuda Total</div>
              </div>
            )}

            {descuentosPersonalizados.map((desc, idx) => {
              const montoVal = parseFloat(desc.monto) || 0;
              const cuotasVal = parseInt(desc.cuotas) || 1;

              const isUF = (desc.moneda || "CLP") === "UF";
              let totalDebt = 0;
              let displayMonto = montoVal;

              if (isUF && ufValue > 0) {
                // ponytail: redondear la cuota primero y luego multiplicar,
                // igual que el cálculo de descuentosCustom
                displayMonto = Math.round(montoVal * ufValue);
                totalDebt = displayMonto * cuotasVal;
              } else {
                displayMonto = Math.round(montoVal);
                totalDebt = displayMonto * cuotasVal;
              }

              return (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 text-sm items-center mb-2 bg-white p-2 rounded border border-app-line "
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
                      <option value="Descuento por planilla">Descuento por planilla</option>
                      <option value="Diferencia Remuneración del Mes en Curso">Diferencia Remuneración del Mes en Curso</option>
                    </select>
                    {desc.detalle && (
                      <span
                        className="text-[10px] text-app-outline pl-1 truncate"
                        title={desc.detalle}
                      >
                        {desc.detalle}
                      </span>
                    )}
                  </div>

                  {/* Monto Input */}
                  <div className="col-span-3">
                    <div className="flex items-center gap-1 justify-end">
                      <select
                        className="text-[9px] font-bold text-app-brand border border-app-line bg-app-surface rounded px-0.5 outline-none cursor-pointer"
                        value={desc.moneda || "CLP"}
                        onChange={(e) => {
                          const newDescuentos = [...descuentosPersonalizados];
                          newDescuentos[idx].moneda = e.target.value;
                          setDescuentosPersonalizados(newDescuentos);
                        }}
                      >
                        <option value="CLP">$</option>
                        <option value="UF">UF</option>
                      </select>
                      <input
                        type="text"
                        className="w-full text-right bg-red-50 border border-red-200 rounded px-1 py-0.5 text-xs font-mono text-red-700 outline-none focus:ring-1 focus:ring-red-500"
                        value={desc.monto}
                        onChange={(e) => {
                          const val = isUF
                            ? e.target.value.replace(/[^0-9.]/g, "")
                            : e.target.value.replace(/[^0-9]/g, "");
                          const newDescuentos = [...descuentosPersonalizados];
                          newDescuentos[idx].monto = val;
                          setDescuentosPersonalizados(newDescuentos);
                        }}
                        placeholder="0"
                      />
                    </div>
                    {isUF && ufValue > 0 && (
                      <div className="text-[9px] text-app-outline text-right mt-0.5">
                        ~ ${displayMonto.toLocaleString("es-CL")}
                      </div>
                    )}
                  </div>

                  {/* Cuotas Input */}
                  <div className="col-span-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      className="w-full text-center bg-white border border-app-line rounded px-1 py-0.5 text-xs text-app-muted outline-none focus:ring-1 focus:ring-app-ink"
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
                      className="text-xs font-mono font-medium text-app-muted"
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
                      className="text-app-outline hover:text-red-500 transition-colors ml-1"
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
                  { descripcion: "", monto: "", cuotas: 1, moneda: "CLP" },
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
            <div className="flex items-center gap-2 bg-app-surface px-3 py-1.5 rounded-lg text-xs text-app-brand border border-app-line ">
              <span className="font-bold">Valor UF Hoy:</span>
              <span className="text-app-outline ml-1">$</span>
              <input
                type="number"
                step="0.01"
                className="w-28 bg-transparent font-mono text-app-brand text-right outline-none border-b border-app-line focus:border-app-ink py-0.5"
                value={ufValue}
                onChange={(e) => setUfValue(Number(e.target.value))}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="mt-2 bg-app-ink text-white p-6 rounded-xl flex justify-between items-center ">
            <div>
              <p className="text-xs text-app-outline uppercase font-bold tracking-wider mb-1">
                Total finiquito
              </p>
              <p className="text-xs text-app-muted">
                Sujeto a revisión final y deducciones
              </p>
            </div>
            <p className="text-3xl font-bold font-mono">
              $ {Math.round(totalSettlement).toLocaleString("es-CL")}
            </p>
          </div>
        </div>

        </div>

        {/* --- Paso 5: Generar --- */}
        <div hidden={tabActiva !== 4}>

        {/* Recap: mismo totalSettlement que el paso 4, sin recalcular nada */}
        <div className="bg-app-ink text-white p-6 rounded-xl flex justify-between items-center  mb-6">
          <div>
            <p className="text-xs text-app-outline uppercase font-bold tracking-wider mb-1">
              Total finiquito
            </p>
            <p className="text-xs text-app-muted">
              {employee?.nombre_trabajador} · {lastDayWork || "sin fecha de término"}
            </p>
          </div>
          <p className="text-3xl font-bold font-mono">
            $ {Math.round(totalSettlement).toLocaleString("es-CL")}
          </p>
        </div>

        {/* Faltantes: los mismos que valida handleGenerate, avisados antes de intentar */}
        {(!lastDayWork || !terminationReason) && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 p-4 rounded-xl mb-6 flex items-center gap-3">
            <span className="material-symbols-outlined">warning</span>
            <span className="text-sm">
              Falta completar {!lastDayWork && "la fecha de término"}
              {!lastDayWork && !terminationReason && " y "}
              {!terminationReason && "la causal"} en el paso 1.
            </span>
          </div>
        )}

        {/* Estado del proceso guardado */}
        {proceso && (
          <div className="bg-white p-6 rounded-xl  border border-app-line mb-6">
            <h3 className="text-lg font-bold text-app-ink mb-4">Estado del proceso</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              {[
                ["Carta generada", proceso.carta_generada_at],
                ["Finiquito generado", proceso.finiquito_generado_at],
                ["Aviso a RRHH", proceso.correo_enviado_at],
              ].map(([label, fecha]) => (
                <div key={label} className="flex items-center gap-2">
                  <span
                    className={`material-symbols-outlined ${fecha ? "text-app-brand" : "text-app-outline"}`}
                  >
                    {fecha ? "check_circle" : "radio_button_unchecked"}
                  </span>
                  <div>
                    <p className="font-medium text-app-muted">{label}</p>
                    <p className="text-xs text-app-muted">
                      {fecha ? new Date(fecha).toLocaleString("es-CL") : "Pendiente"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 pb-6">
          <button
            onClick={() => navigate("/finiquitos")}
            className="px-6 py-3 bg-white border border-app-line text-app-muted rounded-lg font-medium hover:bg-app-surface transition-colors"
          >
            CANCELAR
          </button>
          <button
            onClick={handleDownloadWord}
            className="px-6 py-3 bg-app-ink text-white rounded-lg font-bold hover:bg-app-ink/90 transition-colors  flex items-center gap-2"
          >
            <span className="material-symbols-outlined">description</span>
            DESCARGAR FINIQUITO
          </button>
          <button
            onClick={handleGenerate}
            className="px-6 py-3 bg-app-ink text-white rounded-lg font-bold hover:bg-app-ink/90 transition-colors  flex items-center gap-2"
          >
            <span className="material-symbols-outlined">description</span>
            GENERAR CARTA
          </button>
        </div>

        </div>

        {/* Navegación entre pasos. `sticky bottom-0` la deja siempre en el mismo lugar,
            visible sin importar cuánto mida el paso actual. */}
        <div className="sticky bottom-0 -mx-8 px-8 py-4 bg-white/95 backdrop-blur border-t border-app-line flex items-center justify-between">
          <button
            onClick={() => irATab(tabActiva - 1)}
            disabled={tabActiva === 0}
            className="px-5 py-2.5 bg-white border border-app-line text-app-muted rounded-lg font-medium hover:bg-app-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">chevron_left</span>
            Anterior
          </button>

          <span className="text-sm text-app-muted">
            Paso {tabActiva + 1} de {TABS.length} · {TABS[tabActiva].nombre}
          </span>

          <button
            onClick={() => irATab(tabActiva + 1)}
            disabled={tabActiva === TABS.length - 1}
            className="px-5 py-2.5 bg-app-ink text-white rounded-lg font-medium hover:bg-app-ink/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            Siguiente
            <span className="material-symbols-outlined text-lg">chevron_right</span>
          </button>
        </div>
      </main>
    </SidebarLayout>
  );
};

export default CrearFiniquito;
