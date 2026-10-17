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
    analisis_id: int
    fuente: str  # "gpt" | "coseno"
    candidatos: list[Candidato]


class Nivel(BaseModel):
    codigo: str
    nombre: str


class ResultadoIn(BaseModel):
    cargos: list[str] = Field(min_length=1)
    nivel: str


class FilaMercado(BaseModel):
    tipo: str  # "cargo" | "hibrido" | "subfamilia"
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
