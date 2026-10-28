from datetime import datetime

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
