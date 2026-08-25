"""Registro de marcas en Buk — la única escritura del módulo.

Buk no tiene ambiente de pruebas: lo que se registra queda en el sistema real y
no hay forma de deshacerlo desde acá. Por eso `ASISTENCIA_DRY_RUN` viene en
`true` por defecto: con el flag puesto se arma el payload exacto, se loguea y
no se envía nada.

El original no tenía esta guarda: enviaba siempre.
"""
import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.logging_config import logger

from . import historial
from .config import AsistenciaSettings
from .schemas import MarcaIn, MarcaResult, RegistrarResponse
from .service import get_client


def _payload(marca: MarcaIn, recinto_id: str) -> dict:
    return {
        "id": recinto_id,
        "rut": marca.rut,
        "i": marca.i,
        "fecha": marca.fecha,
        "hora": marca.hora,
        "mov": marca.mov,
    }


async def registrar(
    obra_id: str,
    marcas: list[MarcaIn],
    settings: AsistenciaSettings,
    db: Session | None = None,
    op_id: int | None = None,
) -> RegistrarResponse:
    recinto_id = settings.recinto_keys_map.get(obra_id)
    if not recinto_id:
        raise HTTPException(
            status_code=400,
            detail=f"Sin clave de recinto para la obra {obra_id}. Configura ASISTENCIA_RECINTO_KEYS.",
        )

    # marcas_api_key es opcional: el token de lectura sirve si no hay uno propio.
    token = (
        settings.marcas_api_key.get_secret_value()
        or settings.external_api_key.get_secret_value()
    )
    if not token:
        raise HTTPException(status_code=503, detail="Módulo de asistencia sin configurar.")

    if settings.dry_run:
        logger.warning(
            "[asistencia/marcas] DRY_RUN: %d marcas NO enviadas para obra %s: %s",
            len(marcas), obra_id, [_payload(m, recinto_id) for m in marcas],
        )
        return RegistrarResponse(
            dry_run=True,
            enviadas=0,
            fallidas=0,
            resultados=[
                MarcaResult(rut=m.rut, i=m.i, fecha=m.fecha, ok=True, detail="dry-run: no enviada")
                for m in marcas
            ],
        )

    resultados: list[MarcaResult] = []
    async with httpx.AsyncClient(timeout=settings.external_timeout) as client:
        # Secuencial a propósito: son escrituras en un sistema sin rollback, y
        # un lote paralelo que falla a la mitad deja un estado más difícil de leer.
        for m in marcas:
            try:
                resp = await client.post(
                    settings.marcas_api_url,
                    data=_payload(m, recinto_id),
                    headers={settings.marcas_api_key_header: token, "Accept": "application/json"},
                )
                ok = resp.is_success
                detalle = "" if ok else f"HTTP {resp.status_code}: {resp.text[:200]}"
            except httpx.HTTPError as exc:
                ok, detalle = False, f"error de red: {exc!r}"
            resultados.append(MarcaResult(rut=m.rut, i=m.i, fecha=m.fecha, ok=ok, detail=detalle))

    enviadas = sum(1 for r in resultados if r.ok)
    logger.info("[asistencia/marcas] obra=%s enviadas=%d/%d", obra_id, enviadas, len(resultados))

    if db is not None:
        # Buk no permite consultar ni deshacer lo que mandamos: este es el único
        # registro de qué se escribió. Se guarda incluso lo que falló.
        historial.registrar(db, obra_id, [
            {"rut": r.rut, "sentido": r.i, "fecha": r.fecha, "hora": m.hora,
             "mov": m.mov, "ok": r.ok, "detail": r.detail}
            for m, r in zip(marcas, resultados)
        ])
        if op_id is not None:
            historial.actualizar_registros(db, op_id, [
                {"record_id": m.record_id, "status": "synced" if r.ok else "pending"}
                for m, r in zip(marcas, resultados)
                if m.record_id
            ])

    # La lectura siguiente tiene que ver lo recién registrado.
    get_client().invalidate(settings.external_api_url)

    return RegistrarResponse(
        dry_run=False,
        enviadas=enviadas,
        fallidas=len(resultados) - enviadas,
        resultados=resultados,
    )


def _demo() -> None:
    """python -m app.modules.asistencia.marcas — check de la guarda de DRY_RUN."""
    import asyncio

    marcas = [MarcaIn(rut="12345678-9", i="entrada", fecha="20/6/2026", hora="8:0:0")]

    base = dict(external_api_key="tok", recinto_keys="36787:clave")
    seca = AsistenciaSettings(dry_run=True, **base)

    r = asyncio.run(registrar("36787", marcas, seca))
    assert r.dry_run and r.enviadas == 0 and len(r.resultados) == 1, r

    # Obra sin clave de recinto: 400 antes de tocar la red, incluso sin dry_run.
    for settings in (seca, AsistenciaSettings(dry_run=False, **base)):
        try:
            asyncio.run(registrar("99999", marcas, settings))
            raise AssertionError("debía exigir la clave de recinto")
        except HTTPException as exc:
            assert exc.status_code == 400, exc

    assert _payload(marcas[0], "clave")["id"] == "clave"
    print("ok")


if __name__ == "__main__":
    _demo()
