// Topes de la indemnización por años de servicio, extraídos de CrearFiniquito.jsx
// para poder testearlos con node (ver topeIndemnizacion.test.js).
//
// Dos topes distintos conviven:
//   - tope de AÑOS: cuántos años se pagan como máximo.
//   - tope de BASE: la base de cálculo se acota a 90 UF (Art. 172 inc. final).
// Qué tope aplica depende de la causal y, en mutuo acuerdo, del tramo de antigüedad.

export const UF_TOPE_BASE = 90;

// Tope de años por causal de término.
// null / ausente = sin tope por esta vía (mutuo acuerdo se rige por tramos).
export const TOPE_ANOS_INDEMNIZACION = {
  necesidades_empresa: 11, // Art. 161 - Necesidades de la empresa
  mutuo_acuerdo_especial: 11, // Mismo cálculo que necesidades_empresa; solo cambia la redacción
  mutuo_acuerdo: null, // Art. 159 N°1 - se rige por tramos, ver TOPE_MUTUO_ACUERDO
};

// Mutuo acuerdo (Art. 159 N°1): tope de años por tramo de antigüedad.
// Fuera de estos tramos (años < 4, años >= 25) o edad >= 65: sin tope de años ni de base.
export const TOPE_MUTUO_ACUERDO = [
  { minAnos: 4, maxAnos: 20, topeAnos: 11 },
  { minAnos: 20, maxAnos: 25, topeAnos: 16 },
];

export const CAUSALES_CON_INDEMNIZACION = [
  "necesidades_empresa",
  "mutuo_acuerdo",
  "mutuo_acuerdo_especial",
];

// Edad cumplida a la fecha de término (no a la fecha de hoy): un finiquito
// retroactivo no puede usar la edad actual para decidir el tope.
export function edadEnFecha(fechaNacimiento, fechaReferencia) {
  if (!fechaNacimiento) return null;
  const nac = new Date(fechaNacimiento);
  if (Number.isNaN(nac.getTime())) return null;
  const ref = fechaReferencia ? new Date(fechaReferencia) : new Date();
  if (Number.isNaN(ref.getTime())) return null;
  let edad = ref.getUTCFullYear() - nac.getUTCFullYear();
  const mes = ref.getUTCMonth() - nac.getUTCMonth();
  if (mes < 0 || (mes === 0 && ref.getUTCDate() < nac.getUTCDate())) edad -= 1;
  return edad;
}

// Acota la base a 90 UF. Si no hay valor de UF el tope NO se aplica, y eso se
// avisa: el monto queda sobrestimado y el usuario tiene que saberlo.
function acotarBase(base, ufValue, avisos) {
  const topeUF = (ufValue || 0) * UF_TOPE_BASE;
  if (topeUF <= 0) {
    avisos.push({
      nivel: "error",
      texto:
        "No se pudo obtener el valor de la UF: el tope de 90 UF sobre la base NO se aplicó. El monto puede estar sobrestimado.",
    });
    return { base, topeUF: 0, topeada: false };
  }
  if (base > topeUF) return { base: topeUF, topeUF, topeada: true };
  return { base, topeUF, topeada: false };
}

/**
 * Indemnización por años de servicio, con los topes de años y de base que
 * correspondan a la causal.
 *
 * Devuelve siempre `regla` (qué tramo se usó) y `avisos`, para que la pantalla
 * pueda mostrarlo en vez de fallar en silencio.
 */
