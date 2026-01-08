from fastapi import FastAPI
# CORS es vital para que React pueda comunicarse con FastAPI
from fastapi.middleware.cors import CORSMiddleware 
from app.core.config import settings
from app.db.session import engine
from app.db.base import Base
from app.api.v1.api import api_router # Importamos el router

# Crea las tablas (cuando haya conexión)
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"Advertencia: No se pudo conectar a la BD ({e}). Continuando sin BD...")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0"
)

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