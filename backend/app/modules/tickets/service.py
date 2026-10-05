"""Lógica y acceso a datos del módulo. Lo único que se lee fuera del esquema tickets
es rh.employees, para validar el registro contra la nómina."""
import re
import secrets
import unicodedata
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.core.logging_config import logger

from .auth import HASH_SEÑUELO, pwd
from .config import settings
from .logica import calcular_plazo, editable, id_de_servicio, mime_de_imagen
from .models import (
    TkArchivo, TkEvento, TkServicio, TkServicioPrecio, TkTicket, TkTipo, TkUsuario, TkVersion,
)

# Mismo texto pase lo que pase: no confirma desde internet quién trabaja acá
# ni qué correos ya tienen cuenta.
MSG_REGISTRO = (
    "Listo. Si tu correo está en la nómina, un administrador activará tu cuenta "
    "y podrás ingresar con la contraseña que elegiste."
)
MSG_LOGIN = "Correo o contraseña incorrectos."


def ahora() -> datetime:
    return datetime.now(timezone.utc)


# === Cuentas ===

def _persona_por_email(db: Session, email: str) -> dict | None:
    row = db.execute(
        text("""
            SELECT rut, full_name FROM rh.employees
            WHERE lower(trim(email)) = :e AND status = 'activo'
            ORDER BY id DESC LIMIT 1
        """),
        {"e": email},
    ).mappings().first()
    return dict(row) if row else None


def notificar(
    evento: str, para: list[str], usuario: dict, link: str,
    motivo: str | None = None, ticket: dict | None = None,
) -> None:
    """POST al webhook de n8n, que arma y manda el correo desde su casilla.

    Corre como BackgroundTask: si n8n no responde, la cuenta ya quedó
    registrada o aprobada igual y solo se pierde el aviso (queda en el log).
    """
    if not settings.n8n_webhook_url or not para:
        return
    if not settings.n8n_token:
        logger.warning("[Tickets] TICKETS_N8N_TOKEN sin configurar: el webhook se llama sin autenticación")
    try:
        import httpx

        resp = httpx.post(
            settings.n8n_webhook_url,
            json={"evento": evento, "para": para, "usuario": usuario, "link": link,
                  "motivo": motivo, "ticket": ticket},
            headers={"Authorization": f"Bearer {settings.n8n_token}"} if settings.n8n_token else None,
            verify=app_settings.ALERTS_N8N_CA_BUNDLE or True,
            timeout=10,
        )
        if resp.status_code >= 400:
            logger.warning(f"[Tickets] n8n respondió {resp.status_code} al evento {evento}")
    except Exception as e:
        logger.warning(f"[Tickets] No se pudo notificar {evento} a n8n: {e}")


def url_portal(ruta: str) -> str:
    return f"{app_settings.PUBLIC_URL.rstrip('/')}{ruta}"


def registrar(db: Session, email: str, password: str) -> dict | None:
    """Crea la cuenta pendiente. Devuelve sus datos solo si la cuenta es nueva,
    para avisar al admin; el endpoint responde MSG_REGISTRO en todos los casos."""
    email = email.strip().lower()
    # El hash se calcula siempre, antes de decidir nada: si solo se calculara
    # al crear la cuenta, el tiempo de respuesta diría si el correo existe.
    hashed = pwd.hash(password)
    if not settings.dominio_permitido(email):
        raise HTTPException(400, "Usa tu correo de la empresa.")

    existente = db.query(TkUsuario).filter(TkUsuario.email == email).first()
    if existente:
        # Única forma de ponerle clave a una cuenta que ya existe: que el admin
        # la haya reseteado y la ventana siga abierta. El estado no se toca: si
        # estaba activa, vuelve activa, porque el admin ya la aprobó.
        if existente.password_hash is None and existente.reset_hasta and existente.reset_hasta > ahora():
            existente.password_hash = hashed
            existente.reset_hasta = None
            db.commit()
        return None

    persona = _persona_por_email(db, email)
    if not persona:
        return None
    db.add(TkUsuario(
        email=email, nombre=persona["full_name"], rut=persona["rut"],
        password_hash=hashed, estado="pendiente",
    ))
    try:
        db.commit()
    except IntegrityError:  # dos registros simultáneos del mismo correo
        db.rollback()
        return None
    return {"nombre": persona["full_name"], "rut": persona["rut"], "email": email}


