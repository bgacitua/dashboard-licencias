// Lógica pura del promedio de remuneración variable del finiquito.
// Extraída de CrearFiniquito.jsx para poder testearla con node (ver variableBonus.test.js).

export function parsePeriodo(periodoStr) {
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

export function getMonthsInRange(minYear, minMonth, maxYear, maxMonth) {
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

const MEDICAL_KEYWORDS = ["enfermedad", "licencia", "accidente", "patología", "patologia", "medicina"];

export function isMedicalLicense(lic) {
  const tipo = (lic.tipo_permiso || "").toLowerCase();
  return MEDICAL_KEYWORDS.some((kw) => tipo.includes(kw));
}

export function monthHasLicense(year, month, licencias) {
  if (!licencias || !licencias.length) return false;
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  return licencias.some((lic) => {
    if (!isMedicalLicense(lic)) return false;
    const start = new Date(lic.fecha_inicio);
    const end = new Date(lic.fecha_fin);
    return end >= firstDay && start <= lastDay;
  });
}

export function formatPeriodoDisplay(year, month) {
  return new Date(year, month - 1, 1)
    .toLocaleDateString("es-CL", { month: "2-digit", year: "numeric" })
    .replace("/", "-");
}

// "YYYY-MM-DD" del <input type="date">. Se parsea a mano para no caer en el UTC de
// new Date("2025-07-01"), que en Chile retrocede al mes anterior.
export function parseFechaTermino(fecha) {
  if (!fecha || typeof fecha !== "string") return null;
  const m = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? { year: parseInt(m[1], 10), month: parseInt(m[2], 10) } : null;
}

export function getExpandedVariableGroups(
  variableItems,
  variableCustomAdditions,
  licencias,
  variableFilledActive,
  fechaTermino
) {
  const groups = {};
  // Tope común: el mes más reciente con datos de CUALQUIER concepto, o el mes de término
  // si es posterior. Sin esto, un concepto que dejó de pagarse los últimos meses no genera
  // filas en 0 y el promedio se infla; y si TODOS los conceptos pararon antes del término,
  // los meses finales tampoco aparecían.
  // ponytail: solo se extiende el máximo, no el mínimo (un bono que empezó después no debe
  // aparecer en 0 hacia atrás).
  let globalMaxY = -Infinity,
    globalMaxM = 1;
  const bumpGlobalMax = (p) => {
    if (p && (p.year > globalMaxY || (p.year === globalMaxY && p.month > globalMaxM))) {
      globalMaxY = p.year;
      globalMaxM = p.month;
    }
  };
  variableItems.forEach((item) => bumpGlobalMax(parsePeriodo(item.periodo)));
  bumpGlobalMax(parseFechaTermino(fechaTermino));
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
    if (globalMaxY > maxY || (globalMaxY === maxY && globalMaxM > maxM)) {
      maxY = globalMaxY;
      maxM = globalMaxM;
    }
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

export const VALID_VARIABLE_MONTHS_REQUIRED = 3;

export function getItemPeriodForSort(item) {
  if (item.year != null && item.month != null)
    return { year: item.year, month: item.month };
  return parsePeriodo(item.periodo);
}

export function calculateTotalFromExpandedGroups(groups) {
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
