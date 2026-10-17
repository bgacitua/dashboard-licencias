"""Configuración del módulo de compensaciones.

Settings propio, mismo patrón que asistencia y formularios: lee sus variables
con prefijo COMPENSACIONES_ y la plataforma no necesita conocer sus nombres.
Sacar el módulo = borrar esta carpeta.
"""
from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class CompensacionesSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_prefix="COMPENSACIONES_", extra="ignore"
    )

    # Apagado por defecto: en main no se monta nada hasta que esto sea true.
    enabled: bool = False

    # Vacío = el match responde 502 en vez de fallar al arrancar.
    openai_api_key: SecretStr = SecretStr("")
    # Debe ser el mismo modelo con que se generaron los vectores (puesto_vec.modelo).
    modelo_embedding: str = "text-embedding-3-small"
    modelo_gpt: str = "gpt-4o-mini"

    umbral: float = 0.5      # similitud mínima de coseno
    candidatos: int = 25     # cargos que se puntúan con GPT
    mostrar: int = 5         # cargos que ve el usuario
    timeout: float = 30      # segundos por llamada a OpenAI


@lru_cache
def get_settings() -> CompensacionesSettings:
    return CompensacionesSettings()


settings = get_settings()
