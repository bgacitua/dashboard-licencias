"""Configuración del módulo de asistencia.

Settings propio, no un bloque dentro de app.core.config: el módulo lee las
mismas variables de entorno que el resto de la app pero no obliga a la
plataforma a conocer sus nombres. Sacar el módulo = borrar esta carpeta.

Todas las variables llevan prefijo ASISTENCIA_ (p. ej. ASISTENCIA_CTRL_TOKEN).
"""
from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class AsistenciaSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ASISTENCIA_", extra="ignore")

    # Apagado por defecto: en main la rama no monta nada hasta que esto sea true.
    enabled: bool = False

    # Interruptor de seguridad: con dry_run, registrar-marcas loguea el payload
    # en vez de escribir en el Buk real. Debe quedar en true en local.
    dry_run: bool = True

    # === Buk Ctrl — marcajes (endpoint principal) ===
    # Vacío = el módulo responde 503 en vez de fallar al arrancar: una
    # credencial faltante no puede tumbar el resto de la plataforma.
    external_api_url: str = "https://app.ctrlit.buk.cl/ctrl/api/v2/asistencia-empresa/"
    external_api_key: SecretStr = SecretStr("")
    external_api_key_header: str = "auth_token"
    external_timeout: float = 20.0

    # === Buk Ctrl — endpoints adicionales (mismo token/header) ===
    auditoria_api_url: str = "https://app.ctrlit.cl/ctrl/api/obtenerRegistroAsistencia"
    inasistencias_api_url: str = "https://app.ctrlit.cl/ctrl/api/obtenerInasistencias"
    # Fuente de turno (horarioTurno) y nombre para el cruce de Inasistencias,
    # incluso para trabajadores sin fila en Marcajes.
    asignacion_turnos_api_url: str = "https://app.ctrlit.cl/ctrl/api/getAsignacionTurnos"

    # === API core de Buk — fuente de "Recinto por trabajador" ===
    # El recinto vigente vive en custom_attributes.current_job.recinto_asistencia
    # y se actualiza antes que getAsignacionTurnos. Vacío = fallback a
    # getAsignacionTurnos.
    buk_api_url: str = ""  # https://<empresa>.buk.cl/api/v1/chile/employees/active
    buk_api_key: SecretStr = SecretStr("")
    buk_api_key_header: str = "auth_token"
    # Mapa code del custom attribute -> obra_id del selector (códigos distintos).
    # Formato: "CRAMER:36787,APP:42123,..."
    recinto_codes: str = ""

    # === Agregación ===
    # El externo solo pagina + filtra por rango de fechas. Para ofrecer
    # orden/búsqueda/filtros sobre TODO el dataset, se recorren todas las
    # páginas una vez y se cachean en memoria.
    crawl_page_size: int = 100
    crawl_concurrency: int = 5
    crawl_max_pages: int = 500
    cache_ttl: float = 900.0  # 15 min: un rango fijo no cambia dentro de una corrida

    # Obras del selector. Formato: "id:Nombre,id:Nombre,..."
    obras: str = ""

    @property
    def recinto_codes_map(self) -> dict[str, str]:
        """code (custom attribute) -> obra_id. Comparación case-insensitive."""
        out: dict[str, str] = {}
        for item in self.recinto_codes.split(","):
            code, _, obra = item.strip().partition(":")
            if code.strip() and obra.strip():
                out[code.strip().lower()] = obra.strip()
        return out

    @property
    def obras_list(self) -> list[dict]:
        result = []
        for item in self.obras.split(","):
            item = item.strip()
            if ":" in item:
                obra_id, _, nombre = item.partition(":")
                result.append({"id": obra_id.strip(), "nombre": nombre.strip()})
            elif item:
                result.append({"id": item, "nombre": item})
        return result


@lru_cache
def get_settings() -> AsistenciaSettings:
    return AsistenciaSettings()


settings = get_settings()
