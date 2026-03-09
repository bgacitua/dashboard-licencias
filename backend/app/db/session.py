from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import get_database_url, settings

# Obtenemos la URL construida en config.py
SQLALCHEMY_DATABASE_URL = get_database_url()

# Creamos el motor de base de datos
# pool_pre_ping=True ayuda a reconectar si la conexión se cae
# pool_size/max_overflow evitan crear/destruir conexiones en cada pico de carga
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
)

# Creamos la fábrica de sesiones
# autocommit=False: Para tener control total de cuándo guardar los cambios
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)