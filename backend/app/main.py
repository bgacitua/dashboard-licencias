from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.exceptions import generic_exception_handler
from app.core.logging_config import logger
from app.db.session import engine
from app.db.base import Base
from app.api.v1.api import api_router
from app.services.scheduler_service import start_scheduler, stop_scheduler

logger.info("Iniciando Dashboard Licencias API")

try:
    Base.metadata.create_all(bind=engine)
    logger.info("Conexión a BD establecida")
except Exception as e:
    logger.warning(f"No se pudo conectar a la BD: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    lifespan=lifespan,
)

app.add_exception_handler(Exception, generic_exception_handler)

origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]

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


app.include_router(api_router, prefix="/api/v1")
