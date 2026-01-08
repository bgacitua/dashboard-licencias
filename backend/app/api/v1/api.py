from fastapi import APIRouter
from app.api.v1.endpoints import licencias

api_router = APIRouter()

# Incluimos el router de licencias con el prefijo /licencias
# Las rutas finales serán: /api/v1/licencias
api_router.include_router(licencias.router, prefix="/licencias", tags=["licencias"])