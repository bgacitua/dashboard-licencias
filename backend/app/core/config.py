from urllib.parse import quote_plus
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Dashboard Licencias"

    # === Base de Datos Principal: PostgreSQL rh_cramer ===
    DB_HOST: str = "host.docker.internal"
    DB_PORT: int = 5432
    DB_NAME: str = "rh_cramer"
    DB_USER: str
    DB_PASSWORD: str

    # === Base de Datos Marcas: SQL Server MorphoManager ===
    MARCAS_DB_SERVER: str
    MARCAS_DB_USER: str
    MARCAS_DB_PASSWORD: str
    MARCAS_DB_NAME: str
    MARCAS_DB_DRIVER: str = "ODBC Driver 18 for SQL Server"

    # === JWT ===
    JWT_SECRET_KEY: str = "change-this-secret-key-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    # === BUK API ===
    BUK_API_BASE_URL: str
    BUK_API_KEY: str
    BUK_RENOVACIONES_KEY: str = ""  # token con permisos PATCH para renovaciones

    # === Azure App / Graph API (envío de correos) ===
    AZURE_TENANT_ID: str = ""
    AZURE_CLIENT_ID: str = ""
    AZURE_CLIENT_SECRET: str = ""
    SMTP_FROM: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_CC_LIST: str = ""  # separado por comas, sin espacios
    AZURE_REDIRECT_URI: str = "https://personas.cramer.cl:8444/api/v1/contract-alerts/auth/callback"
    TOKEN_STORAGE_PATH: str = "/app/data/ms_token.json"

    # === URL pública para links de respuesta en correos ===
    PUBLIC_URL: str = ""  # ej: https://personas.cramer.cl:8444

    # === Scheduler de alertas automáticas ===
    ALERTS_SCHEDULER_ENABLED: bool = False
    ALERTS_SCHEDULER_HOUR: int = 8       # hora de ejecución (formato 24h)
    ALERTS_SCHEDULER_MINUTE: int = 0     # minuto de ejecución
    ALERTS_SCHEDULER_TIMEZONE: str = "America/Santiago"
    ALERTS_N8N_WEBHOOK_URL: str = ""     # webhook n8n para notificaciones Telegram

    # === Scheduler de retorno post-licencia ===
    RETORNO_SCHEDULER_ENABLED: bool = False
    RETORNO_ALERT_EMAIL: str = ""        # destinatario del reporte diario de retorno
    RETORNO_SCHEDULER_HOUR: int = 8
    RETORNO_SCHEDULER_MINUTE: int = 10
    RETORNO_DIAS_ATRAS: int = 7          # ventana de días hacia atrás para buscar licencias vencidas

    # === Horas extras fin de semana ===
    OVERTIME_SCHEDULER_ENABLED: bool = False
    OVERTIME_SEND_DAY: str = "thu"       # día de envío del correo a las jefaturas
    OVERTIME_SEND_HOUR: int = 15
    OVERTIME_SEND_MINUTE: int = 0
    OVERTIME_DEADLINE_DAY: str = "fri"   # día de cierre del link
    OVERTIME_DEADLINE_HOUR: int = 14
    OVERTIME_DEADLINE_MINUTE: int = 0
    OVERTIME_SUMMARY_TO: str = ""        # destinatarios del consolidado, separados por ;
    # Modo prueba: si tiene valor, TODOS los correos de horas extras se desvían a esta
    # dirección (con asunto [PRUEBA]) en vez de ir a las jefaturas reales. Vaciar en producción.
    OVERTIME_TEST_EMAIL: str = ""

    # === CORS (lista separada por comas) ===
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://localhost"

    # === Pool de conexiones ===
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    MARCAS_DB_POOL_SIZE: int = 2
    MARCAS_DB_MAX_OVERFLOW: int = 5

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()


def get_database_url() -> str:
    """URL de conexión para PostgreSQL (rh_cramer)."""
    password_encoded = quote_plus(settings.DB_PASSWORD)
    return (
        f"postgresql+psycopg2://{settings.DB_USER}:{password_encoded}"
        f"@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}"
    )


def get_marcas_database_url() -> str:
    """URL de conexión para SQL Server (MorphoManager)."""
    password_encoded = quote_plus(settings.MARCAS_DB_PASSWORD)
    return (
        f"mssql+pyodbc://{settings.MARCAS_DB_USER}:{password_encoded}"
        f"@{settings.MARCAS_DB_SERVER}/{settings.MARCAS_DB_NAME}"
        f"?driver={settings.MARCAS_DB_DRIVER}&TrustServerCertificate=yes"
    )