export function calcularIndemnizacionAnosServicio({
  terminationReason,
  yearsOfService = 0,
  yearsForIndemnity = 0,
  totalHaberes = 0,
  averageSalary = 0,
  salary = 0,
  ufValue = 0,
  edad = null,
}) {
  const avisos = [];
  const vacio = {
    aplica: false,
    monto: 0,
    anosPagados: 0,
    base: 0,
    topeUF: 0,
    topeAnosAplicado: false,
    topeBaseAplicado: false,
    regla: null,
    avisos,
    auditoria: null,
  };

  if (!CAUSALES_CON_INDEMNIZACION.includes(terminationReason)) return vacio;
  if (yearsOfService < 1) {
    return {
      ...vacio,
      regla: {
        id: "sin_antiguedad",
        titulo: "Menos de 1 año de antigüedad",
        detalle: "No genera indemnización por años de servicio.",
      },
    };
  }

  const years = yearsForIndemnity;

  // --- Mutuo acuerdo con fecha de nacimiento: tramos del Art. 159 N°1 ---
  if (terminationReason === "mutuo_acuerdo" && edad != null) {
    const baseAmount = averageSalary > 0 ? averageSalary : salary || 0;
    if (averageSalary <= 0) {
      avisos.push({
        nivel: "error",
        texto:
          "Sin promedio de las últimas 48 remuneraciones: la base usa el sueldo actual. Carga el historial para calcular el monto correcto.",
      });
    }

    let ruleApplied = "";
    let regla = null;
    let base = baseAmount;
    let topeUF = 0;
    let anosPagados = years;
    let topeBaseAplicado = false;
    let topeAnosAplicado = false;

    const aplicarTramo = (tramo, etiqueta) => {
      ruleApplied = `${etiqueta}: topes por 90 UF y años acotados`;
      const acotada = acotarBase(baseAmount, ufValue, avisos);
      base = acotada.base;
      topeUF = acotada.topeUF;
      topeBaseAplicado = acotada.topeada;
      anosPagados = Math.min(years, tramo.topeAnos);
      topeAnosAplicado = anosPagados < years;
      regla = {
        id: `mutuo_${tramo.minAnos}_${tramo.maxAnos}`,
        titulo: `Mutuo acuerdo · tramo ${tramo.minAnos}–${tramo.maxAnos} años`,
        detalle: `Tope de ${tramo.topeAnos} años y base acotada a 90 UF.`,
      };
    };

    if (edad >= 65) {
      ruleApplied = "Rule 4 (edad >= 65): sin topes";
      regla = {
        id: "mutuo_edad_65",
        titulo: "Mutuo acuerdo · 65 años o más",
        detalle: "Sin tope de años ni de base.",
      };
    } else if (years >= 4 && years < 20) {
      aplicarTramo(TOPE_MUTUO_ACUERDO[0], "Rule 1 (4 <= años < 20)");
    } else if (years >= 20 && years < 25) {
      aplicarTramo(TOPE_MUTUO_ACUERDO[1], "Rule 2 (20 <= años < 25)");
    } else if (years >= 25) {
      ruleApplied = "Rule 3 (años >= 25): sin topes";
      regla = {
        id: "mutuo_25_mas",
        titulo: "Mutuo acuerdo · 25 años o más",
        detalle: "Sin tope de años ni de base.",
      };
    } else {
      // años < 4: fuera de los tramos, se paga como el cálculo estándar.
      ruleApplied = "Fallback (años < 4): años * totalHaberes";
      base = totalHaberes;
      regla = {
        id: "mutuo_menos_4",
        titulo: "Mutuo acuerdo · menos de 4 años",
        detalle: "Fuera de los tramos: sin tope, base sobre el total de haberes.",
      };
    }

    const monto = Math.round(base * anosPagados);
    return {
      aplica: true,
      monto,
      anosPagados,
      base,
      topeUF,
      topeAnosAplicado,
      topeBaseAplicado,
      regla,
      avisos,
      // Shape histórico que lee la auditoría del Excel (VisualizadorFiniquito).
      auditoria: {
        applied: true,
        ruleApplied,
        age: edad,
        years,
        baseAmount,
        cap90UF: topeUF,
        cappedBase: topeBaseAplicado ? base : null,
        cappedYears: topeAnosAplicado ? anosPagados : null,
        result: monto,
      },
    };
  }

  if (terminationReason === "mutuo_acuerdo") {
    avisos.push({
      nivel: "error",
      texto:
        "Sin fecha de nacimiento del trabajador: no se pudieron aplicar los tramos de mutuo acuerdo (Art. 159 N°1). Se calculó sin tope de años ni de base.",
    });
    const monto = Math.round(totalHaberes * years);
    return {
      aplica: true,
      monto,
      anosPagados: years,
      base: totalHaberes,
      topeUF: 0,
      topeAnosAplicado: false,
      topeBaseAplicado: false,
      regla: {
        id: "mutuo_sin_fecha_nacimiento",
        titulo: "Mutuo acuerdo · sin tramo determinado",
        detalle: "Falta la fecha de nacimiento para decidir el tope aplicable.",
      },
      avisos,
      auditoria: null,
    };
  }

  // --- Necesidades de la empresa (y mutuo acuerdo especial, mismo cálculo) ---
  // Art. 161 + Art. 163: tope de 11 años; base acotada a 90 UF (Art. 172).
  const topeAnos = TOPE_ANOS_INDEMNIZACION[terminationReason];
  const acotada = acotarBase(totalHaberes, ufValue, avisos);
  const anosPagados = topeAnos != null ? Math.min(years, topeAnos) : years;
  const topeAnosAplicado = anosPagados < years;

  return {
    aplica: true,
    monto: Math.round(acotada.base * anosPagados),
    anosPagados,
    base: acotada.base,
    topeUF: acotada.topeUF,
    topeAnosAplicado,
    topeBaseAplicado: acotada.topeada,
    regla: {
      id: terminationReason,
      titulo:
        terminationReason === "necesidades_empresa"
          ? "Necesidades de la empresa (Art. 161)"
          : "Mutuo acuerdo especial (mismo cálculo que Art. 161)",
      detalle:
        topeAnos != null
          ? `Tope de ${topeAnos} años y base acotada a 90 UF.`
          : "Base acotada a 90 UF.",
    },
    avisos,
    auditoria: null,
  };
}
