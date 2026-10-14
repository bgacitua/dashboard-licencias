"""Lógica y acceso a datos del módulo. Lo único que se lee fuera del esquema tickets
es rh.employees, para validar el registro contra la nómina."""
import re
import secrets
import unicodedata
from copy import deepcopy
from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException
import pytz
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.core.logging_config import logger

from . import calendario
from .auth import HASH_SEÑUELO, pwd
from .config import settings
from .logica import (
    ESTADOS_ABIERTOS, ESTADOS_ADMIN, ESTADOS_QUE_OCUPAN, calcular_costo, calcular_plazo,
    cancelable, cancelacion_tardia, editable, huecos_libres, id_de_servicio, mime_de_imagen,
    plazo_efectivo, se_solapan, servicios_respondidos,
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


# === Reservas de sala ===

def ventana_reservas() -> tuple[date, date]:
    """Desde hoy hasta el tope configurado. Es lo que el portal muestra y, por
    lo mismo, lo único que se acepta al guardar: una reserva de la semana
    pasada no es un bloque disponible para pedir un servicio."""
    hoy = ahora().astimezone(pytz.timezone(settings.zona)).date()
    return hoy, hoy + timedelta(days=settings.reservas_dias)


def reservas_de(usuario: TkUsuario) -> list[dict]:
    desde, hasta = ventana_reservas()
    # Una reserva que cruza la medianoche no define un bloque de un día: no se
    # ofrece, para no tener que decidir después a qué día pertenece el servicio.
    return [r for r in calendario.reservas(usuario.email, desde, hasta) if not r["multidia"]]


def _reserva_validada(usuario: TkUsuario, reserva_id: str) -> dict:
    """Relee la reserva en Graph al guardar. La fecha y el horario salen de acá
    y no del navegador: el cliente solo manda el id."""
    desde, hasta = ventana_reservas()
    reserva = calendario.buscar_reserva(usuario.email, reserva_id, desde, hasta)
    if not reserva or reserva["multidia"]:
        raise HTTPException(400, "Esa reserva de sala ya no está en tu calendario. Recarga y elige otra.")
    return reserva


def _campos_de_reserva(reserva: dict, inicio: time, fin: time) -> dict:
    """Lo que se escribe en el ticket y en la versión: el bloque reservado y,
    dentro de él, el tramo pedido. El tramo se valida acá y no solo en el
    navegador, porque el bloque lo pone Graph y el tramo lo pone el usuario."""
    if inicio >= fin:
        raise HTTPException(400, "La hora de término tiene que ser posterior a la de inicio.")
    if inicio < reserva["hora_inicio"] or fin > reserva["hora_fin"]:
        bloque = f'{reserva["hora_inicio"]:%H:%M} y {reserva["hora_fin"]:%H:%M}'
        raise HTTPException(400, f"El horario del servicio tiene que estar entre {bloque}, que es tu reserva.")
    return {
        "fecha_servicio": reserva["fecha"],
        "hora_inicio": reserva["hora_inicio"],
        "hora_fin": reserva["hora_fin"],
        "servicio_inicio": inicio,
        "servicio_fin": fin,
        "reserva_id": reserva["id"],
        "reserva_asunto": reserva["asunto"],
        "reserva_sala": reserva["sala"],
    }


def reservas_con_disponibilidad(db: Session, usuario: TkUsuario) -> list[dict]:
    """Las reservas del usuario, cada una con lo que ya pidió y lo que le queda.

    Va pegado a `/reservas` y no en un endpoint aparte: el portal ya pide esta
    lista para armar la grilla, y separarlo obligaba a un segundo viaje para
    pintar la misma tarjeta. `libres` es lo que el formulario ofrece; `ocupados`
    es para poder decir por qué el resto no está.
    """
    reservas = reservas_de(usuario)
    salidas = []
    for r in reservas:
        campos = {
            "fecha_servicio": r["fecha"], "reserva_id": r["id"], "reserva_sala": r["sala"],
        }
        ocupados = _tramos_ocupados(db, usuario.id, campos)
        # Los tramos de otras salas del mismo día no cuentan: la consulta ya
        # filtra por sala, así que acá solo queda recortar contra este bloque.
        dentro = [t for t in ocupados if se_solapan(r["hora_inicio"], r["hora_fin"], *t)]
        salidas.append({
            **r,
            "ocupados": [{"inicio": a, "fin": b} for a, b in sorted(dentro)],
            "libres": [
                {"inicio": a, "fin": b}
                for a, b in huecos_libres(r["hora_inicio"], r["hora_fin"], dentro)
            ],
        })
    return salidas


def _tramos_ocupados(
    db: Session, usuario_id: int, campos: dict, *, excluir_ticket: int | None = None,
) -> list[tuple[time, time]]:
    """Lo que el usuario ya pidió ese día en esa sala, como tramos.

    La sala manda sobre la reserva: dos reuniones distintas en la misma sala y
    el mismo día siguen siendo el mismo espacio físico, y el servicio se sirve
    ahí. Si el ticket es viejo y no guardó sala, se cae al id de la reserva.

    No se miran las propuestas de cambio sin aprobar: todavía no rigen, y
    bloquear con algo que el admin puede rechazar dejaría el horario tomado por
    nada.
    """
    q = db.query(TkTicket.servicio_inicio, TkTicket.servicio_fin).filter(
        TkTicket.usuario_id == usuario_id,
        TkTicket.fecha_servicio == campos["fecha_servicio"],
        TkTicket.estado.in_(ESTADOS_QUE_OCUPAN),
        TkTicket.servicio_inicio.isnot(None),
        TkTicket.servicio_fin.isnot(None),
    )
    sala = campos.get("reserva_sala")
    q = q.filter(TkTicket.reserva_sala == sala) if sala else q.filter(
        TkTicket.reserva_id == campos["reserva_id"])
    if excluir_ticket:
        q = q.filter(TkTicket.id != excluir_ticket)
    return [(r.servicio_inicio, r.servicio_fin) for r in q.all()]


def _validar_sin_solape(
    db: Session, usuario_id: int, campos: dict, *, excluir_ticket: int | None = None,
) -> None:
    """Un mismo usuario no puede pedir dos servicios encima en la misma sala.

    Es por usuario y no por sala: el que reservó es quien recibe el servicio, y
    dos personas distintas en la misma sala son dos pedidos legítimos.
    """
    inicio, fin = campos["servicio_inicio"], campos["servicio_fin"]
    ocupados = _tramos_ocupados(db, usuario_id, campos, excluir_ticket=excluir_ticket)
    choques = [t for t in ocupados if se_solapan(inicio, fin, *t)]
    if not choques:
        return
    tomado = ", ".join(f"{a:%H:%M} a {b:%H:%M}" for a, b in sorted(choques))
    libres = huecos_libres(campos["hora_inicio"], campos["hora_fin"], ocupados)
    queda = (
        " Dentro de esa reserva te queda libre " +
        " y ".join(f"{a:%H:%M} a {b:%H:%M}" for a, b in libres) + "."
        if libres else " Ya no queda horario libre en esa reserva."
    )
    raise HTTPException(
        409,
        f"Ya pediste un servicio de {tomado} ese día en {campos.get('reserva_sala') or 'esa sala'}."
        + queda,
    )


def crear_ticket(
    db: Session, usuario: TkUsuario, tipo_id: int, reserva_id: str,
    inicio: time, fin: time, datos: dict, ip: str,
) -> int:
    tipo = db.get(TkTipo, tipo_id)
    if not tipo or not tipo.activo:
        raise HTTPException(404, "Ese tipo de solicitud no está disponible.")
    reserva = _reserva_validada(usuario, reserva_id)
    campos = _campos_de_reserva(reserva, inicio, fin)
    _validar_sin_solape(db, usuario.id, campos)
    plazo = _validar_plazo(tipo, reserva["fecha"])
    ticket = TkTicket(
        tipo_id=tipo.id, usuario_id=usuario.id, plazo=plazo, version_actual=1, **campos,
    )
    db.add(ticket)
    db.flush()
    db.add(TkVersion(
        ticket_id=ticket.id, version=1, datos=datos, ip=ip,
        costo=costo_de(db, tipo, datos), **campos,
    ))
    db.commit()
    return ticket.id


def _horario_aviso(ticket: TkTicket) -> dict:
    """Bloque y sala para el correo. Los tickets anteriores a la integración no
    lo tienen, y n8n ya trata los campos nulos como ausentes.

    `hora_*` es la reserva completa y `servicio_*` lo que se pidió dentro: el
    correo necesita las dos, porque quien atiende llega al tramo, no a la hora
    en que empieza la reunión.
    """
    def hhmm(t):
        return t.strftime("%H:%M") if t else None

    return {
        "servicio_inicio": hhmm(ticket.servicio_inicio),
        "servicio_fin": hhmm(ticket.servicio_fin),
        "hora_inicio": hhmm(ticket.hora_inicio),
        "hora_fin": hhmm(ticket.hora_fin),
        "sala": ticket.reserva_sala,
        "reserva": ticket.reserva_asunto,
    }


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
            **_horario_aviso(ticket),
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
    db: Session, usuario: TkUsuario, ticket_id: int, reserva_id: str,
    inicio: time, fin: time, datos: dict, version: int, ip: str,
) -> dict:
    """Guarda un cambio del usuario como propuesta. No rige: el ticket sigue en
    su versión vigente hasta que el administrador la apruebe.

    Devuelve el aviso para el admin, con la misma forma que el resto: el correo
    tiene que decir de qué solicitud se trata, no solo su número.
    """
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
    reserva = _reserva_validada(usuario, reserva_id)
    # Con una emergencia abierta no se revalida la fecha contra la regla del
    # tipo: el administrador ya autorizó salirse de ella para este ticket.
    if not ticket.plazo_emergencia or ahora() >= ticket.plazo_emergencia:
        _validar_plazo(tipo, reserva["fecha"])

    campos = _campos_de_reserva(reserva, inicio, fin)
    # El ticket que se está cambiando no se choca consigo mismo: su tramo
    # vigente es justo el que se quiere mover.
    _validar_sin_solape(db, usuario.id, campos, excluir_ticket=ticket_id)

    siguiente = (db.execute(
        text("SELECT COALESCE(MAX(version), 0) FROM tickets.versiones WHERE ticket_id = :id"),
        {"id": ticket_id},
    ).scalar() or 0) + 1
    db.add(TkVersion(
        ticket_id=ticket_id, version=siguiente, datos=datos, ip=ip,
        costo=costo_de(db, tipo, datos), estado="propuesta", **campos,
    ))
    # El estado lo dice ahora el ticket y no solo la versión: quien mira el
    # panel tiene que ver que esta solicitud quedó esperando una respuesta suya
    # sin abrirla. Vuelve a 'en_curso' cuando la resuelve.
    ticket.estado = "en_revision"
    db.add(TkEvento(
        ticket_id=ticket_id, autor=usuario.nombre or usuario.email, es_admin=False,
        estado_nuevo="en_revision", texto=f"Solicitud de modificación enviada (versión {siguiente}).",
    ))
    try:
        db.commit()
    except IntegrityError:
        # El índice parcial es el que manda si llegan dos propuestas a la vez.
        db.rollback()
        raise HTTPException(409, "Ya enviaste un cambio que está esperando respuesta.")
    return _aviso_de(db, ticket, {"version": siguiente, "propuesta_por": usuario.nombre or usuario.email})


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
        # Con la versión pasan también la reserva y su bloque horario: el
        # cambio pudo haber movido el servicio a otra reunión.
        for campo in ("fecha_servicio", "hora_inicio", "hora_fin",
                      "servicio_inicio", "servicio_fin",
                      "reserva_id", "reserva_asunto", "reserva_sala"):
            setattr(ticket, campo, getattr(propuesta, campo))
        ticket.plazo = _plazo(db.get(TkTipo, ticket.tipo_id), propuesta.fecha_servicio)
        ticket.updated_at = ahora()
    # Resuelta la revisión, la solicitud queda en curso: aprobar o rechazar el
    # cambio no la devuelve a la cola de pendientes, porque el administrador ya
    # la tomó. Si entre medio la cancelaron o la cerró el barrido, manda eso.
    if ticket.estado == "en_revision":
        ticket.estado = "en_curso"
    db.commit()

    comentar(
        db, ticket_id,
        f"Cambio {'aprobado' if aprobar else 'rechazado'} (versión {propuesta.version}).",
        autor, es_admin=True,
    )
    return _aviso_de(db, ticket, {"version": propuesta.version, "aprobado": aprobar})


