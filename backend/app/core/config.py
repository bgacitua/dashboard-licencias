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
