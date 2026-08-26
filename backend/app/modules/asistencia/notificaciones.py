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

from app.core.config import settings as plataforma
from app.core.logging_config import logger
from app.db.deps import get_db
from app.services.email_service import send_email_graph
from app.services.email_token_service import AuthRequiredError, get_access_token

from .config import AsistenciaSettings

OPCIONES = ["Olvidó marcar", "Permiso pagado", "Permiso sin goce", "Inasistencia"]


def base_publica(settings: AsistenciaSettings) -> str:
    """Host desde el que la jefatura abre el formulario.

    Por defecto el mismo PUBLIC_URL con el que la plataforma manda los links de
    alertas de contrato y horas extras: son las mismas jefaturas y el mismo
    problema, y tener dos valores solo abre la puerta a que uno quede mal.
    """
    base = settings.public_base_url or plataforma.PUBLIC_URL
    if not base:
        raise HTTPException(
            status_code=503,
            detail="Falta PUBLIC_URL (o ASISTENCIA_PUBLIC_BASE_URL): sin eso el correo "
                   "llevaría un link que no abre.",
        )
    return base.rstrip("/")


def dmy(iso: str) -> str:
    """yyyy-mm-dd -> dd-mm-yyyy, que es como se leen las fechas acá.

    Solo para mostrar: el valor que viaja en el formulario sigue siendo ISO.
    """
    partes = iso.split("-")
    return f"{partes[2]}-{partes[1]}-{partes[0]}" if len(partes) == 3 else iso


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


def jefaturas_por_rut(db: Session, ruts: list[str]) -> dict[str, str]:
    """rut_sin_dv -> correo del jefe directo, para trabajadores activos.

    rh.employees guarda el RUT como xx.xxx.xxx-x, tanto en `rut` como en
    `rut_boss`: sacando puntos, guion y DV queda el mismo cuerpo que manda
    limpiarRut() en el front. Si ese formato cambiara, esto es lo único a tocar.
    """
    pedidos = sorted({r for r in ruts if r})
    if not pedidos:
        return {}
    filas = db.execute(
        text("""SELECT DISTINCT rut, email FROM (
                    SELECT ltrim(left(regexp_replace(e.rut, '[^0-9kK]', '', 'g'), -1), '0') AS rut,
                           e2.email AS email
                    FROM rh.employees e
                    JOIN rh.employees e2 ON e2.rut = e.rut_boss
                    WHERE e.status = 'activo' AND e2.email IS NOT NULL AND e2.email <> ''
                ) t
                WHERE rut = ANY(:ruts)"""),
        {"ruts": pedidos},
    ).mappings().all()

    out: dict[str, str] = {}
    for f in filas:
        out.setdefault(f["rut"], f["email"])
    logger.info(
        "[asistencia/jefaturas] %d de %d RUT resueltos", len(out), len(pedidos)
    )
    return out


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


class Preview(BaseModel):
    """El correo tal como saldría, para revisarlo sin mandarlo."""

    jefatura: str
    rut: str
    nombre: str
    fechas: list[str]
    asunto: str
    html: str
    url: str          # link real al formulario: el token ya existe


class NotificarResponse(BaseModel):
    # true = no salió ningún correo; las notificaciones sí se crearon, así que
    # los formularios de `previews` se pueden abrir y responder.
    dry_run: bool = False
    enviados: int
    fallidos: int
    detalles: list[str] = []
    previews: list[Preview] = []


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


# Outlook de escritorio renderiza con el motor de Word: sin font-family inline
# el correo sale en Times New Roman, y ni `<div>` con ancho ni un `<a>` con
# padding y bordes redondeados sobreviven. De ahí las tablas y el estilo inline,
# que es lo único que ese motor respeta de forma consistente.
_FUENTE_CORREO = "font-family:Segoe UI,Calibri,Arial,Helvetica,sans-serif"
_TEXTO = f"{_FUENTE_CORREO};font-size:15px;line-height:22px;color:#1f2328"


