"""Configuración del módulo de tickets.

Mismo patrón que formularios: variables con prefijo TICKETS_ y la plataforma
no necesita conocer sus nombres. Sacar el módulo = borrar esta carpeta.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class TicketsSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TICKETS_", extra="ignore")

    # Apagado por defecto: en main no se monta nada hasta que esto sea true.
    enabled: bool = False

    # Dominios aceptados en el registro. El registro es público (internet), así
    # que esto más la nómina y la activación del admin son lo que lo cierra.
    dominios: str = "cramer.cl"

    # Horas de vida de la sesión del usuario del portal. Larga a propósito: la
    # idea es que pedir un almuerzo no parta por volver a escribir la clave.
    sesion_horas: int = 12

    # Horas que dura la ventana para volver a registrarse tras un reseteo de
    # clave desde el panel. Mientras está abierta, quien sepa el correo puede
    # ponerle clave a la cuenta: por eso es corta.
    reset_horas: int = 24

    # Tope de cada imagen que sube el admin.
    archivo_max_mb: int = 3

    zona: str = "America/Santiago"

    # Webhook de n8n que manda los correos de las cuentas (aviso de registro al
    # admin, aprobación y rechazo al usuario). La pone quien despliega, no un
    # admin desde el panel, así que no necesita allowlist. Vacío = sin correos.
    n8n_webhook_url: str = ""
    # Bearer del nodo Webhook (Header Auth). Sin él el webhook queda abierto.
    n8n_token: str = ""
    # A quién avisar cuando alguien se registra, separados por coma.
    admin_emails: str = ""

    @property
    def admin_emails_list(self) -> list[str]:
        return [e.strip() for e in self.admin_emails.split(",") if e.strip()]

    @property
    def dominios_list(self) -> list[str]:
        return [d.strip().lower() for d in self.dominios.split(",") if d.strip()]

    def dominio_permitido(self, email: str) -> bool:
        local, arroba, dominio = email.strip().lower().rpartition("@")
        return bool(local and arroba) and dominio in self.dominios_list


@lru_cache
def get_settings() -> TicketsSettings:
    return TicketsSettings()


settings = get_settings()
