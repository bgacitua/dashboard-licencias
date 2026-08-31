from fastapi import APIRouter, Depends
from app.api.v1.endpoints import licencias, marcas, auth, admin, finiquitos, employees, calculadora, vacaciones, contract_alerts, costos, retorno, seleccion, overtime, creditos
from app.core.security import get_current_user


api_router = APIRouter()

# Autenticacion a nivel de router: un endpoint nuevo nace protegido aunque su
# autor olvide la dependencia. Los routers que exponen rutas publicas a
# proposito (auth, y los formularios por token de contract-alerts/asistencia)
# se incluyen aparte, sin esta lista.
_auth = [Depends(get_current_user)]

# Router de autenticación (sin protección)
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# Router de administración (protegido, solo admin)
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])

# Incluimos el router de licencias con el prefijo /licencias
# Las rutas finales serán: /api/v1/licencias
api_router.include_router(licencias.router, prefix="/licencias", tags=["licencias"], dependencies=_auth)

# Incluimos el router de marcas con el prefijo /marcas
# Las rutas finales serán: /api/v1/marcas
api_router.include_router(marcas.router, prefix="/marcas", tags=["marcas"], dependencies=_auth)

# Incluimos el router de finiquitos con el prefijo /finiquitos
# Las rutas finales serán: /api/v1/finiquitos
api_router.include_router(finiquitos.router, prefix="/finiquitos", tags=["finiquitos"], dependencies=_auth)

# Incluimos el router de employees con el prefijo /employees
# Las rutas finales serán: /api/v1/employees
api_router.include_router(employees.router, prefix="/employees", tags=["employees"], dependencies=_auth)

api_router.include_router(calculadora.router, prefix="/calculadora", tags=["calculadora"])

api_router.include_router(vacaciones.router, prefix="/vacaciones", tags=["vacaciones"], dependencies=_auth)

api_router.include_router(
    contract_alerts.router, prefix="/contract-alerts", tags=["contract-alerts"], dependencies=_auth
)
# Callback OAuth de Microsoft y formulario de respuesta de la jefatura: quien
# los abre no tiene sesion en la plataforma. Los protege el token del enlace.
api_router.include_router(
    contract_alerts.publico, prefix="/contract-alerts", tags=["contract-alerts"]
)

api_router.include_router(costos.router, prefix="/costos", tags=["costos"])

api_router.include_router(retorno.router, prefix="/retorno", tags=["retorno"], dependencies=_auth)

api_router.include_router(seleccion.router, prefix="/seleccion", tags=["seleccion"])

api_router.include_router(overtime.router, prefix="/overtime", tags=["overtime"])

api_router.include_router(creditos.router, prefix="/creditos", tags=["creditos"])

# === Módulo de asistencia (integración de buk-asistencia) ===
# Import perezoso y detrás del flag: con ASISTENCIA_ENABLED=false el paquete ni
# se carga, así que un error suyo no puede tumbar el arranque de la plataforma.
from app.modules.asistencia.config import settings as asistencia_settings

if asistencia_settings.enabled:
    from app.modules.asistencia.router import router as asistencia_router

    api_router.include_router(asistencia_router, prefix="/asistencia", tags=["asistencia"])

    # El formulario que responde la jefatura va sin autenticación: quien lo abre
    # no tiene cuenta en la plataforma. Lo protege el token del enlace.
    from app.modules.asistencia.notificaciones import publico as asistencia_publico

    api_router.include_router(asistencia_publico, prefix="/asistencia")