def cuerpo(nombre: str, rut: str, fechas: list[str], url: str) -> str:
    """HTML del correo. Pensado para el motor de Word, no para un navegador."""
    # Word ignora los márgenes de <ul>: la lista va como filas de una tabla.
    filas = ''.join(
        f'<tr><td style="{_TEXTO};padding:2px 0 2px 14px">• {html.escape(dmy(f))}</td></tr>'
        for f in fechas
    )
    plural = "día" if len(fechas) == 1 else "días"

    return f"""<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background:#f6f8fa;padding:24px 12px">
 <tr><td align="center">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560"
         style="width:560px;max-width:560px;background:#ffffff;border:1px solid #d0d7de">
   <tr><td style="padding:20px 24px;border-bottom:1px solid #d0d7de">
     <p style="{_FUENTE_CORREO};font-size:17px;line-height:24px;color:#1f2328;
               font-weight:bold;margin:0">Inasistencias sin justificar</p>
     <p style="{_FUENTE_CORREO};font-size:14px;line-height:20px;color:#656d76;margin:4px 0 0">
       {html.escape(nombre or rut)} &middot; RUT {html.escape(rut)}</p>
   </td></tr>
   <tr><td style="padding:20px 24px">
     <p style="{_TEXTO};margin:0 0 12px">Hola,</p>
     <p style="{_TEXTO};margin:0 0 12px">
       Se detectaron <strong>{len(fechas)}</strong> {plural} sin marcas de asistencia de
       <strong>{html.escape(nombre or rut)}</strong>:</p>
     <table role="presentation" cellpadding="0" cellspacing="0" border="0"
            style="margin:0 0 16px">{filas}</table>
     <p style="{_TEXTO};margin:0 0 16px">
       Por favor indica el motivo de cada fecha en el siguiente formulario:</p>
     <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr><td bgcolor="#1f6feb" style="padding:11px 22px">
        <a href="{html.escape(url)}"
           style="{_FUENTE_CORREO};font-size:15px;font-weight:bold;color:#ffffff;
                  text-decoration:none;display:inline-block">Responder motivos</a>
      </td></tr>
     </table>
   </td></tr>
   <tr><td style="padding:14px 24px;border-top:1px solid #d0d7de">
     <p style="{_FUENTE_CORREO};font-size:12px;line-height:18px;color:#656d76;margin:0">
       Correo automático - Si considera existe un error en la información,
       contactar a <a href="mailto:bgacitua@cramer.cl"
       style="color:#656d76">bgacitua@cramer.cl</a></p>
   </td></tr>
  </table>
 </td></tr>
</table>"""


async def notificar(
    req: NotificarRequest, db: Session, settings: AsistenciaSettings
) -> NotificarResponse:
    """Crea las notificaciones y, salvo en dry-run, manda los correos.

    En dry-run los avisos igual se guardan y devuelven su link: el formulario es
    lo que hay que revisar, y así se prueba completo sin escribirle a nadie.
    """
    if not settings.dry_run:
        # Sin sesión de Microsoft no sale ningún correo: se corta antes de crear
        # las notificaciones, para no dejar tokens de avisos que nadie recibió.
        try:
            await run_in_threadpool(get_access_token)
        except AuthRequiredError:
            raise HTTPException(
                status_code=503,
                detail="No hay sesión de Microsoft activa. Autorízala en "
                       "/api/v1/contract-alerts/auth/login, o deja ASISTENCIA_DRY_RUN=true "
                       "para revisar los correos sin enviarlos.",
            )

    base = base_publica(settings)
    agrupado = consolidar(req.avisos)
    enviados = 0
    detalles: list[str] = []
    previews: list[Preview] = []

    for (jefatura, rut), aviso in agrupado.items():
        fechas = sorted(set(aviso.fechas))
        if not fechas:
            continue
        token = crear(db, req.obra_id, rut, aviso.nombre, jefatura, fechas)
        url = f"{base}/api/v1/asistencia/notificacion/{token}"
        asunto = f"Inasistencias sin justificar — {aviso.nombre or rut} ({len(fechas)} día(s))"
        html_correo = cuerpo(aviso.nombre, rut, fechas, url)

        previews.append(Preview(
            jefatura=jefatura, rut=rut, nombre=aviso.nombre, fechas=fechas,
            asunto=asunto, html=html_correo, url=url,
        ))

        if settings.dry_run:
            logger.warning(
                "[asistencia/notificaciones] DRY_RUN: correo NO enviado a %s (%s, %d fechas)",
                jefatura, aviso.nombre or rut, len(fechas),
            )
            continue

        # send_email_graph es sync (httpx bloqueante): al threadpool para no
        # frenar el loop mientras se manda un correo por trabajador.
        ok = await run_in_threadpool(send_email_graph, jefatura, "", asunto, html_correo)
        if ok:
            enviados += 1
        else:
            detalles.append(f"{aviso.nombre or rut} → {jefatura}: el correo no salió")
            logger.warning("[asistencia/notificaciones] falló el correo a %s", jefatura)

    return NotificarResponse(
        dry_run=settings.dry_run,
        enviados=enviados,
        fallidos=0 if settings.dry_run else len(agrupado) - enviados,
        detalles=detalles,
        previews=previews,
    )


# === Formulario público ===
# Sin require_module: la jefatura no tiene cuenta. El token del enlace es la
# única credencial, y solo habilita responder esa notificación.

publico = APIRouter(tags=["asistencia-notificaciones"])

