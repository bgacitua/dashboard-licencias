"""Lógica y acceso a datos del módulo. Lo único que se lee fuera del esquema tickets
es rh.employees, para validar el registro contra la nómina."""
import re
import secrets
import unicodedata
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
import pytz
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.core.logging_config import logger

from .auth import HASH_SEÑUELO, pwd
from .config import settings
from .logica import (
    calcular_costo, calcular_plazo, editable, id_de_servicio, mime_de_imagen,
    plazo_efectivo, servicios_respondidos,
)
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
    db.add(TkVersion(
        ticket_id=ticket.id, version=1, fecha_servicio=fecha, datos=datos, ip=ip,
        costo=costo_de(db, tipo, datos),
    ))
    db.commit()
    return ticket.id


def _aviso_de(db: Session, ticket: TkTicket, extra: dict) -> dict:
    """Payload del webhook con la misma forma que el de cambio de estado.

    Se arma con la sesión abierta porque la tarea en segundo plano corre con
    ella ya cerrada.
    """
    u = db.get(TkUsuario, ticket.usuario_id)
    tipo = db.get(TkTipo, ticket.tipo_id)
    return {
        "para": [u.email],
        "usuario": {"nombre": u.nombre, "rut": u.rut, "email": u.email},
        "ticket": {
            "id": ticket.id, "tipo": tipo.nombre if tipo else "Solicitud",
            "fecha_servicio": ticket.fecha_servicio.isoformat(), "estado": ticket.estado,
            **extra,
        },
    }


def propuesta_pendiente(db: Session, ticket_id: int) -> TkVersion | None:
    """La propuesta esperando respuesta, si la hay. Solo puede haber una."""
    return (
        db.query(TkVersion)
        .filter(TkVersion.ticket_id == ticket_id, TkVersion.estado == "propuesta")
        .first()
    )


def proponer_cambio(
    db: Session, usuario: TkUsuario, ticket_id: int, fecha: date, datos: dict, version: int, ip: str
) -> int:
    """Guarda un cambio del usuario como propuesta. No rige: el ticket sigue en
    su versión vigente hasta que el administrador la apruebe."""
    ticket = db.get(TkTicket, ticket_id)
    if not ticket or ticket.usuario_id != usuario.id:
        raise HTTPException(404, "Ticket no encontrado.")
    if propuesta_pendiente(db, ticket_id):
        raise HTTPException(409, "Ya enviaste un cambio que está esperando respuesta.")
    if not editable(ticket.estado, ticket.plazo, ahora(), emergencia=ticket.plazo_emergencia):
        raise HTTPException(409, "El plazo para pedir cambios ya venció.")
    if ticket.version_actual != version:
        raise HTTPException(409, "El ticket cambió desde que lo abriste. Recarga la página y vuelve a intentarlo.")

    tipo = db.get(TkTipo, ticket.tipo_id)
    # Con una emergencia abierta no se revalida la fecha contra la regla del
    # tipo: el administrador ya autorizó salirse de ella para este ticket.
    if not ticket.plazo_emergencia or ahora() >= ticket.plazo_emergencia:
        _validar_plazo(tipo, fecha)

    siguiente = (db.execute(
        text("SELECT COALESCE(MAX(version), 0) FROM tickets.versiones WHERE ticket_id = :id"),
        {"id": ticket_id},
    ).scalar() or 0) + 1
    db.add(TkVersion(
        ticket_id=ticket_id, version=siguiente, fecha_servicio=fecha, datos=datos, ip=ip,
        costo=costo_de(db, tipo, datos), estado="propuesta",
    ))
    try:
        db.commit()
    except IntegrityError:
        # El índice parcial es el que manda si llegan dos propuestas a la vez.
        db.rollback()
        raise HTTPException(409, "Ya enviaste un cambio que está esperando respuesta.")
    return siguiente


