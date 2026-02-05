from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import get_database_url

# Obtenemos la URL construida en config.py
SQLALCHEMY_DATABASE_URL = get_database_url()

# Creamos el motor de base de datos
# pool_pre_ping=True ayuda a reconectar si la conexión se cae
engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)

# Creamos la fábrica de sesiones
# autocommit=False: Para tener control total de cuándo guardar los cambios
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)