def login(db: Session, email: str, password: str) -> TkUsuario:
    email = email.strip().lower()
    usuario = db.query(TkUsuario).filter(TkUsuario.email == email).first()
    ok = pwd.verify(password, usuario.password_hash if usuario and usuario.password_hash else HASH_SEÑUELO)
    if not usuario or not usuario.password_hash or not ok:
        raise HTTPException(401, MSG_LOGIN)
    # Recién acá se distingue el estado: quien llegó hasta aquí sabe la clave.
    if usuario.estado == "pendiente":
        raise HTTPException(403, "Tu cuenta está esperando la activación de un administrador.")
    if usuario.estado == "rechazado":
        raise HTTPException(403, "Tu solicitud de acceso no fue aprobada. Habla con el administrador.")
    if usuario.estado != "activo":
        raise HTTPException(403, "Tu cuenta está desactivada. Habla con el administrador.")
    usuario.last_login_at = ahora()
    db.commit()
    return usuario


def cambiar_clave(db: Session, usuario: TkUsuario, actual: str, nueva: str) -> None:
    if not pwd.verify(actual, usuario.password_hash):
        raise HTTPException(400, "La contraseña actual no es correcta.")
    usuario.password_hash = pwd.hash(nueva)
    db.commit()


def resetear_clave(db: Session, usuario: TkUsuario) -> None:
    usuario.password_hash = None
    usuario.reset_hasta = ahora() + timedelta(hours=settings.reset_horas)
    db.commit()


# === Tipos ===

def slug_libre(db: Session, nombre: str) -> str:
    """Código interno del tipo, derivado del nombre. No se muestra ni se edita:
    la columna es única y NOT NULL, y queda legible por si algún día se usa en
    una URL. Con nombres repetidos agrega -2, -3..."""
    base = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode().lower()
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")[:70] or "tipo"
    slug, n = base, 2
    while db.query(TkTipo.id).filter(TkTipo.slug == slug).first():
        slug, n = f"{base}-{n}", n + 1
    return slug


# === Tickets ===

def _plazo(tipo: TkTipo, fecha: date) -> datetime:
    return calcular_plazo(fecha, tipo.dias_anticipacion, tipo.hora_limite, settings.zona)


def _validar_plazo(tipo: TkTipo, fecha: date) -> datetime:
    plazo = _plazo(tipo, fecha)
    if ahora() >= plazo:
        local = plazo.strftime("%d-%m-%Y a las %H:%M")
        raise HTTPException(400, f"Para esa fecha, {tipo.nombre.lower()} se podía pedir hasta el {local}.")
    return plazo


def crear_ticket(db: Session, usuario: TkUsuario, tipo_id: int, fecha: date, datos: dict, ip: str) -> int:
    tipo = db.get(TkTipo, tipo_id)
    if not tipo or not tipo.activo:
        raise HTTPException(404, "Ese tipo de solicitud no está disponible.")
    plazo = _validar_plazo(tipo, fecha)
    ticket = TkTicket(
        tipo_id=tipo.id, usuario_id=usuario.id, fecha_servicio=fecha, plazo=plazo,
        version_actual=1,
    )
    db.add(ticket)
    db.flush()
    db.add(TkVersion(ticket_id=ticket.id, version=1, fecha_servicio=fecha, datos=datos, ip=ip))
    db.commit()
    return ticket.id


def editar_ticket(
    db: Session, usuario: TkUsuario, ticket_id: int, fecha: date, datos: dict, version: int, ip: str
) -> int:
    ticket = db.get(TkTicket, ticket_id)
    if not ticket or ticket.usuario_id != usuario.id:
        raise HTTPException(404, "Ticket no encontrado.")
    if not editable(ticket.estado, ticket.plazo, ahora()):
        raise HTTPException(409, "Este ticket ya no se puede editar.")
    if ticket.version_actual != version:
        raise HTTPException(409, "El ticket cambió desde que lo abriste. Recarga la página y vuelve a intentarlo.")
    plazo = _validar_plazo(db.get(TkTipo, ticket.tipo_id), fecha)

    # Los chequeos de arriba dan el mensaje; este UPDATE condicional es el que
    # manda si el admin lo pasa a "en curso" o vence el plazo en el mismo
    # instante, o si llegan dos ediciones a la vez.
    nueva = db.execute(
        text("""
            UPDATE tickets.tickets
               SET version_actual = version_actual + 1, fecha_servicio = :f,
                   plazo = :p, updated_at = NOW()
             WHERE id = :id AND usuario_id = :u AND estado = 'pendiente'
               AND plazo > NOW() AND version_actual = :v
         RETURNING version_actual
        """),
        {"f": fecha, "p": plazo, "id": ticket_id, "u": usuario.id, "v": version},
    ).scalar()
    if nueva is None:
        db.rollback()
        raise HTTPException(409, "Este ticket ya no se puede editar.")
    db.add(TkVersion(ticket_id=ticket_id, version=nueva, fecha_servicio=fecha, datos=datos, ip=ip))
    db.commit()
    return nueva


