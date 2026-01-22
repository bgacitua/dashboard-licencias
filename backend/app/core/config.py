import os
from urllib.parse import quote_plus
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Dashboard Licencias"
    
    # Variables de Base de Datos (Licencias)
    DB_SERVER: str
    DB_USER: str
    DB_PASSWORD: str
    DB_NAME: str
    DB_DRIVER: str = "ODBC Driver 18 for SQL Server"
    
    # Variables de Base de Datos (Marcas)
    MARCAS_DB_SERVER: str
    MARCAS_DB_USER: str
    MARCAS_DB_PASSWORD: str
    MARCAS_DB_NAME: str
    MARCAS_DB_DRIVER: str = "ODBC Driver 18 for SQL Server"

    class Config:
        # Indica dónde buscar el archivo .env
        env_file = ".env"
        case_sensitive = True

# Instancia global de configuración
settings = Settings()

# Función para construir la URL de conexión de SQLAlchemy (Licencias)
def get_database_url():
    # Formato: mssql+pyodbc://usuario:password@servidor:puerto/nombre_db?driver=Nombre+Driver
    # TrustServerCertificate=yes evita errores SSL con certificados auto-firmados (ODBC Driver 18+)
    # quote_plus codifica caracteres especiales en el password (como @, #, etc.)
    password_encoded = quote_plus(settings.DB_PASSWORD)
    return f"mssql+pyodbc://{settings.DB_USER}:{password_encoded}@{settings.DB_SERVER}/{settings.DB_NAME}?driver={settings.DB_DRIVER}&TrustServerCertificate=yes"

# Función para construir la URL de conexión de SQLAlchemy (Marcas)
def get_marcas_database_url():
    password_encoded = quote_plus(settings.MARCAS_DB_PASSWORD)
    return f"mssql+pyodbc://{settings.MARCAS_DB_USER}:{password_encoded}@{settings.MARCAS_DB_SERVER}/{settings.MARCAS_DB_NAME}?driver={settings.MARCAS_DB_DRIVER}&TrustServerCertificate=yes"