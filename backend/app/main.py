from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware 
from app.core.config import settings
from app.core.exceptions import generic_exception_handler
from app.core.logging_config import logger
from app.db.session import engine
from app.db.base import Base
from app.api.v1.api import api_router

logger.info("Iniciando Dashboard Licencias API")

try:
    Base.metadata.create_all(bind=engine)
    logger.info("Conexión a BD establecida")
except Exception as e:
    logger.warning(f"No se pudo conectar a la BD: {e}")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0"
)

# Handler global de excepciones
app.add_exception_handler(Exception, generic_exception_handler)

# Configuración de CORS (Permitir que el frontend hable con el backend)
origins = [
    "http://localhost:5173", # Puerto por defecto de Vite (React)
    "http://localhost:3000",
    "http://localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"mensaje": "Bienvenido al Dashboard de Licencias API"}

# Incluir todas las rutas definidas en api/v1
app.include_router(api_router, prefix="/api/v1")