_SELECT_TICKETS = """
    SELECT t.id, t.tipo_id, tp.nombre AS tipo, t.estado, t.fecha_servicio, t.plazo,
           t.version_actual, t.version_vista_admin, t.created_at, t.updated_at,
           u.nombre AS usuario, u.email
    FROM tickets.tickets t
    JOIN tickets.tipos tp ON tp.id = t.tipo_id
    JOIN tickets.usuarios u ON u.id = t.usuario_id
"""

# Las respuestas de la versión vigente, para la vista de tabla del panel. Va
# aparte porque el listado normal no las necesita y son el campo más pesado.
_JOIN_DATOS = """
    LEFT JOIN LATERAL (
        SELECT v.datos FROM tickets.versiones v
         WHERE v.ticket_id = t.id ORDER BY v.version DESC LIMIT 1
    ) vd ON TRUE
"""


def _resumen(row: dict, admin: bool) -> dict:
    r = dict(row)
    if "datos" in r and not admin:
        r.pop("datos")
    r["editable"] = editable(r["estado"], r["plazo"], ahora())
    vista = r.pop("version_vista_admin")
    r["modificado"] = admin and r["version_actual"] > vista
    if not admin:
        r["usuario"] = r["email"] = None
    return r


def listar_tickets(
    db: Session, *, usuario_id: int | None = None, estado: str | None = None,
    tipo_id: int | None = None, q: str = "", limit: int = 500,
    incluir_datos: bool = False, desde: date | None = None, hasta: date | None = None,
) -> list[dict]:
    seleccion = _SELECT_TICKETS
    if incluir_datos:
        seleccion = seleccion.replace("SELECT t.id,", "SELECT vd.datos, t.id,") + _JOIN_DATOS
    rows = db.execute(
        text(seleccion + """
            WHERE (CAST(:u AS INT) IS NULL OR t.usuario_id = :u)
              AND (CAST(:e AS TEXT) IS NULL OR t.estado = :e)
              AND (CAST(:tp AS INT) IS NULL OR t.tipo_id = :tp)
              -- El rango va sobre cuándo se envió la solicitud, que es lo que
              -- se cuenta al preguntar "cuántos servicios hubo en el período".
              -- 'hasta' incluye su propio día: el usuario elige fechas, no horas.
              AND (CAST(:desde AS DATE) IS NULL OR t.created_at >= CAST(:desde AS DATE))
              AND (CAST(:hasta AS DATE) IS NULL OR t.created_at < CAST(:hasta AS DATE) + 1)
              AND (:q = '' OR CAST(t.id AS TEXT) = :q
                   OR lower(u.nombre) LIKE :patron OR u.email LIKE :patron)
            ORDER BY t.updated_at DESC
            LIMIT :limit
        """),
        {"u": usuario_id, "e": estado, "tp": tipo_id, "q": q.strip(),
         "patron": f"%{q.strip().lower()}%", "limit": limit,
         "desde": desde, "hasta": hasta},
    ).mappings().all()
    return [_resumen(r, admin=usuario_id is None) for r in rows]


