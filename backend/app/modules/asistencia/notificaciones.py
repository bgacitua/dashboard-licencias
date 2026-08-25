"""Aviso a jefatura de inasistencias, y formulario donde responde el motivo.

Flujo:
  1. Se seleccionan filas en Inasistencias y se envían: un correo por trabajador
     con todas sus fechas juntas.
  2. El correo lleva un link único a un formulario servido por este backend.
  3. La jefatura elige un motivo por fecha; la respuesta vuelve como columna en
     la tabla, así se sabe cuáles ya están justificadas.

El formulario es público: la jefatura no tiene cuenta en la plataforma. Lo
protege un token de 24 bytes generado con `secrets`, que es la única credencial
del enlace — por eso vive en un router aparte, sin `require_module`, y solo
permite responder esa notificación puntual.

El correo sale por `app.services.email_service`, que ya respeta
EMAIL_TEST_REDIRECT: con esa variable puesta, todo esto se prueba sin escribirle
a una jefatura real.
"""
import html
import re
import secrets
import urllib.parse
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, field_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.logging_config import logger
from app.db.deps import get_db
from app.services.email_service import send_email_graph
from app.services.email_token_service import AuthRequiredError, get_access_token

from .config import AsistenciaSettings, get_settings

OPCIONES = ["Olvidó marcar", "Permiso pagado", "Permiso sin goce", "Inasistencia"]


# === Storage ===

def crear(db: Session, obra_id: str, rut: str, nombre: str, jefatura: str, fechas: list[str]) -> str:
    # No adivinable: el token es la única credencial del formulario.
    token = secrets.token_urlsafe(24)
    db.execute(
        text("""INSERT INTO app.asistencia_notificacion (token, obra_id, rut, nombre, jefatura)
                VALUES (:token, :obra_id, :rut, :nombre, :jefatura)"""),
        {"token": token, "obra_id": obra_id, "rut": rut, "nombre": nombre, "jefatura": jefatura},
    )
    db.execute(
        text("""INSERT INTO app.asistencia_notificacion_fecha (token, fecha)
                VALUES (:token, CAST(:fecha AS date)) ON CONFLICT DO NOTHING"""),
        [{"token": token, "fecha": f} for f in sorted(set(fechas))],
    )
    db.commit()
    return token


def obtener(db: Session, token: str) -> dict | None:
    fila = db.execute(
        text("""SELECT token, rut, nombre, jefatura, respondido_at
                FROM app.asistencia_notificacion WHERE token = :token"""),
        {"token": token},
    ).mappings().first()
    if not fila:
        return None
    fechas = db.execute(
        text("""SELECT fecha FROM app.asistencia_notificacion_fecha
                WHERE token = :token ORDER BY fecha"""),
        {"token": token},
    ).scalars()
    return {**dict(fila), "fechas": [f.isoformat() for f in fechas]}


def responder(db: Session, token: str, respuestas: dict[str, str], comentario: str) -> None:
    db.execute(
        text("""UPDATE app.asistencia_notificacion_fecha SET respuesta = :respuesta
                WHERE token = :token AND fecha = CAST(:fecha AS date)"""),
        [{"respuesta": opcion, "token": token, "fecha": fecha}
         for fecha, opcion in respuestas.items()],
    )
    db.execute(
        text("""UPDATE app.asistencia_notificacion
                SET comentario = :comentario, respondido_at = :ts WHERE token = :token"""),
        {"comentario": comentario, "ts": datetime.now(timezone.utc), "token": token},
    )
    db.commit()


def respuestas_por_clave(db: Session, desde: str, hasta: str) -> dict[str, str]:
    """{rut|fecha: motivo} de lo ya respondido en el rango."""
    filas = db.execute(
        text("""SELECT n.rut, f.fecha, f.respuesta
                FROM app.asistencia_notificacion_fecha f
                JOIN app.asistencia_notificacion n ON n.token = f.token
                WHERE f.respuesta <> '' AND f.fecha BETWEEN CAST(:desde AS date) AND CAST(:hasta AS date)"""),
        {"desde": desde, "hasta": hasta},
    ).mappings()
    return {f"{r['rut']}|{r['fecha'].isoformat()}": r["respuesta"] for r in filas}


def notificadas_por_clave(db: Session, desde: str, hasta: str) -> list[str]:
    """Claves rut|fecha con correo ya enviado, respondido o no: evita reenviar."""
    filas = db.execute(
        text("""SELECT DISTINCT n.rut, f.fecha
                FROM app.asistencia_notificacion_fecha f
                JOIN app.asistencia_notificacion n ON n.token = f.token
                WHERE f.fecha BETWEEN CAST(:desde AS date) AND CAST(:hasta AS date)"""),
        {"desde": desde, "hasta": hasta},
    ).mappings()
    return [f"{r['rut']}|{r['fecha'].isoformat()}" for r in filas]


