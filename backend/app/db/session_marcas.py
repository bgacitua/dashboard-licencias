from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import get_marcas_database_url
from app.core.logging_config import logger

# Obtenemos la URL de la BD de Marcas
MARCAS_DATABASE_URL = get_marcas_database_url()

# Log de la URL (ocultando password)
url_safe = MARCAS_DATABASE_URL.replace(MARCAS_DATABASE_URL.split(':')[2].split('@')[0], '****')
logger.info(f"URL de conexión Marcas: {url_safe}")

try:
    # Motor de base de datos para Marcas
    marcas_engine = create_engine(MARCAS_DATABASE_URL, pool_pre_ping=True)
    logger.info("Engine de Marcas creado correctamente")
    
    # Fábrica de sesiones para Marcas
    MarcasSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=marcas_engine)
    logger.info("SessionLocal de Marcas creado correctamente")
except Exception as e:
    logger.error(f"Error al crear engine de Marcas: {type(e).__name__}: {str(e)}")
    raise

