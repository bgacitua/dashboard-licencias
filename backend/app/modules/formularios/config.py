"""Configuración del módulo de formularios.

Settings propio, mismo patrón que el módulo de asistencia: el módulo lee sus
variables de entorno con prefijo FORMULARIOS_ y la plataforma no necesita
conocer sus nombres. Sacar el módulo = borrar esta carpeta.
"""
from functools import lru_cache
from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict


class FormulariosSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_prefix="FORMULARIOS_", extra="ignore"
    )

    # Apagado por defecto: en main no se monta nada hasta que esto sea true.
    enabled: bool = False

    # Horas de vida del enlace que se manda por correo. Se mide en horas porque
    # la persona lo abre cuando revisa su bandeja, que puede ser al día
    # siguiente, y hasta que vence puede volver a corregir lo que respondió.
    envio_ttl_horas: int = 72

    # Hosts permitidos para n8n_webhook_url. La URL la escribe un admin y el
    # backend la llama: sin allowlist es un SSRF desde el panel.
    n8n_hosts: str = ""

    @property
    def n8n_hosts_list(self) -> list[str]:
        return [h.strip().lower() for h in self.n8n_hosts.split(",") if h.strip()]

    def webhook_permitido(self, url: str) -> bool:
        """https + host en la allowlist. Sin allowlist configurada, nada pasa."""
        try:
            parsed = urlparse(url)
        except ValueError:
            return False
        return (
            parsed.scheme == "https"
            and bool(parsed.hostname)
            and parsed.hostname.lower() in self.n8n_hosts_list
        )


@lru_cache
def get_settings() -> FormulariosSettings:
    return FormulariosSettings()


settings = get_settings()