_CSS = """
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;padding:2rem 1rem;
       background:#f6f8fa;color:#1f2328;line-height:1.5}
  .card{max-width:560px;margin:0 auto;background:#fff;border:1px solid #d0d7de;
        border-radius:12px;overflow:hidden}
  .card__head{padding:1.25rem 1.5rem;border-bottom:1px solid #d0d7de}
  h1{font-size:1.15rem;margin:0 0 .35rem}
  .persona{font-size:1.05rem;font-weight:600;margin:0}
  .rut{color:#656d76;font-size:.9rem;margin:.15rem 0 0}
  .card__body{padding:1.25rem 1.5rem}
  .intro{color:#656d76;font-size:.9rem;margin:0 0 1.25rem}
  label{display:block;margin-bottom:1rem}
  .fecha{display:block;font-weight:600;font-size:.95rem;margin-bottom:.35rem}
  select,textarea{width:100%;padding:.55rem .6rem;font:inherit;border:1px solid #d0d7de;
                  border-radius:8px;background:#fff}
  select:focus,textarea:focus{outline:2px solid #0969da;outline-offset:-1px;border-color:#0969da}
  textarea{resize:vertical}
  button{width:100%;padding:.7rem 1.2rem;font:inherit;font-weight:600;background:#1f6feb;
         color:#fff;border:0;border-radius:8px;cursor:pointer;margin-top:.5rem}
  button:hover{background:#1a5fd0}
  .ok{color:#1a7f37;font-size:1.15rem;font-weight:600;margin:0 0 .5rem}
  .nota{color:#656d76;font-size:.9rem;margin:0}
  @media (max-width:480px){body{padding:1rem .75rem}.card__head,.card__body{padding:1rem}}
"""


def _pagina(titulo: str, body: str) -> HTMLResponse:
    return HTMLResponse(
        f"<!doctype html><html lang=es><meta charset=utf-8>"
        f"<meta name=viewport content='width=device-width,initial-scale=1'>"
        f"<title>{html.escape(titulo)}</title><style>{_CSS}</style>"
        f"<div class=card>{body}</div>"
    )


@publico.get("/notificacion/{token}", response_class=HTMLResponse)
def formulario(token: str, db: Session = Depends(get_db)) -> HTMLResponse:
    n = obtener(db, token)
    if not n:
        raise HTTPException(404, "Enlace no válido.")
    if n["respondido_at"]:
        return _pagina("Ya respondido",
                       "<div class=card__body><p class=ok>✓ Este formulario ya fue respondido</p>"
                       "<p class=nota>Gracias, no es necesario hacer nada más.</p></div>")

    opciones = ''.join(f'<option>{html.escape(o)}</option>' for o in OPCIONES)
    # La etiqueta va en dd-mm-yyyy; el name conserva la fecha ISO, que es la
    # clave con la que se guarda la respuesta.
    campos = ''.join(
        f"<label><span class=fecha>{html.escape(dmy(f))}</span>"
        f"<select name='f_{html.escape(f)}' required>"
        f"<option value='' selected disabled>Selecciona un motivo</option>{opciones}</select></label>"
        for f in n["fechas"]
    )
    dias = len(n["fechas"])
    # Sin nombre resuelto queda el RUT como identificación: mejor eso que un
    # encabezado vacío, aunque el aviso debería traerlo desde los turnos.
    nombre = n["nombre"] or n["rut"]
    return _pagina(
        "Motivo de inasistencia",
        f"<div class=card__head>"
        f"<h1>Motivo de inasistencia</h1>"
        f"<p class=persona>{html.escape(nombre)}</p>"
        f"<p class=rut>RUT {html.escape(n['rut'])}</p>"
        f"</div>"
        f"<div class=card__body>"
        f"<p class=intro>Se registr{'ó' if dias == 1 else 'aron'} {dias} "
        f"d{'ía' if dias == 1 else 'ías'} sin marcas de asistencia. "
        f"Indica el motivo de cada fecha.</p>"
        f"<form method=post>{campos}"
        f"<label><span class=fecha>Comentario (opcional)</span>"
        f"<textarea name=comentario rows=3></textarea></label>"
        f"<button type=submit>Enviar respuesta</button></form>"
        f"</div>",
    )


