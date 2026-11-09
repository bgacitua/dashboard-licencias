from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class Estudio(BaseModel):
    id: int
    vista: str
    pais: str
    anio: int
    moneda: str
    factor_mensual: float


class MatchIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    estudio_id: int
    cargo_nombre: str = Field(min_length=1, max_length=200)
    descriptor: str | None = Field(None, max_length=4000)


class Candidato(BaseModel):
    cargo_codigo: str
    titulo: str
    familia: str
    subfamilia: str
    titulo_tipico: str | None
    descripcion: str | None
    similitud: float
    score: float
    justificacion: str | None


class MatchOut(BaseModel):
    fuente: str  # "gpt" | "coseno"
    candidatos: list[Candidato]


class Nivel(BaseModel):
    codigo: str
    nombre: str


class ResultadoIn(BaseModel):
    estudio_id: int
    cargos: list[str] = Field(min_length=1)
    nivel: str


class AnalisisIn(ResultadoIn, MatchIn):
    candidatos: list[Candidato]
    cargo_empresa_id: int | None = None  # homologación de un cargo de la empresa (solo admin)


class Analisis(AnalisisIn):
    id: int
    nivel_nombre: str
    creado_por: str
    created_at: datetime


class CargoEmpresaOut(BaseModel):
    id: int
    code: str
    name: str
    description: str | None
    requirements: str | None
    descriptor: str | None  # description + títulos CBO (BR), lo que va al match
    # Homologación vigente; todo None si el cargo aún no está homologado.
    analisis_id: int | None
    cargos: list[str] | None
    titulos: list[str] | None
    nivel: str | None
    nivel_nombre: str | None
    creado_por: str | None
    created_at: datetime | None
    # Evaluación HAY vigente; None si el cargo no está evaluado.
    hay_grado: int | None
    hay_puntos: int | None
    personas: int  # personas activas con este cargo (v_dotacion)


class PersonaOut(BaseModel):
    """Persona activa; mercado en sueldo mensual (COMP1 ÷ factor). None si falta el dato."""
    employee_id: int
    documento: str
    nombre: str
    cargo_buk: str | None
    empresa: str | None
    centro_costo: str | None
    jefe: str | None  # documento del jefe
    fecha_ingreso: date | None
    url_picture: str | None
    base_wage: float | None
    cargo_empresa_id: int | None
    cargo: str | None
    cargos: list[str] | None
    nivel: str | None
    nivel_nombre: str | None
    hay_grado: int | None
    hay_puntos: int | None
    p25: float | None
    mediana: float | None
    promedio: float | None
    p75: float | None
    # Banda interna del grado HAY (mensual, v_banda)
    banda_min: float | None
    banda_mid: float | None
    banda_max: float | None
    # Último cambio de sueldo (solo CL)
    sueldo_base_anterior: float | None
    variacion_sueldo_pct: float | None  # en %, p. ej. 5.0
    fecha_cambio_sueldo: date | None


class CambioOut(BaseModel):
    fecha_cambio: date
    tipo_cambio: str  # sueldo_base, cargo, centro_costo, area, jefatura
    valor_anterior: str | None
    valor_nuevo: str | None
    variacion_pct: float | None


class FilaMercado(BaseModel):
    tipo: str  # "cargo" | "hibrido" | "subfamilia" | "promedio_subfamilias"
    cargo_codigo: str | None
    titulo: str
    medida_codigo: str  # "COMP1" | "COMP3_REAL"
    n_companias: int | None
    n_observaciones: int | None
    p25: float | None
    mediana: float | None
    promedio: float | None
    p75: float | None


class ResultadoOut(BaseModel):
    moneda: str
    factor_mensual: float
    filas: list[FilaMercado]


class HayEntradas(BaseModel):
    """Factores HAY. Signo: '-', '' o '+'. Un valor fuera de las tablas da 400 al calcular."""
    tecnica: str
    signo_tecnica: str = ""
    gestion: str
    signo_gestion: str = ""
    rrhh: int
    marco: str
    complejidad: int
    signo_complejidad: str = ""
    libertad: str
    signo_libertad: str = ""
    magnitud: str
    impacto: str


class HayResultado(BaseModel):
    puntos_kh: int
    porcentaje_sp: int
    puntos_sp: int
    puntos_resp: int
    puntos_total: int
    grado: int


class HayEvaluacionIn(HayEntradas):
    cargo_empresa_id: int
    comentario: str | None = Field(None, max_length=1000)


class HayEvaluacion(HayEvaluacionIn, HayResultado):
    id: int
    origen: str  # "excel" | "ui"
    creado_por: str
    created_at: datetime