_SELECT_TICKETS = """
    SELECT t.id, t.tipo_id, tp.nombre AS tipo, t.estado, t.fecha_servicio, t.plazo,
           t.hora_inicio, t.hora_fin, t.servicio_inicio, t.servicio_fin,
           t.reserva_id, t.reserva_asunto, t.reserva_sala,
           t.version_actual, t.version_vista_admin, t.created_at, t.updated_at,
           t.plazo_emergencia, t.cancelacion_tardia,
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
    # Cancelar no mira el plazo: solo que la solicitud siga abierta.
    r["cancelable"] = cancelable(r["estado"])
    vista = r.pop("version_vista_admin")
    # Lo que el admin tiene que resolver es la propuesta, no una versión ya
    # aplicada: con el flujo de aprobación 'modificado' pasa a significar eso.
    r["modificado"] = admin and bool(r.get("con_propuesta"))
    if not admin:
        r.pop("plazo_emergencia", None)
        # Que haya una ventana de cobro no se le dice al usuario final: la
        # política de cancelación no es pública, y el dato es del reporte.
        r.pop("cancelacion_tardia", None)
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


def _descartar_propuesta(db: Session, ticket_id: int, autor: str) -> TkVersion | None:
    """Cierra la propuesta pendiente cuando la solicitud deja de estar abierta.

    Una solicitud cancelada, rechazada o cerrada ya no se va a servir: dejar el
    cambio esperando respuesta mostraría al administrador algo que resolver
    sobre algo que no existe. Queda 'rechazada', que es lo que de verdad pasó:
    nunca llegó a regir.
    """
    propuesta = propuesta_pendiente(db, ticket_id)
    if not propuesta:
        return None
    propuesta.estado = "rechazada"
    propuesta.resuelta_por = autor
    propuesta.resuelta_at = ahora()
    return propuesta


def cambiar_estado(db: Session, ticket_id: int, estado: str, comentario: str | None, autor: str) -> dict | None:
    """Cambia el estado y devuelve los datos del aviso al usuario, o None si no
    corresponde avisar (devolverlo a pendiente es una corrección del admin)."""
    ticket = db.get(TkTicket, ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket no encontrado.")
    # 'cancelado' es del usuario final y 'en_revision' la mueve el flujo de
    # cambios. El panel no los ofrece, y acá se vuelve a decir porque el schema
    # solo cubre lo que entra por HTTP.
    if estado not in ESTADOS_ADMIN:
        raise HTTPException(400, "Ese estado no se cambia desde el panel.")
    if ticket.estado == estado:
        raise HTTPException(400, "El ticket ya está en ese estado.")
    if ticket.estado == "cancelado":
        raise HTTPException(409, "El solicitante canceló esta solicitud.")
    comentario = (comentario or "").strip() or None
    if estado in ESTADOS_ABIERTOS and propuesta_pendiente(db, ticket_id):
        # Mientras el cambio espera respuesta, la solicitud está 'en_revision'
        # y tiene que seguir diciéndolo. Moverla a otro estado abierto dejaría
        # el estado mintiendo sobre algo que el admin todavía no resolvió.
        raise HTTPException(409, "Resuelve primero la solicitud de cambio que está esperando respuesta.")
    ticket.estado = estado
    if estado not in ESTADOS_ABIERTOS:
        # Rechazar o cerrar sí se lleva el cambio por delante: la solicitud ya
        # no se va a servir, así que no queda nada que modificar.
        _descartar_propuesta(db, ticket_id, autor)
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
            "fecha_servicio": ticket.fecha_servicio.isoformat(), "estado": estado,
            "comentario": comentario, **_horario_aviso(ticket),
        },
    }


def cancelar_ticket(db: Session, usuario: TkUsuario, ticket_id: int, motivo: str | None) -> dict:
    """El usuario final se baja de su solicitud.

    Sin plazo: cancelar tarde se cobra, pero amarrar a alguien a un servicio
    que ya no necesita no le sirve a nadie, menos al casino que igual lo
    prepararía. Lo que sí queda es la marca `cancelacion_tardia`, que el portal
    no ve —la política no es pública para el usuario final— y que el panel y el
    reporte usan para saber qué se cobra igual.

    Devuelve el aviso para el administrador: una cancelación hay que ir a
    buscarla al panel si nadie la avisa, y de eso depende que no se prepare.
    """
    ticket = db.get(TkTicket, ticket_id)
    if not ticket or ticket.usuario_id != usuario.id:
        raise HTTPException(404, "Ticket no encontrado.")
    if not cancelable(ticket.estado):
        raise HTTPException(409, "Esta solicitud ya terminó: no hay nada que cancelar.")

    tardia = cancelacion_tardia(
        ticket.fecha_servicio, ticket.servicio_inicio, ahora(), settings.zona,
        horas=settings.cancelacion_horas,
    )
    ticket.estado = "cancelado"
    ticket.cancelacion_tardia = tardia
    ticket.updated_at = ahora()
    # Un cambio esperando respuesta se cae con la solicitud: ya no hay qué
    # modificar.
    _descartar_propuesta(db, ticket_id, usuario.nombre or usuario.email)
    motivo = (motivo or "").strip() or None
    db.add(TkEvento(
        ticket_id=ticket_id, autor=usuario.nombre or usuario.email, es_admin=False,
        estado_nuevo="cancelado", texto=motivo,
    ))
    db.commit()
    # `tardia` va en el aviso al administrador, que es quien tiene que saber si
    # esto se cobra igual. El correo al usuario no se manda desde acá: la
    # cancelación la hizo él.
    return _aviso_de(db, ticket, {"motivo": motivo, "cancelacion_tardia": tardia})


def cerrar_vencidos(db: Session, hoy: date | None = None) -> int:
    """Cierra las solicitudes cuyo día de servicio ya pasó. Devuelve cuántas.

    Lo corre el barrido de madrugada (`cierre.py`). Un día después y no el
    mismo día: el servicio se presta hasta el final de su jornada, y cerrarlo
    mientras todavía puede estar ocurriendo dejaría el panel mintiendo.

    Cerrar a mano antes sigue siendo posible y es lo normal: esto es la red que
    recoge lo que nadie alcanzó a cerrar, para que el panel no acumule
    pendientes de hace semanas.
    """
    hoy = hoy or ahora().astimezone(pytz.timezone(settings.zona)).date()
    vencidos = (
        db.query(TkTicket)
        .filter(TkTicket.estado.in_(ESTADOS_ABIERTOS), TkTicket.fecha_servicio < hoy)
        .all()
    )
    for ticket in vencidos:
        ticket.estado = "cerrado"
        ticket.updated_at = ahora()
        _descartar_propuesta(db, ticket.id, "Sistema")
        db.add(TkEvento(
            ticket_id=ticket.id, autor="Sistema", es_admin=True, estado_nuevo="cerrado",
            texto="Cerrada automáticamente: el día del servicio ya pasó.",
        ))
    if vencidos:
        db.commit()
    return len(vencidos)


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
    if ticket.estado not in ("pendiente", "en_curso"):
        # 'en_revision' queda fuera a propósito: con un cambio esperando
        # respuesta, lo que toca es resolverlo, no estirar el plazo del que
        # viene después.
        raise HTTPException(409, "Solo se puede abrir plazo en una solicitud pendiente o en curso.")
    if hasta <= ahora():
        raise HTTPException(400, "El plazo de emergencia tiene que ser a futuro.")

    ticket.plazo_emergencia = hasta
    ticket.plazo_emergencia_por = autor
    db.commit()

    local = hasta.astimezone(pytz.timezone(settings.zona)).strftime("%d-%m-%Y a las %H:%M")
    comentar(db, ticket_id, f"Plazo de emergencia habilitado hasta el {local}. {motivo}".strip(), autor, es_admin=True)
    return _aviso_de(db, ticket, {"plazo_emergencia": hasta.isoformat()})