# === Entrada ===

class AvisoIn(BaseModel):
    rut: str          # rut normalizado, el mismo con el que se cruza la tabla
    nombre: str = ""
    jefatura: str
    fechas: list[str]  # yyyy-mm-dd

    # Regex en vez de EmailStr: evita sumar la dependencia email-validator.
    @field_validator("jefatura")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
            raise ValueError("Correo de jefatura inválido")
        return v

    @field_validator("fechas")
    @classmethod
    def _fechas(cls, v: list[str]) -> list[str]:
        for f in v:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", f):
                raise ValueError(f"Fecha inválida: {f}")
        return v


class NotificarRequest(BaseModel):
    obra_id: str = ""
    avisos: list[AvisoIn]


class NotificarResponse(BaseModel):
    enviados: int
    fallidos: int
    detalles: list[str] = []


def consolidar(avisos: list[AvisoIn]) -> dict[tuple[str, str], AvisoIn]:
    """Un solo correo por (jefatura, trabajador), con todas sus fechas juntas."""
    agrupado: dict[tuple[str, str], AvisoIn] = {}
    for a in avisos:
        clave = (a.jefatura.lower(), a.rut)
        if clave in agrupado:
            agrupado[clave].fechas = sorted(set(agrupado[clave].fechas + a.fechas))
        else:
            copia = a.model_copy(deep=True)
            copia.fechas = sorted(set(copia.fechas))
            agrupado[clave] = copia
    return agrupado


def cuerpo(nombre: str, rut: str, fechas: list[str], url: str) -> str:
    filas = ''.join(f'<li>{html.escape(f)}</li>' for f in fechas)
    return f"""
<p>Hola,</p>
<p>Se detectaron <strong>{len(fechas)}</strong> día(s) sin marcas de asistencia de
<strong>{html.escape(nombre or rut)}</strong> (RUT {html.escape(rut)}):</p>
<ul>{filas}</ul>
<p>Por favor indica el motivo de cada fecha en el siguiente formulario:</p>
<p><a href="{html.escape(url)}">Responder motivos de inasistencia</a></p>
<p style="color:#666;font-size:12px">Correo automático — Control de Asistencia.</p>
"""


async def notificar(
    req: NotificarRequest, db: Session, settings: AsistenciaSettings
) -> NotificarResponse:
    # Sin sesión de Microsoft no sale ningún correo: se corta antes de crear las
    # notificaciones, para no dejar tokens colgando de avisos que nadie recibió.
    try:
        await run_in_threadpool(get_access_token)
    except AuthRequiredError:
        raise HTTPException(
            status_code=503,
            detail="No hay sesión de Microsoft activa. Autorízala en /api/v1/contract-alerts/auth/login.",
        )

    agrupado = consolidar(req.avisos)
    enviados = 0
    detalles: list[str] = []

    for (jefatura, rut), aviso in agrupado.items():
        fechas = sorted(set(aviso.fechas))
        if not fechas:
            continue
        token = crear(db, req.obra_id, rut, aviso.nombre, jefatura, fechas)
        url = f"{settings.public_base_url.rstrip('/')}/api/v1/asistencia/notificacion/{token}"
        asunto = f"Inasistencias sin justificar — {aviso.nombre or rut} ({len(fechas)} día(s))"
        # send_email_graph es sync (httpx bloqueante): al threadpool para no
        # frenar el loop mientras se manda un correo por trabajador.
        ok = await run_in_threadpool(
            send_email_graph, jefatura, "", asunto, cuerpo(aviso.nombre, rut, fechas, url)
        )
        if ok:
            enviados += 1
        else:
            detalles.append(f"{aviso.nombre or rut} → {jefatura}: el correo no salió")
            logger.warning("[asistencia/notificaciones] falló el correo a %s", jefatura)

    return NotificarResponse(
        enviados=enviados, fallidos=len(agrupado) - enviados, detalles=detalles
    )


# === Formulario público ===
# Sin require_module: la jefatura no tiene cuenta. El token del enlace es la
# única credencial, y solo habilita responder esa notificación.

publico = APIRouter(tags=["asistencia-notificaciones"])