def resolver_propuesta(db: Session, ticket_id: int, aprobar: bool, autor: str) -> dict:
    """Aprueba o rechaza la propuesta pendiente.

    Aprobar la hace vigente y con ella pasan la fecha del servicio y el costo
    que traía. Rechazar la deja registrada: queda en el historial, pero nunca
    rigió, así que el costo del ticket no se mueve.
    """
    propuesta = propuesta_pendiente(db, ticket_id)
    if not propuesta:
        raise HTTPException(404, "Este ticket no tiene cambios esperando respuesta.")
    ticket = db.get(TkTicket, ticket_id)

    propuesta.estado = "vigente" if aprobar else "rechazada"
    propuesta.resuelta_por = autor
    propuesta.resuelta_at = ahora()
    if aprobar:
        ticket.version_actual = propuesta.version
        ticket.fecha_servicio = propuesta.fecha_servicio
        ticket.plazo = _plazo(db.get(TkTipo, ticket.tipo_id), propuesta.fecha_servicio)
        ticket.updated_at = ahora()
    db.commit()

    comentar(
        db, ticket_id,
        f"Cambio {'aprobado' if aprobar else 'rechazado'} (versión {propuesta.version}).",
        autor, es_admin=True,
    )
    return _aviso_de(db, ticket, {"version": propuesta.version, "aprobado": aprobar})


_SELECT_TICKETS = """
    SELECT t.id, t.tipo_id, tp.nombre AS tipo, t.estado, t.fecha_servicio, t.plazo,
           t.version_actual, t.version_vista_admin, t.created_at, t.updated_at,
           t.plazo_emergencia,
           EXISTS (SELECT 1 FROM tickets.versiones v
                    WHERE v.ticket_id = t.id AND v.estado = 'propuesta') AS con_propuesta,
           u.nombre AS usuario, u.email
    FROM tickets.tickets t
    JOIN tickets.tipos tp ON tp.id = t.tipo_id
    JOIN tickets.usuarios u ON u.id = t.usuario_id
"""

# Las respuestas de la versión vigente, para la vista de tabla del panel. Va
# aparte porque el listado normal no las necesita y son el campo más pesado.
_JOIN_DATOS = """
    LEFT JOIN LATERAL (
        -- La que rige, no la última: una propuesta pendiente lleva un número
        -- mayor y no cuenta hasta que el administrador la apruebe.
        SELECT v.datos, v.costo FROM tickets.versiones v
         WHERE v.ticket_id = t.id AND v.version = t.version_actual
    ) vd ON TRUE
"""


def _resumen(row: dict, admin: bool) -> dict:
    r = dict(row)
    # El portal no ve respuestas ajenas ni, sobre todo, lo que cuestan.
    if not admin:
        r.pop("datos", None)
        r.pop("costo", None)
    r["editable"] = editable(
        r["estado"], r["plazo"], ahora(),
        emergencia=r.get("plazo_emergencia"),
        propuesta_pendiente=bool(r.get("con_propuesta")),
    )
    # Hasta cuándo se puede pedir un cambio de verdad, contando la emergencia.
    # Es lo que hay que mostrarle al usuario, no el plazo de la regla.
    r["plazo_efectivo"] = plazo_efectivo(r["plazo"], r.get("plazo_emergencia"))
    vista = r.pop("version_vista_admin")
    # Lo que el admin tiene que resolver es la propuesta, no una versión ya
    # aplicada: con el flujo de aprobación 'modificado' pasa a significar eso.
    r["modificado"] = admin and bool(r.get("con_propuesta"))
    if not admin:
        r.pop("plazo_emergencia", None)
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
        seleccion = seleccion.replace("SELECT t.id,", "SELECT vd.datos, vd.costo, t.id,") + _JOIN_DATOS
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
    vigente = next((v for v in versiones if v.version == r["version_actual"]), versiones[0])
    r["datos"] = vigente.datos
    r["costo"] = vigente.costo if admin else None
    pendiente = next((v for v in versiones if v.estado == "propuesta"), None)
    # El usuario ve que su cambio está esperando; el admin, qué tiene que resolver.
    r["propuesta"] = pendiente
    # El usuario ve la vigente; el historial de versiones es para el panel.
    r["versiones"] = versiones if admin else []
    eventos = db.query(TkEvento).filter(TkEvento.ticket_id == ticket_id).order_by(TkEvento.created_at).all()
    # El usuario del portal no ve el username de la plataforma de quien lo atendió.
    r["eventos"] = eventos if admin else [
        {**{c: getattr(e, c) for c in ("es_admin", "estado_nuevo", "texto", "created_at")},
         "autor": "Administración" if e.es_admin else e.autor}
        for e in eventos
    ]
    # Ya no se marca "visto" al abrir: el aviso al admin lo da la propuesta
    # pendiente y se apaga al resolverla, no al mirarla.
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

    # Cierra el vigente la víspera del nuevo.
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
    # Si ya había un alza programada más adelante, el precio nuevo rige solo
    # hasta su víspera. Dejarlo abierto lo haría pisar a ese tramo futuro y el
    # alta se rechazaría entera: no se podría corregir el precio vigente sin
    # antes borrar el alza, y el panel no borra precios.
    siguiente = db.execute(
        text("""
            SELECT MIN(desde) FROM tickets.servicio_precios
             WHERE servicio_id = :sid AND desde > CAST(:desde AS DATE)
        """),
        {"sid": servicio_id, "desde": desde},
    ).scalar()
    db.add(TkServicioPrecio(
        servicio_id=servicio_id, valor=valor, desde=desde, creado_por=autor,
        hasta=siguiente - timedelta(days=1) if siguiente else None,
    ))
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