def detalle_ticket(db: Session, ticket_id: int, *, usuario_id: int | None = None) -> dict:
    row = db.execute(text(_SELECT_TICKETS + " WHERE t.id = :id"), {"id": ticket_id}).mappings().first()
    if not row:
        raise HTTPException(404, "Ticket no encontrado.")
    admin = usuario_id is None
    if not admin and db.get(TkTicket, ticket_id).usuario_id != usuario_id:
        raise HTTPException(404, "Ticket no encontrado.")
    r = _resumen(row, admin)
    versiones = (
        db.query(TkVersion).filter(TkVersion.ticket_id == ticket_id)
        .order_by(TkVersion.version.desc()).all()
    )
    r["datos"] = versiones[0].datos
    # El usuario ve la vigente; el historial de versiones es para el panel.
    r["versiones"] = versiones if admin else []
    eventos = db.query(TkEvento).filter(TkEvento.ticket_id == ticket_id).order_by(TkEvento.created_at).all()
    # El usuario del portal no ve el username de la plataforma de quien lo atendió.
    r["eventos"] = eventos if admin else [
        {**{c: getattr(e, c) for c in ("es_admin", "estado_nuevo", "texto", "created_at")},
         "autor": "Administración" if e.es_admin else e.autor}
        for e in eventos
    ]
    if admin and r["modificado"]:
        db.execute(
            text("UPDATE tickets.tickets SET version_vista_admin = version_actual WHERE id = :id"),
            {"id": ticket_id},
        )
        db.commit()
    return r


