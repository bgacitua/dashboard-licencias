"""Creación de permisos en Buk desde una respuesta de jefatura.

Segunda escritura del módulo, después de las marcas. Mismas reglas: Buk no
tiene ambiente de pruebas, lo que se crea queda en el sistema real y desde acá
no se puede deshacer ni consultar. Por eso `ASISTENCIA_DRY_RUN` arma el payload,
lo loguea y no envía.

PENDIENTE: falta el contrato real del endpoint de permisos del tenant
(`https://<empresa>.buk.cl/api/v1/es/api_docs`). Hasta que
`ASISTENCIA_PERMISOS_API_URL` tenga valor, crear un permiso responde 503 y el
resto del centro de notificaciones funciona igual. Lo único por ajustar cuando
llegue la doc es `_payload()` y, si el nombre no coincide, `tipo_buk()`.
"""
import httpx
from fastapi import HTTPException

from app.core.logging_config import logger

from .config import AsistenciaSettings

# "Olvidó marcar" no es permiso: eso se arregla registrando la marca, que ya
# tiene su propio flujo en Corrección de Marcas.
MOTIVOS_SIN_PERMISO = {"Olvidó marcar"}

# Motivo del formulario -> tipo de permiso en Buk. Los valores de la derecha
# son los que hay que confirmar contra el tenant; se sobrescriben sin tocar
# código con ASISTENCIA_PERMISO_TIPOS="Permiso pagado:CODIGO,...".
TIPOS_POR_DEFECTO = {
    "Permiso pagado": "permiso_con_goce",
    "Permiso sin goce": "permiso_sin_goce",
    "Inasistencia": "inasistencia_injustificada",
    # Sin tipo propio: el comentario de la jefatura dice qué es, así que el
    # tipo lo elige quien gestiona desde el panel.
    "Otro motivo": "",
}


def tipo_buk(motivo: str, settings: AsistenciaSettings) -> str:
    return settings.permiso_tipos_map.get(motivo, TIPOS_POR_DEFECTO.get(motivo, ""))


def _payload(rut: str, fecha: str, tipo: str, comentario: str) -> dict:
    """Cuerpo del POST. Ajustar acá cuando llegue el contrato del tenant."""
    return {
        "rut": rut,
        "start_date": fecha,      # yyyy-mm-dd
        "end_date": fecha,        # permiso de un día: la respuesta es por fecha
        "type": tipo,
        "comment": comentario[:500],
    }


async def crear(
    rut: str, fecha: str, motivo: str, comentario: str,
    settings: AsistenciaSettings, tipo: str = "",
) -> str:
    """Crea el permiso y devuelve la referencia que entrega Buk.

    `tipo` lo manda el panel cuando el motivo no tiene uno fijo ("Otro motivo").
    """
    if motivo in MOTIVOS_SIN_PERMISO:
        raise HTTPException(
            status_code=400,
            detail=f'"{motivo}" no genera permiso: corresponde registrar la marca '
                   "en Corrección de Marcas.",
        )

    tipo = (tipo or tipo_buk(motivo, settings)).strip()
    if not tipo:
        raise HTTPException(
            status_code=400,
            detail=f'Falta el tipo de permiso para "{motivo}". Elige uno en el panel '
                   "o configúralo en ASISTENCIA_PERMISO_TIPOS.",
        )

    url = settings.permisos_api_url.strip()
    token = (
        settings.permisos_api_key.get_secret_value()
        or settings.buk_api_key.get_secret_value()
    )
    cuerpo = _payload(rut, fecha, tipo, comentario)

    if settings.dry_run:
        logger.warning("[asistencia/permisos] DRY_RUN: permiso NO creado: %s", cuerpo)
        return "dry-run"

    if not url or not token:
        raise HTTPException(
            status_code=503,
            detail="Falta configurar ASISTENCIA_PERMISOS_API_URL y su token: el permiso "
                   "hay que crearlo a mano en Buk por ahora.",
        )

    try:
        async with httpx.AsyncClient(timeout=settings.external_timeout) as cli:
            resp = await cli.post(
                url,
                json=cuerpo,
                headers={settings.buk_api_key_header: token, "Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout al crear el permiso en Buk.")
    except httpx.HTTPStatusError as exc:
        # El detalle real al log, sin el token; al front un mensaje accionable.
        logger.error("[asistencia/permisos] Buk respondió %s: %s",
                     exc.response.status_code, exc.response.text[:500])
        raise HTTPException(
            status_code=502,
            detail=f"Buk rechazó el permiso ({exc.response.status_code}). "
                   "Revisa el log del backend para el detalle.",
        )
    except (httpx.HTTPError, ValueError) as exc:
        logger.error("[asistencia/permisos] fallo al contactar Buk: %r", exc)
        raise HTTPException(status_code=502, detail="No se pudo contactar Buk.")

    # La forma de la respuesta se confirma con el contrato; mientras, cualquier
    # id sirve de rastro y si no viene queda constancia igual.
    ref = str(data.get("id") or data.get("data", {}).get("id") or "")
    logger.info("[asistencia/permisos] permiso creado para %s el %s (ref %s)", rut, fecha, ref)
    return ref


def _demo() -> None:
    """python -m app.modules.asistencia.permisos"""
    import asyncio

    cfg = AsistenciaSettings(_env_file=None, dry_run=True)

    # Olvidó marcar no es permiso: se corta antes de armar nada.
    try:
        asyncio.run(crear("1-9", "2026-01-01", "Olvidó marcar", "", cfg))
        raise AssertionError("debía rechazar el motivo")
    except HTTPException as exc:
        assert exc.status_code == 400, exc

    # "Otro motivo" no tiene tipo fijo: sin uno elegido a mano no se manda nada.
    try:
        asyncio.run(crear("1-9", "2026-01-01", "Otro motivo", "se fue a una mudanza", cfg))
        raise AssertionError("debía exigir el tipo")
    except HTTPException as exc:
        assert exc.status_code == 400, exc
    assert asyncio.run(
        crear("1-9", "2026-01-01", "Otro motivo", "mudanza", cfg, tipo="otro")
    ) == "dry-run"

    # Con dry_run no sale nada a la red, aunque el motivo sea válido.
    assert asyncio.run(crear("1-9", "2026-01-01", "Permiso pagado", "", cfg)) == "dry-run"

    # Sin URL configurada el permiso no se inventa: 503 y se crea a mano.
    real = AsistenciaSettings(_env_file=None, dry_run=False)
    try:
        asyncio.run(crear("1-9", "2026-01-01", "Permiso pagado", "", real))
        raise AssertionError("sin endpoint debía cortar")
    except HTTPException as exc:
        assert exc.status_code == 503, exc

    # El mapa del .env le gana al valor por defecto.
    con_mapa = AsistenciaSettings(_env_file=None, permiso_tipos="Permiso pagado:PC01")
    assert tipo_buk("Permiso pagado", con_mapa) == "PC01"
    assert tipo_buk("Permiso sin goce", con_mapa) == "permiso_sin_goce"

    assert _payload("1-9", "2026-01-01", "x", "c" * 900)["comment"] == "c" * 500
    print("ok")


if __name__ == "__main__":
    _demo()