_CSS = (
    "body{font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem;"
    "color:#222}h1{font-size:1.25rem}label{display:block;margin:.75rem 0}"
    "select,textarea{width:100%;padding:.5rem;font:inherit;margin-top:.25rem}"
    "button{padding:.6rem 1.2rem;font:inherit;background:#1d4ed8;color:#fff;border:0;"
    "border-radius:4px;cursor:pointer}.ok{color:#15803d}"
)


def _pagina(titulo: str, body: str) -> HTMLResponse:
    return HTMLResponse(
        f"<!doctype html><html lang=es><meta charset=utf-8>"
        f"<meta name=viewport content='width=device-width,initial-scale=1'>"
        f"<title>{html.escape(titulo)}</title><style>{_CSS}</style>{body}"
    )


@publico.get("/notificacion/{token}", response_class=HTMLResponse)
def formulario(token: str, db: Session = Depends(get_db)) -> HTMLResponse:
    n = obtener(db, token)
    if not n:
        raise HTTPException(404, "Enlace no válido.")
    if n["respondido_at"]:
        return _pagina("Ya respondido",
                       "<h1 class=ok>✓ Este formulario ya fue respondido</h1>"
                       "<p>Gracias, no es necesario hacer nada más.</p>")

    opciones = ''.join(f'<option>{html.escape(o)}</option>' for o in OPCIONES)
    campos = ''.join(
        f"<label>{html.escape(f)}<select name='f_{html.escape(f)}' required>"
        f"<option value='' selected disabled>Selecciona un motivo</option>{opciones}</select></label>"
        for f in n["fechas"]
    )
    return _pagina(
        "Motivo de inasistencia",
        f"<h1>Motivo de inasistencia</h1>"
        f"<p><strong>{html.escape(n['nombre'] or n['rut'])}</strong> — RUT {html.escape(n['rut'])}</p>"
        f"<form method=post>{campos}"
        f"<label>Comentario (opcional)<textarea name=comentario rows=3></textarea></label>"
        f"<button type=submit>Enviar respuesta</button></form>",
    )


@publico.post("/notificacion/{token}", response_class=HTMLResponse)
async def responder_formulario(
    token: str, request: Request, db: Session = Depends(get_db)
) -> HTMLResponse:
    n = obtener(db, token)
    if not n:
        raise HTTPException(404, "Enlace no válido.")
    if n["respondido_at"]:
        return _pagina("Ya respondido", "<h1 class=ok>✓ Ya habíamos recibido tu respuesta</h1>")

    # parse_qs de stdlib: el form es urlencoded y así no depende de python-multipart.
    form = {
        k: v[0]
        for k, v in urllib.parse.parse_qs((await request.body()).decode("utf-8")).items()
    }

    respuestas: dict[str, str] = {}
    for f in n["fechas"]:
        valor = form.get(f"f_{f}", "").strip()
        # Solo se aceptan las opciones conocidas: el formulario es público.
        if valor not in OPCIONES:
            raise HTTPException(400, f"Motivo inválido para la fecha {f}.")
        respuestas[f] = valor

    responder(db, token, respuestas, form.get("comentario", "")[:1000])
    return _pagina("Gracias", "<h1 class=ok>✓ Respuesta registrada</h1>"
                              "<p>Gracias. Puedes cerrar esta ventana.</p>")


def _demo() -> None:
    """python -m app.modules.asistencia.notificaciones"""
    # Un correo por (jefatura, trabajador), con las fechas unidas y sin repetir.
    grupos = consolidar([
        AvisoIn(rut="1", jefatura="a@x.cl", fechas=["2026-01-01"]),
        AvisoIn(rut="1", jefatura="A@X.cl", fechas=["2026-01-02", "2026-01-01"]),
        AvisoIn(rut="2", jefatura="a@x.cl", fechas=["2026-01-01"]),
    ])
    assert len(grupos) == 2, grupos
    assert grupos[("a@x.cl", "1")].fechas == ["2026-01-01", "2026-01-02"], grupos

    for malo in ("sin-arroba", "a@x", ""):
        try:
            AvisoIn(rut="1", jefatura=malo, fechas=["2026-01-01"])
            raise AssertionError(f"debía rechazar {malo!r}")
        except ValueError:
            pass

    try:
        AvisoIn(rut="1", jefatura="a@x.cl", fechas=["01-01-2026"])
        raise AssertionError("debía rechazar una fecha que no sea ISO")
    except ValueError:
        pass

    # El nombre del trabajador viaja escapado: entra al HTML del correo.
    html_correo = cuerpo('<script>alert(1)</script>', '1-9', ['2026-01-01'], 'http://x/y')
    assert "<script>" not in html_correo, html_correo
    print("ok")


if __name__ == "__main__":
    _demo()
