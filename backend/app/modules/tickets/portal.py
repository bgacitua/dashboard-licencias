"""Endpoints del portal: los usa el trabajador con su cuenta del módulo.

No hay sesión de la plataforma acá. La cuenta se crea con registro abierto,
pero solo para correos de la nómina y queda pendiente hasta que un admin la
activa; eso es lo que reemplaza a la verificación por correo.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core.rate_limit import check_rate_limit, client_ip, reset_rate_limit

from . import service
from .auth import UsuarioPortal, crear_token, db_portal
from .models import TkArchivo, TkTipo
from .schemas import (
    CambioClaveIn, ComentarioIn, LoginIn, MeOut, RegistroIn, SesionOut, TicketDetalle,
    TicketEdit, TicketIn, TicketResumen, TipoOut,
)

portal = APIRouter(prefix="/portal", tags=["tickets-portal"])
archivos = APIRouter(tags=["tickets-portal"])

# db_portal y no get_db: ver el semáforo en auth.py.
Db = Annotated[Session, Depends(db_portal)]


@portal.post("/registro")
def registro(datos: RegistroIn, request: Request, db: Db) -> dict:
    check_rate_limit(f"tk-registro:{client_ip(request)}", 5, 3600)
    return {"mensaje": service.registrar(db, datos.email, datos.password)}


@portal.post("/login", response_model=SesionOut)
def login(datos: LoginIn, request: Request, db: Db) -> SesionOut:
    ip = client_ip(request)
    email = datos.email.strip().lower()
    # Por IP y por correo: el primero frena a quien prueba muchos correos, el
    # segundo a quien prueba muchas claves contra uno desde varias IPs.
    check_rate_limit(f"tk-login-ip:{ip}", 20, 900)
    check_rate_limit(f"tk-login:{email}", 8, 900)
    usuario = service.login(db, email, datos.password)
    reset_rate_limit(f"tk-login:{email}")
    return SesionOut(token=crear_token(usuario), nombre=usuario.nombre, email=usuario.email)


@portal.get("/me", response_model=MeOut)
def me(usuario: UsuarioPortal) -> MeOut:
    return MeOut(nombre=usuario.nombre, email=usuario.email)


@portal.post("/password", status_code=204)
def cambiar_password(datos: CambioClaveIn, usuario: UsuarioPortal, db: Db) -> None:
    check_rate_limit(f"tk-clave:{usuario.id}", 5, 900)
    service.cambiar_clave(db, usuario, datos.actual, datos.nueva)


@portal.get("/tipos", response_model=list[TipoOut])
def tipos(_: UsuarioPortal, db: Db) -> list[TkTipo]:
    return db.query(TkTipo).filter(TkTipo.activo.is_(True)).order_by(TkTipo.id).all()


@portal.get("/tickets", response_model=list[TicketResumen])
def mis_tickets(usuario: UsuarioPortal, db: Db) -> list[dict]:
    return service.listar_tickets(db, usuario_id=usuario.id)


@portal.get("/tickets/{ticket_id}", response_model=TicketDetalle)
def mi_ticket(ticket_id: int, usuario: UsuarioPortal, db: Db) -> dict:
    return service.detalle_ticket(db, ticket_id, usuario_id=usuario.id)


@portal.post("/tickets", status_code=201)
def crear(datos: TicketIn, request: Request, usuario: UsuarioPortal, db: Db) -> dict:
    check_rate_limit(f"tk-crear:{usuario.id}", 30, 3600)
    tid = service.crear_ticket(db, usuario, datos.tipo_id, datos.fecha_servicio, datos.datos, client_ip(request))
    return {"id": tid}


@portal.put("/tickets/{ticket_id}")
def editar(ticket_id: int, datos: TicketEdit, request: Request, usuario: UsuarioPortal, db: Db) -> dict:
    version = service.editar_ticket(
        db, usuario, ticket_id, datos.fecha_servicio, datos.datos, datos.version, client_ip(request)
    )
    return {"id": ticket_id, "version": version}


@portal.post("/tickets/{ticket_id}/comentarios", status_code=204)
def comentar(ticket_id: int, datos: ComentarioIn, usuario: UsuarioPortal, db: Db) -> None:
    check_rate_limit(f"tk-coment:{usuario.id}", 30, 3600)
    service.detalle_ticket(db, ticket_id, usuario_id=usuario.id)  # 404 si no es suyo
    service.comentar(db, ticket_id, datos.texto, usuario.nombre or usuario.email, es_admin=False)


@archivos.get("/archivos/{archivo_id}")
def archivo(archivo_id: str, db: Db) -> Response:
    """Sin autenticación: lo pide un <img>, que no manda el Bearer. El id es un
    token aleatorio de 128 bits y solo se sirven imágenes que subió el admin
    para los formularios, que no son información reservada."""
    a = db.get(TkArchivo, archivo_id[:32])
    if not a:
        raise HTTPException(404)
    return Response(
        content=a.datos, media_type=a.mime,
        headers={
            # El id nunca se reutiliza: cambiar la imagen es subir otra.
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
