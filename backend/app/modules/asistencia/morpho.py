"""Cruce contra el reloj biométrico (SQL Server MorphoManager). Solo lectura.

Inasistencias necesita saber si el trabajador marcó ese día: si Morpho tiene
marca, la inasistencia que reporta Buk es dudosa.

La plataforma ya conecta a MorphoManager (`app/db/session_marcas.py`), así que
acá solo va la consulta; el original abría su propio pyodbc con variables
MORPHO_* propias.
"""
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.logging_config import logger

# Una marca puede venir de cualquier reloj: solo importa RUT + día.
_SQL = text("""
    SELECT DISTINCT
        u.[EMPLOYEEID] AS empleado,
        CAST(m.[LOGDATETIME] AT TIME ZONE 'UTC'
             AT TIME ZONE 'Pacific SA Standard Time' AS DATE) AS fecha
    FROM [dbo].[AccessLog] AS m
    INNER JOIN [dbo].[User_] AS u ON m.[USERID] = u.[ID]
    WHERE CAST(m.[LOGDATETIME] AT TIME ZONE 'UTC'
               AT TIME ZONE 'Pacific SA Standard Time' AS DATE)
          BETWEEN :desde AND :hasta
""")


def limpiar_employeeid(valor: str) -> str:
    """EMPLOYEEID -> cuerpo del RUT sin puntos, sin DV y sin ceros a la izquierda.

    El frontend arma la misma clave desde el RUT que devuelve Buk, así que las
    dos normalizaciones tienen que coincidir carácter por carácter.
    """
    return valor.strip().replace(".", "").split("-")[0].lstrip("0")


def clave(rut_limpio: str, fecha_iso: str) -> str:
    return f"{rut_limpio}|{fecha_iso}"


def marcas_en_rango(db: Session, desde: str, hasta: str) -> set[str]:
    """Claves `rut|fecha` con al menos una marca entre ambas fechas (yyyy-mm-dd)."""
    filas = db.execute(_SQL, {"desde": desde, "hasta": hasta}).all()

    claves = {
        clave(limpiar_employeeid(str(emp)), str(fecha)[:10])
        for emp, fecha in filas
        if emp and fecha
    }
    logger.info(
        "[asistencia/morpho] rango=%s..%s filas=%d claves=%d",
        desde, hasta, len(filas), len(claves),
    )
    return claves


def _demo() -> None:
    assert limpiar_employeeid("01234567-8") == "1234567"
    assert limpiar_employeeid("019117548") == "19117548"
    assert limpiar_employeeid("19.117.548-9") == "19117548"
    assert limpiar_employeeid(" 020573842 ") == "20573842"
    assert clave("19117548", "2026-08-25") == "19117548|2026-08-25"
    print("ok")


if __name__ == "__main__":
    _demo()