def cambiar_estado(db: Session, ticket_id: int, estado: str, comentario: str | None, autor: str) -> dict | None:
    """Cambia el estado y devuelve los datos del aviso al usuario, o None si no
    corresponde avisar (devolverlo a pendiente es una corrección del admin)."""
    ticket = db.get(TkTicket, ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket no encontrado.")
    if ticket.estado == estado:
        raise HTTPException(400, "El ticket ya está en ese estado.")
    comentario = (comentario or "").strip() or None
    ticket.estado = estado
    db.add(TkEvento(ticket_id=ticket_id, autor=autor, es_admin=True, estado_nuevo=estado, texto=comentario))
    db.commit()
    if estado == "pendiente":
        return None
    # Se arma acá y no en la tarea: la tarea corre con la sesión ya cerrada.
    u = db.get(TkUsuario, ticket.usuario_id)
    tipo = db.get(TkTipo, ticket.tipo_id)
    return {
        "para": [u.email],
        "usuario": {"nombre": u.nombre, "rut": u.rut, "email": u.email},
        "ticket": {
            "id": ticket.id, "tipo": tipo.nombre if tipo else "Solicitud",
            "fecha_servicio": ticket.fecha_servicio.isoformat(), "estado": estado, "comentario": comentario,
        },
    }


def comentar(db: Session, ticket_id: int, texto: str, autor: str, es_admin: bool) -> None:
    db.add(TkEvento(ticket_id=ticket_id, autor=autor, es_admin=es_admin, texto=texto.strip()))
    db.commit()


# === Archivos ===

def guardar_imagen(db: Session, nombre: str | None, datos: bytes, autor: str) -> TkArchivo:
    tope = settings.archivo_max_mb * 1024 * 1024
    if len(datos) > tope:
        raise HTTPException(413, f"La imagen supera los {settings.archivo_max_mb} MB.")
    mime = mime_de_imagen(datos)
    if not mime:
        raise HTTPException(400, "Solo se aceptan imágenes PNG, JPG, GIF o WebP.")
    archivo = TkArchivo(
        id=secrets.token_hex(16), nombre=(nombre or "")[:200], mime=mime,
        bytes=len(datos), datos=datos, subido_por=autor,
    )
    db.add(archivo)
    db.commit()
    return archivo


# === Catálogo de servicios ===

_SELECT_SERVICIOS = """
    SELECT s.id, s.nombre, s.descripcion, s.modo, s.activo,
           (SELECT p.valor FROM tickets.servicio_precios p
             WHERE p.servicio_id = s.id
               AND p.desde <= CURRENT_DATE
               AND (p.hasta IS NULL OR p.hasta >= CURRENT_DATE)
             LIMIT 1) AS valor_vigente
    FROM tickets.servicios s
"""


def listar_servicios(db: Session, *, incluir_inactivos: bool = False) -> list[dict]:
    rows = db.execute(
        text(_SELECT_SERVICIOS + """
            WHERE (:todos OR s.activo)
            ORDER BY s.activo DESC, lower(s.nombre)
        """),
        {"todos": incluir_inactivos},
    ).mappings().all()
    return [dict(r) for r in rows]


def detalle_servicio(db: Session, servicio_id: int) -> dict:
    row = db.execute(
        text(_SELECT_SERVICIOS + " WHERE s.id = :id"), {"id": servicio_id}
    ).mappings().first()
    if not row:
        raise HTTPException(404, "Servicio no encontrado.")
    r = dict(row)
    r["precios"] = (
        db.query(TkServicioPrecio)
        .filter(TkServicioPrecio.servicio_id == servicio_id)
        .order_by(TkServicioPrecio.desde.desc())
        .all()
    )
    return r


def crear_servicio(db: Session, datos: dict, autor: str) -> dict:
    valor, desde = datos.pop("valor", None), datos.pop("desde", None)
    servicio = TkServicio(**datos)
    db.add(servicio)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ya existe un servicio activo con ese nombre.")
    if valor is not None:
        db.add(TkServicioPrecio(
            servicio_id=servicio.id, valor=valor, desde=desde or ahora().date(),
            creado_por=autor,
        ))
    db.commit()
    return detalle_servicio(db, servicio.id)


def actualizar_servicio(db: Session, servicio_id: int, cambios: dict) -> dict:
    servicio = db.get(TkServicio, servicio_id)
    if not servicio:
        raise HTTPException(404, "Servicio no encontrado.")
    for campo, valor in cambios.items():
        setattr(servicio, campo, valor)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ya existe un servicio activo con ese nombre.")
    return detalle_servicio(db, servicio_id)


def fijar_precio(db: Session, servicio_id: int, valor, desde: date, autor: str) -> dict:
    """Pone un precio a partir de `desde` y cierra el que estuviera vigente.

    No se edita el precio anterior: un ticket de septiembre tiene que seguir
    costando lo de septiembre. Corregir un precio mal cargado es trabajo de
    base de datos a propósito, no algo que el panel permita.
    """
    if not db.get(TkServicio, servicio_id):
        raise HTTPException(404, "Servicio no encontrado.")

    # Cierra el vigente la víspera del nuevo. Si ya hubiera uno que arranca en
    # esa misma fecha o después, el EXCLUDE de la tabla rechaza el alta.
    db.execute(
        text("""
            UPDATE tickets.servicio_precios
               SET hasta = CAST(:desde AS DATE) - 1
             WHERE servicio_id = :sid
               AND desde < CAST(:desde AS DATE)
               AND (hasta IS NULL OR hasta >= CAST(:desde AS DATE))
        """),
        {"sid": servicio_id, "desde": desde},
    )
    db.add(TkServicioPrecio(servicio_id=servicio_id, valor=valor, desde=desde, creado_por=autor))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ya hay un precio cargado para esa fecha o posterior.")
    return detalle_servicio(db, servicio_id)


def _opciones_refrescadas(elementos: list, nombres: dict[int, str]) -> bool:
    """Pone el nombre de hoy en las opciones del catálogo. Devuelve si cambió algo."""
    tocado = False
    for e in elementos or []:
        if e.get("elements"):
            tocado |= _opciones_refrescadas(e["elements"], nombres)
        for i, opcion in enumerate(e.get("choices") or []):
            if not isinstance(opcion, dict):
                continue
            sid = id_de_servicio(opcion.get("value"))
            # Un servicio borrado del catálogo conserva su último texto: mejor
            # eso que dejar la opción en blanco en un formulario en uso.
            if sid is None or sid not in nombres or opcion.get("text") == nombres[sid]:
                continue
            e["choices"][i] = {**opcion, "text": nombres[sid]}
            tocado = True
    return tocado


def con_servicios_al_dia(db: Session, tipos: list[TkTipo]) -> list[dict]:
    """Los tipos con el texto de sus opciones de catálogo puesto al día.

    El vínculo con el servicio es el id ('srv:<n>'), así que el texto guardado
    en la definición es solo una copia para mostrar. Refrescarlo acá hace que
    renombrar un servicio se propague solo a todos los formularios que lo usan.

    Devuelve dicts y no los modelos: mutar la definición del ORM podría
    terminar escrita en la base por un flush posterior.
    """
    nombres = dict(db.execute(text("SELECT id, nombre FROM tickets.servicios")).all())
    salida = []
    for tipo in tipos:
        fila = {c.name: getattr(tipo, c.name) for c in tipo.__table__.columns}
        definicion = deepcopy(fila.get("definicion") or {})
        if _opciones_refrescadas(definicion.get("pages") or [], nombres):
            fila["definicion"] = definicion
        salida.append(fila)
    return salida
