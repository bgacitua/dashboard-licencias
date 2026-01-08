import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Dashboard Licencias"
    
    # Variables de Base de Datos
    DB_SERVER: str
    DB_USER: str
    DB_PASSWORD: str
    DB_NAME: str
    DB_PORT: str = "1433"
    DB_DRIVER: str = "ODBC Driver 17 for SQL Server"

    class Config:
        # Indica dónde buscar el archivo .env
        env_file = ".env"
        case_sensitive = True

# Instancia global de configuración
settings = Settings()

# Función para construir la URL de conexión de SQLAlchemy
def get_database_url():
    # Formato: mssql+pyodbc://usuario:password@servidor:puerto/nombre_db?driver=Nombre+Driver
    return f"mssql+pyodbc://{settings.DB_USER}:{settings.DB_PASSWORD}@{settings.DB_SERVER}:{settings.DB_PORT}/{settings.DB_NAME}?driver={settings.DB_DRIVER}"