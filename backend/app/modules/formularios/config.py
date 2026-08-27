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

    # Minutos de vida del token que emite el gate.
    token_ttl_min: int = 15

    # Hosts permitidos para n8n_webhook_url. La URL la escribe un admin y el
    # backend la llama: sin allowlist es un SSRF desde el panel.
    n8n_hosts: str = ""

    # Gate: intentos por IP en la ventana. Es el único punto desde donde se
    # puede enumerar RUTs de la nómina.
    gate_max_intentos: int = 10
    gate_ventana_seg: int = 300

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
