from typing import Generator
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.db.session_marcas import MarcasSessionLocal
from app.core.logging_config import logger

def get_db() -> Generator[Session, None, None]:
    """Dependencia para obtener sesión de BD de Licencias en cada petición."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_marcas_db() -> Generator[Session, None, None]:
    """Dependencia para obtener sesión de BD de Marcas en cada petición."""
    logger.info("Creando sesión de Marcas DB...")
    try:
        db = MarcasSessionLocal()
        logger.info(f"Sesión de Marcas creada: {db}")
        yield db
    except Exception as e:
        logger.error(f"Error al crear sesión de Marcas: {type(e).__name__}: {str(e)}")
        raise
    finally:
        db.close()
        logger.info("Sesión de Marcas cerrada")