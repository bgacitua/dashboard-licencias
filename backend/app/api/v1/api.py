from fastapi import APIRouter
from app.api.v1.endpoints import licencias, marcas, auth, admin, finiquitos, employees, calculadora, vacaciones


api_router = APIRouter()

# Router de autenticación (sin protección)
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# Router de administración (protegido, solo admin)
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])

# Incluimos el router de licencias con el prefijo /licencias
# Las rutas finales serán: /api/v1/licencias
api_router.include_router(licencias.router, prefix="/licencias", tags=["licencias"])

# Incluimos el router de marcas con el prefijo /marcas
# Las rutas finales serán: /api/v1/marcas
api_router.include_router(marcas.router, prefix="/marcas", tags=["marcas"])

# Incluimos el router de finiquitos con el prefijo /finiquitos
# Las rutas finales serán: /api/v1/finiquitos
api_router.include_router(finiquitos.router, prefix="/finiquitos", tags=["finiquitos"])

# Incluimos el router de employees con el prefijo /employees
# Las rutas finales serán: /api/v1/employees
api_router.include_router(employees.router, prefix="/employees", tags=["employees"])

api_router.include_router(calculadora.router, prefix="/calculadora", tags=["calculadora"])

api_router.include_router(vacaciones.router, prefix="/vacaciones", tags=["vacaciones"])
