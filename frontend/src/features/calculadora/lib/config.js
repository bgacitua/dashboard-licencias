// features/calculadora/lib/config.js — fallback offline si el backend no responde

export const PAISES = ["chile", "peru", "brasil"]

// AFP tasas por fondo (Chile)
export const AFP_DATA = {
  Capital: 0.1149,
  Cuprum: 0.1149,
  Habitat: 0.1127,
  Modelo: 0.1058,
  Planvital: 0.1116,
  Provida: 0.1145,
  Uno: 0.1049,
}

// AFP comisiones Peru (solo la comisión variable; el 10% obligatorio es aparte)
export const AFP_DATA_PERU = {
  Integra: 0.0155,
  Prima: 0.016,
  Profuturo: 0.0169,
  Habitat: 0.0147,
}

// Tasas y parámetros Chile
export const TASAS_CHILE = {
  UF_VALUE: 38000,
  DOLAR_VALUE: 950,
  TASA_SALUD_FONASA: 0.07,
  TASA_CESANTIA: 0.006,
  TOPE_AFP_SALUD_UF: 89.9,
  TOPE_CESANTIA_UF: 135.1,
  GRATIFICACION_MAX_IMM: 4.75,
  SUELDO_MINIMO: 539000,
  CESANTIA_EMPLEADOR: 0.024,
  MUTUAL: 0.0093,
  SIS: 0.0154,
  EXPECTATIVA_VIDA: 0.009,
  AFP_EMPLEADOR: 0.001,
  SEGURO_COMPLEMENTARIO_UF: 0.4822,
}

// Tasas y parámetros Perú — valores reales (fallback si backend no responde).
// La fuente de verdad es calculadora.country_config (actualizada por n8n).
export const TASAS_PERU = {
  UF_VALUE: 1,
  DOLAR_VALUE: 3.4198,
  UIT: 5500,
  SUELDO_MINIMO: 1130,
  RMV: 1130,
  ASIGNACION_FAMILIAR_PCT: 0.10,
  TASA_AFP_OBLIGATORIA: 0.10,
  TASA_SEGUROS_INVALIDEZ: 0.0137,
  TASA_SALUD_PATRONAL: 0.09,
  REFRIGERIO: 300,
  SUELDOS_ANUALES: 14,
  DEDUCCION_FIJA_UIT: 7,
  DEDUCCION_ADICIONAL_UIT: 3,
  TRAMOS_IMPUESTO: [
    { desde_uf: 0,  hasta_uf: 5,    tasa: 0.08 },
    { desde_uf: 5,  hasta_uf: 20,   tasa: 0.14 },
    { desde_uf: 20, hasta_uf: 35,   tasa: 0.17 },
    { desde_uf: 35, hasta_uf: 45,   tasa: 0.20 },
    { desde_uf: 45, hasta_uf: null, tasa: 0.30 },
  ],
  // Campos Chile no aplicables en Peru (mantenidos en 0 para compatibilidad)
  TASA_SALUD_FONASA: 0,
  TASA_CESANTIA: 0,
  TOPE_AFP_SALUD_UF: 0,
  TOPE_CESANTIA_UF: 0,
  GRATIFICACION_MAX_IMM: 0,
  CESANTIA_EMPLEADOR: 0,
  MUTUAL: 0,
  SIS: 0,
  EXPECTATIVA_VIDA: 0,
  AFP_EMPLEADOR: 0,
  SEGURO_COMPLEMENTARIO_UF: 0,
}

// Tasas y parámetros Brasil (placeholder hasta que n8n complete los valores)
export const TASAS_BRASIL = {
  UF_VALUE: 1, DOLAR_VALUE: 1,
  TASA_SALUD_FONASA: 0, TASA_CESANTIA: 0,
  TOPE_AFP_SALUD_UF: 0, TOPE_CESANTIA_UF: 0,
  GRATIFICACION_MAX_IMM: 0, SUELDO_MINIMO: 0,
  CESANTIA_EMPLEADOR: 0, MUTUAL: 0, SIS: 0, EXPECTATIVA_VIDA: 0,
  AFP_EMPLEADOR: 0, SEGURO_COMPLEMENTARIO_UF: 0,
}

export const CONFIG_POR_PAIS = {
  chile: TASAS_CHILE,
  peru: TASAS_PERU,
  brasil: TASAS_BRASIL,
}

export const AFP_DATA_POR_PAIS = {
  chile: AFP_DATA,
  peru: AFP_DATA_PERU,
  brasil: {},
}

// Tramos de impuesto de segunda categoría (fallback offline)
export const TAX_BRACKETS_CHILE = [
  { desde: 0,            hasta: 938817,     tasa: 0.00,  rebaja: 0          },
  { desde: 938817.01,    hasta: 2086260,    tasa: 0.04,  rebaja: 37552.68   },
  { desde: 2086260.01,   hasta: 3477100,    tasa: 0.08,  rebaja: 121003.08  },
  { desde: 3477100.01,   hasta: 4867940,    tasa: 0.135, rebaja: 312243.58  },
  { desde: 4867940.01,   hasta: 6258780,    tasa: 0.23,  rebaja: 774697.88  },
  { desde: 6258780.01,   hasta: 8345040,    tasa: 0.304, rebaja: 1237847.60 },
  { desde: 8345040.01,   hasta: 21558020,   tasa: 0.35,  rebaja: 1621719.44 },
  { desde: 21558020.01,  hasta: 999999999,  tasa: 0.40,  rebaja: 2699620.44 },
]

export const BONOS_ANUALES_UF_DEFAULT = {
  navidad: 7,
  fiestaPatrias: 6,
  escolaridad: 3,
}

export const BONOS_EMPRESA_DEFAULT = [
  { id: 'empresa',         nombre: 'Empresa',                       montoFijo: 600000 },
  { id: 'partnership',     nombre: 'Partnership / Jefe de Unidad',  tasa: [0.4, 0.6, 1.0, 1.2] },
  { id: 'vendedor',        nombre: 'Vendedor',                      tasa: [0.8, 1.1, 1.4, 1.7, 2.0] },
  { id: 'jefe_area',       nombre: 'Jefe de Área',                  tasa: [0.4, 0.7, 1.2, 1.4] },
  { id: 'subgerente',      nombre: 'Subgerente',                    tasa: [0.5, 1.0, 1.4, 1.8] },
  { id: 'gerente',         nombre: 'Gerente',                       tasa: [0.5, 1.0, 1.5, 2.0] },
  { id: 'gerente_general', nombre: 'Gerente General',               tasa: [0.5, 1.0, 2.0, 3.0] },
]

export const BONOS_EMPRESA_PERU_DEFAULT = [
  { id: 'empresa', nombre: 'Empresa', montoFijo: 1000 },
]
