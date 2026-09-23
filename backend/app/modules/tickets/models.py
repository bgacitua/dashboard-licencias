from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey, Integer, LargeBinary, String, Text, Time,
    UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.db.base import Base

_S = {"schema": "tickets"}
TZ = DateTime(timezone=True)


class TkUsuario(Base):
    __tablename__ = "usuarios"
    __table_args__ = _S

    id = Column(Integer, primary_key=True)
    email = Column(String(150), unique=True, nullable=False)
    nombre = Column(String(200))
    rut = Column(String(20))
    password_hash = Column(String(200))
    estado = Column(String(20), nullable=False, default="pendiente")
    reset_hasta = Column(TZ)
    activado_por = Column(String(150))
    activado_at = Column(TZ)
    last_login_at = Column(TZ)
    created_at = Column(TZ, nullable=False, server_default=func.now())


class TkTipo(Base):
    __tablename__ = "tipos"
    __table_args__ = _S

    id = Column(Integer, primary_key=True)
    slug = Column(String(80), unique=True, nullable=False)
    nombre = Column(String(120), nullable=False)
    descripcion = Column(Text)
    portada_url = Column(Text)
    definicion = Column(JSONB, nullable=False, default=lambda: {"pages": []})
    tema = Column(JSONB)
    dias_anticipacion = Column(Integer, nullable=False, default=1)
    hora_limite = Column(Time, nullable=False)
    activo = Column(Boolean, nullable=False, default=True)
    orden = Column(Integer, nullable=False, default=0)
    created_at = Column(TZ, nullable=False, server_default=func.now())
    updated_at = Column(TZ, nullable=False, server_default=func.now(), onupdate=func.now())


class TkTicket(Base):
    __tablename__ = "tickets"
    __table_args__ = _S

    id = Column(Integer, primary_key=True)
    tipo_id = Column(Integer, ForeignKey("tickets.tipos.id"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("tickets.usuarios.id"), nullable=False)
    estado = Column(String(20), nullable=False, default="pendiente")
    fecha_servicio = Column(Date, nullable=False)
    plazo = Column(TZ, nullable=False)
    version_actual = Column(Integer, nullable=False, default=1)
    version_vista_admin = Column(Integer, nullable=False, default=0)
    created_at = Column(TZ, nullable=False, server_default=func.now())
    updated_at = Column(TZ, nullable=False, server_default=func.now(), onupdate=func.now())


class TkVersion(Base):
    __tablename__ = "versiones"
    __table_args__ = (UniqueConstraint("ticket_id", "version"), _S)

    id = Column(Integer, primary_key=True)
    ticket_id = Column(Integer, ForeignKey("tickets.tickets.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False)
    fecha_servicio = Column(Date, nullable=False)
    datos = Column(JSONB, nullable=False)
    ip = Column(String(64))
    created_at = Column(TZ, nullable=False, server_default=func.now())


class TkEvento(Base):
    __tablename__ = "eventos"
    __table_args__ = _S

    id = Column(Integer, primary_key=True)
    ticket_id = Column(Integer, ForeignKey("tickets.tickets.id", ondelete="CASCADE"), nullable=False)
    autor = Column(String(150), nullable=False)
    es_admin = Column(Boolean, nullable=False)
    estado_nuevo = Column(String(20))
    texto = Column(Text)
    created_at = Column(TZ, nullable=False, server_default=func.now())


class TkArchivo(Base):
    __tablename__ = "archivos"
    __table_args__ = _S

    id = Column(String(32), primary_key=True)
    nombre = Column(String(200))
    mime = Column(String(50), nullable=False)
    bytes = Column(Integer, nullable=False)
    datos = Column(LargeBinary, nullable=False)
    subido_por = Column(String(150))
    created_at = Column(TZ, nullable=False, server_default=func.now())
