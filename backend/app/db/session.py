from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import get_database_url, settings

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