def costo_de(db: Session, tipo: TkTipo | None, datos: dict, cuando: date | None = None) -> dict | None:
    """Congela el costo de una respuesta con las tarifas vigentes a `cuando`.

    Se llama al guardar cada versión y lo que devuelve queda escrito ahí. No
    hay recálculo en ningún otro lado: el reporte lee lo guardado, así cambiar
    un precio nunca mueve un ticket ya ingresado.

    `cuando` por defecto es hoy, que es cuando se está guardando la versión.
    Una edición se cotiza al día de la edición, no al del ticket original: es
    lo que corresponde si el usuario agrega servicios después.
    """
    ids = servicios_respondidos(datos)
    if not ids or tipo is None:
        return None
    filas = db.execute(
        text("""
            SELECT s.id, s.nombre, s.modo, p.valor
              FROM tickets.servicios s
              LEFT JOIN tickets.servicio_precios p
                     ON p.servicio_id = s.id
                    AND p.desde <= :cuando
                    AND (p.hasta IS NULL OR p.hasta >= :cuando)
             WHERE s.id = ANY(:ids)
        """),
        {"ids": ids, "cuando": cuando or ahora().date()},
    ).mappings().all()
    tarifas = {
        f["id"]: {
            "nombre": f["nombre"],
            "modo": f["modo"],
            # A pesos: los precios acá son CLP y un Decimal no va a JSONB.
            "valor": int(f["valor"]) if f["valor"] is not None else None,
        }
        for f in filas
    }
    return calcular_costo(datos, tarifas, tipo.pregunta_cantidad)


def abrir_plazo_emergencia(db: Session, ticket_id: int, hasta: datetime, motivo: str, autor: str) -> dict:
    """Permite pedir cambios en un ticket puntual más allá de la regla del tipo.

    No toca el plazo del tipo ni el de los demás tickets. Queda en el hilo quién
    lo abrió y por qué, que es donde el usuario ve la historia.
    """
    ticket = db.get(TkTicket, ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket no encontrado.")
    if ticket.estado != "pendiente":
        raise HTTPException(409, "Solo se puede abrir plazo en una solicitud pendiente.")
    if hasta <= ahora():
        raise HTTPException(400, "El plazo de emergencia tiene que ser a futuro.")

    ticket.plazo_emergencia = hasta
    ticket.plazo_emergencia_por = autor
    db.commit()

    local = hasta.astimezone(pytz.timezone(settings.zona)).strftime("%d-%m-%Y a las %H:%M")
    comentar(db, ticket_id, f"Plazo de emergencia habilitado hasta el {local}. {motivo}".strip(), autor, es_admin=True)
    return _aviso_de(db, ticket, {"plazo_emergencia": hasta.isoformat()})
