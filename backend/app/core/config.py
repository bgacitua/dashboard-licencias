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

    # === Duo Security (2FA — Universal Prompt) ===
    DUO_CLIENT_ID: str = ""
    DUO_CLIENT_SECRET: str = ""
    DUO_API_HOST: str = ""            # ej: api-xxxxxxxx.duosecurity.com
    # Debe ser la URL publica del frontend + /duo/callback. Duo no la registra:
    # solo valida que sea identica entre el /authorize y el canje del codigo.
    # El :8444 de Caddy existe solo para el OAuth de Microsoft; la app se sirve
    # por nginx en el puerto 80.
    DUO_REDIRECT_URI: str = "http://personas.cramer.cl/duo/callback"

    # === BUK API ===
    BUK_API_BASE_URL: str
    BUK_API_KEY: str
    BUK_RENOVACIONES_KEY: str = ""  # token con permisos PATCH para renovaciones

    # === BUK Web (scraping de renovaciones, reemplaza al PATCH) ===
    BUK_WEB_BASE_URL: str = "https://cramer.buk.cl"
    BUK_WEB_USER: str = ""
    BUK_WEB_PASSWORD: str = ""
    BUK_WEB_HEADLESS: bool = True

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
    # n8n usa un certificado self-signed: ruta al .pem para validarlo.
    ALERTS_N8N_CA_BUNDLE: str = ""       # ej: /app/data/n8n-cert.pem

    # === Scheduler de retorno post-licencia ===
    RETORNO_SCHEDULER_ENABLED: bool = False
    RETORNO_ALERT_EMAIL: str = ""        # destinatario del reporte diario de retorno
    RETORNO_SCHEDULER_HOUR: int = 8
    RETORNO_SCHEDULER_MINUTE: int = 10
    RETORNO_DIAS_ATRAS: int = 7          # ventana de días hacia atrás para buscar licencias vencidas

    # === Horas extras fin de semana ===
    OVERTIME_SCHEDULER_ENABLED: bool = False
    OVERTIME_SEND_DAY: str = "thu"       # día de envío del correo a las jefaturas
    OVERTIME_SEND_HOUR: int = 9
    OVERTIME_SEND_MINUTE: int = 0
    OVERTIME_DEADLINE_DAY: str = "fri"   # día de cierre del link
    OVERTIME_DEADLINE_HOUR: int = 14
    OVERTIME_DEADLINE_MINUTE: int = 0
    OVERTIME_SUMMARY_TO: str = ""        # destinatarios del consolidado, separados por ;
    # Modo prueba: si tiene valor, TODOS los correos de horas extras se desvían a esta
    # dirección (con asunto [PRUEBA]) en vez de ir a las jefaturas reales. Vaciar en producción.
    OVERTIME_TEST_EMAIL: str = ""

    # === Aviso de salida de personal (desde el generador de finiquitos) ===
    SALIDA_PERSONAL_TO: str = ""         # destinatario principal
    SALIDA_PERSONAL_CC: str = ""         # copias, separadas por ;
    # Casilla remitente. Vacío = la cuenta autenticada en Graph.
    # Con otra casilla se requiere permiso SendAs en Exchange para esa cuenta.
    SALIDA_PERSONAL_FROM: str = ""

    # Carpeta donde el scraper de BUK deja screenshot + HTML cuando falla.
    BUK_WEB_DEBUG_DIR: str = "/tmp/buk_scraper"

    # === Modo prueba global de correo ===
    # Con valor, los correos que salen por email_service.send_email_graph se desvían a
    # esta casilla y se vacían CC/BCC: alertas de contratos, horas extras, avisos de
    # salida y retorno.
    # NO cubre auth_service (invitación de cuenta): ese llama a Graph
    # directo y van al propio usuario que inicia la acción, así que desviarlos dejaría
    # a la gente sin poder entrar.
    # VACIAR EN PRODUCCIÓN.
    EMAIL_TEST_REDIRECT: str = ""

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
