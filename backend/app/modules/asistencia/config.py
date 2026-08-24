"""Configuración del módulo de asistencia.

Settings propio, no un bloque dentro de app.core.config: el módulo lee las
mismas variables de entorno que el resto de la app pero no obliga a la
plataforma a conocer sus nombres. Sacar el módulo = borrar esta carpeta.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import SecretStr


class AsistenciaSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ASISTENCIA_", extra="ignore")

    # Apagado por defecto: en main la rama no monta nada hasta que esto sea true.
    ENABLED: bool = False

    # Buk Ctrl (marcajes, inasistencias, turnos). Vacío = módulo degradado a 503.
    CTRL_BASE_URL: str = "https://app.ctrlit.cl"
    CTRL_EMPRESA_BASE_URL: str = "https://app.ctrlit.buk.cl"
    CTRL_TOKEN: SecretStr = SecretStr("")

    # Interruptor de seguridad: con DRY_RUN, registrar-marcas loguea el payload
    # en vez de escribir en el Buk real. Debe quedar en true en local.
    DRY_RUN: bool = True


settings = AsistenciaSettings()
