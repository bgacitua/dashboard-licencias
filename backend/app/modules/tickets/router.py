"""Router de administración del módulo de tickets.

Contrato con la plataforma. Este módulo importa de fuera de su carpeta solo:

    app.core.security.require_module          -> autorización del panel
    app.core.security.get_current_active_user -> autor de cambios de estado
    app.core.config.settings.JWT_SECRET_KEY   -> base de la clave del portal
    app.core.rate_limit                       -> freno de login y registro
    app.db.deps.get_db / app.db.base.Base     -> PostgreSQL

Cualquier import adicional hacia `app.*` es acoplamiento: revisarlo antes de
agregarlo. Para separar el módulo, lo único que hay que reemplazar es
require_module del panel.
"""
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import get_current_active_user, require_module
from app.db.deps import get_db

from . import service
from .config import settings
from .logica import aviso_de_cambio
from .models import TkTicket, TkTipo, TkUsuario
from .schemas import (
    ArchivoOut, ComentarioIn, Estado, EstadoIn, TicketDetalle, TicketResumen, TipoCreate,
    TipoOut, TipoUpdate, UsuarioEstadoIn, UsuarioOut,
)

router = APIRouter(prefix="/admin", dependencies=[Depends(require_module("tickets"))])

Db = Annotated[Session, Depends(get_db)]
Admin = Annotated[object, Depends(get_current_active_user)]


# === Tickets ===

@router.get("/tickets", response_model=list[TicketResumen])
def tickets(db: Db, estado: Estado | None = None, tipo_id: int | None = None, q: str = "") -> list[dict]:
    return service.listar_tickets(db, estado=estado, tipo_id=tipo_id, q=q[:100])


@router.get("/tickets/{ticket_id}", response_model=TicketDetalle)
def ticket(ticket_id: int, db: Db) -> dict:
    return service.detalle_ticket(db, ticket_id)


@router.post("/tickets/{ticket_id}/estado", status_code=204)
def estado(ticket_id: int, datos: EstadoIn, db: Db, admin: Admin) -> None:
    service.cambiar_estado(db, ticket_id, datos.estado, datos.comentario, admin.username)


@router.post("/tickets/{ticket_id}/comentarios", status_code=204)
def comentar(ticket_id: int, datos: ComentarioIn, db: Db, admin: Admin) -> None:
    if not db.get(TkTicket, ticket_id):
        raise HTTPException(404, "Ticket no encontrado.")
    service.comentar(db, ticket_id, datos.texto, admin.username, es_admin=True)


# === Tipos de solicitud ===

@router.get("/tipos", response_model=list[TipoOut])
def tipos(db: Db) -> list[TkTipo]:
    # Orden de creación: el primero que se creó es la primera tarjeta del portal.
    return db.query(TkTipo).order_by(TkTipo.id).all()


@router.post("/tipos", response_model=TipoOut, status_code=201)
def crear_tipo(datos: TipoCreate, db: Db) -> TkTipo:
    tipo = TkTipo(**datos.model_dump(), slug=service.slug_libre(db, datos.nombre))
    db.add(tipo)
    try:
        db.commit()
    except IntegrityError:  # dos admins creando el mismo nombre en el mismo instante
        db.rollback()
        raise HTTPException(409, "No se pudo crear el tipo. Vuelve a intentarlo.")
    db.refresh(tipo)
    return tipo


@router.put("/tipos/{tipo_id}", response_model=TipoOut)
def actualizar_tipo(tipo_id: int, datos: TipoUpdate, db: Db) -> TkTipo:
    tipo = db.get(TkTipo, tipo_id)
    if not tipo:
        raise HTTPException(404, "Tipo no encontrado.")
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(tipo, campo, valor)
    db.commit()
    db.refresh(tipo)
    return tipo


@router.delete("/tipos/{tipo_id}", status_code=204)
def eliminar_tipo(tipo_id: int, db: Db) -> None:
    tipo = db.get(TkTipo, tipo_id)
    if not tipo:
        raise HTTPException(404, "Tipo no encontrado.")
    if db.query(TkTicket.id).filter(TkTicket.tipo_id == tipo_id).first():
        raise HTTPException(409, "Este tipo ya tiene tickets. Desactívalo en vez de eliminarlo.")
    db.delete(tipo)
    db.commit()


@router.post("/archivos", response_model=ArchivoOut, status_code=201)
def subir_imagen(db: Db, admin: Admin, archivo: UploadFile = File(...)) -> ArchivoOut:
    # def y no async: la sesión es síncrona y así corre en el threadpool en vez
    # de bloquear el event loop. Lee un byte más que el tope: alcanza para
    # saber que se pasó sin cargar a memoria un archivo arbitrariamente grande.
    datos = archivo.file.read(settings.archivo_max_mb * 1024 * 1024 + 1)
    a = service.guardar_imagen(db, archivo.filename, datos, admin.username)
    return ArchivoOut(id=a.id, url=f"/api/v1/tickets/archivos/{a.id}")


# === Usuarios del portal ===

@router.get("/usuarios", response_model=list[UsuarioOut])
def usuarios(db: Db) -> list[UsuarioOut]:
    lista = db.query(TkUsuario).order_by(TkUsuario.estado != "pendiente", TkUsuario.created_at.desc()).all()
    return [
        UsuarioOut.model_validate(u).model_copy(update={"tiene_clave": u.password_hash is not None})
        for u in lista
    ]


@router.patch("/usuarios/{usuario_id}", status_code=204)
def estado_usuario(
    usuario_id: int, datos: UsuarioEstadoIn, db: Db, admin: Admin, tareas: BackgroundTasks,
) -> None:
    u = db.get(TkUsuario, usuario_id)
    if not u:
        raise HTTPException(404, "Usuario no encontrado.")
    evento = aviso_de_cambio(u.estado, datos.estado)
    if datos.estado == "activo" and u.estado != "activo":
        u.activado_por, u.activado_at = admin.username, service.ahora()
    u.estado = datos.estado
    db.commit()
    if evento:
        tareas.add_task(
            service.notificar, evento, [u.email],
            {"nombre": u.nombre, "rut": u.rut, "email": u.email},
            service.url_portal("/tickets/ingresar"),
            datos.motivo if evento == "usuario_rechazado" else None,
        )


@router.post("/usuarios/{usuario_id}/reset", status_code=204)
def reset_usuario(usuario_id: int, db: Db) -> None:
    """Borra la clave y abre una ventana corta para que la persona se vuelva a
    registrar con una nueva. No hay correo de por medio, a pedido del negocio."""
    u = db.get(TkUsuario, usuario_id)
    if not u:
        raise HTTPException(404, "Usuario no encontrado.")
    service.resetear_clave(db, u)