@publico.post("/notificacion/{token}", response_class=HTMLResponse)
async def responder_formulario(
    token: str, request: Request, db: Session = Depends(get_db)
) -> HTMLResponse:
    n = obtener(db, token)
    if not n:
        raise HTTPException(404, "Enlace no válido.")
    if n["respondido_at"]:
        return _pagina("Ya respondido",
                       "<div class=card__body><p class=ok>✓ Ya habíamos recibido tu respuesta</p></div>")

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
    return _pagina("Gracias",
                   "<div class=card__body><p class=ok>✓ Respuesta registrada</p>"
                   "<p class=nota>Gracias. Puedes cerrar esta ventana.</p></div>")


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

    assert dmy("2026-01-31") == "31-01-2026", dmy("2026-01-31")
    assert dmy("basura") == "basura", "una fecha ilegible se deja como está"

    _demo_base_publica()

    # El nombre del trabajador viaja escapado: entra al HTML del correo.
    html_correo = cuerpo('<script>alert(1)</script>', '1-9', ['2026-01-01'], 'http://x/y')
    assert "<script>" not in html_correo, html_correo

    _demo_correo_para_word()

    _demo_dry_run()
    print("ok")


def _demo_base_publica() -> None:
    """Sin base no se manda: un correo con un link muerto no sirve de nada."""
    aqui = globals()

    class _Plataforma:
        PUBLIC_URL = "http://personas.cramer.cl/"

    original, aqui["plataforma"] = plataforma, _Plataforma()
    try:
        # Sin override, hereda el PUBLIC_URL de la plataforma (sin la barra final).
        assert base_publica(AsistenciaSettings(_env_file=None)) == "http://personas.cramer.cl"
        # Con override, manda el del módulo.
        assert base_publica(
            AsistenciaSettings(_env_file=None, public_base_url="http://otro:8444/")
        ) == "http://otro:8444"

        _Plataforma.PUBLIC_URL = ""
        try:
            base_publica(AsistenciaSettings(_env_file=None))
            raise AssertionError("sin ninguna base debería cortar")
        except HTTPException as exc:
            assert exc.status_code == 503, exc
    finally:
        aqui["plataforma"] = original


def _demo_correo_para_word() -> None:
    """El correo tiene que sobrevivir al motor de Word, que usa Outlook."""
    correo = cuerpo("Ana Soto", "17.291.849-2", ["2026-08-18", "2026-08-19"], "http://x/tok")

    # Word ignora <style> y las clases: todo estilo va inline.
    assert "<style" not in correo and "class=" not in correo, correo
    # Sin font-family inline, Outlook lo renderiza en Times New Roman.
    assert correo.count(_FUENTE_CORREO) >= 5, correo.count(_FUENTE_CORREO)
    # El layout va en tablas; un <div> con ancho no sobrevive.
    assert "<div" not in correo, correo
    # Word no dibuja el fondo de un <a>: el botón es una celda con bgcolor.
    assert 'bgcolor="#1f6feb"' in correo, correo
    # Y si el botón igual no anda, el enlace tiene que estar a la vista.
    assert correo.count("http://x/tok") == 2, correo

    assert "18-08-2026" in correo and "2026-08-18" not in correo, "fechas en dd-mm-yyyy"
    assert "<strong>2</strong> días" in correo, "plural"
    assert "<strong>1</strong> día " in cuerpo("A", "1", ["2026-08-18"], "http://x"), "singular"


def _demo_dry_run() -> None:
    """En dry-run no sale ningún correo, pero el aviso sí queda creado.

    Si dejara de crearse, el link de la vista previa abriría un formulario que no
    existe, que es justo lo que se quiere revisar.
    """
    import asyncio

    aqui = globals()
    creados: list[str] = []

    def _crear_falso(_db, _obra, rut, *_a, **_k):
        creados.append(rut)
        return f"token-{rut}"

    def _no_enviar(*_a, **_k):
        raise AssertionError("dry-run no debe mandar correo")

    originales = crear, send_email_graph
    aqui["crear"], aqui["send_email_graph"] = _crear_falso, _no_enviar
    try:
        req = NotificarRequest(obra_id="36787", avisos=[
            AvisoIn(rut="1", nombre="Ana", jefatura="a@x.cl", fechas=["2026-01-02", "2026-01-01"]),
        ])
        seca = AsistenciaSettings(dry_run=True, public_base_url="http://local/")
        assert base_publica(seca) == "http://local", "el override manda"
        res = asyncio.run(notificar(req, None, seca))

        assert res.dry_run and res.enviados == 0 and res.fallidos == 0, res
        assert creados == ["1"], creados
        assert len(res.previews) == 1, res.previews
        vista = res.previews[0]
        assert vista.url == "http://local/api/v1/asistencia/notificacion/token-1", vista.url
        assert vista.fechas == ["2026-01-01", "2026-01-02"], vista.fechas
        assert "Ana" in vista.asunto and vista.url in vista.html, vista
        # Las fechas se muestran dd-mm-yyyy, pero viajan en ISO.
        assert "01-01-2026" in vista.html and "2026-01-01" not in vista.html, vista.html
        assert vista.fechas == ["2026-01-01", "2026-01-02"], vista.fechas
    finally:
        aqui["crear"], aqui["send_email_graph"] = originales


if __name__ == "__main__":
    _demo()
