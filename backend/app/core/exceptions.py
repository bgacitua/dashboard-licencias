from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

class LicenciaNotFoundError(HTTPException):
    def __init__(self, licencia_id: int):
        super().__init__(status_code=404, detail=f"Licencia {licencia_id} no encontrada")

class DatabaseConnectionError(HTTPException):
    def __init__(self):
        super().__init__(status_code=503, detail="Error de conexión a base de datos")

class FiniquitoNotFoundError(HTTPException):
    def __init__(self, finiquito_id: int):
        super().__init__(status_code=404, detail=f"Finiquito {finiquito_id} no encontrado")

async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor", "type": str(type(exc).__name__)}
    )
