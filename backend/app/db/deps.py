from typing import Generator
from sqlalchemy.orm import Session
from fastapi import HTTPException
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
    db = None
    try:
        db = MarcasSessionLocal()
        yield db
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sesión Marcas: {type(e).__name__}: {str(e)}")
        raise
    finally:
        if db is not None:
            db.close()