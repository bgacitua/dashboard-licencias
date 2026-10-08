from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import get_database_url, get_readonly_database_url, settings

SQLALCHEMY_DATABASE_URL = get_database_url()

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    # Fija el search_path a 'rh' para que las queries sin schema apunten a rh_cramer.rh
    connect_args={"options": "-c search_path=rh,app,public"},
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# === Sesión de solo lectura (rh_cramer_ro) ===
# Para scripts de diagnóstico y consultas manuales, no para la app: los
# endpoints que escriben necesitan el usuario de get_database_url().
# El engine se crea al primer uso, no al importar: en los despliegues sin
# DB_RO_USER/DB_RO_PASSWORD el backend sigue levantando igual.
_readonly_engine = None


def readonly_session():
    """Sesión con el rol de solo lectura. Falla si no hay credencial RO."""
    global _readonly_engine
    if _readonly_engine is None:
        _readonly_engine = create_engine(
            get_readonly_database_url(),
            connect_args={"options": "-c search_path=rh,app,public"},
            pool_pre_ping=True,
        )
    return sessionmaker(autocommit=False, autoflush=False, bind=_readonly_engine)()
