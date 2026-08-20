"""
Modelos SQLAlchemy para autenticación y autorización.
Tablas ubicadas en el schema 'app' de rh_cramer (creadas por SQLAlchemy).
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base
import secrets

rol_modulos = Table(
    'rol_modulos',
    Base.metadata,
    Column('rol_id', Integer, ForeignKey('app.roles.id'), primary_key=True),
    Column('modulo_id', Integer, ForeignKey('app.modulos.id'), primary_key=True),
    schema='app'
)

usuario_modulos = Table(
    'usuario_modulos',
    Base.metadata,
    Column('usuario_id', Integer, ForeignKey('app.usuarios.id'), primary_key=True),
    Column('modulo_id', Integer, ForeignKey('app.modulos.id'), primary_key=True),
    schema='app'
)


class Role(Base):
    __tablename__ = 'roles'
    __table_args__ = {'schema': 'app'}

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50), unique=True, nullable=False)
    descripcion = Column(String(255))
    created_at = Column(DateTime, server_default=func.now())

    usuarios = relationship("Usuario", back_populates="rol")
    modulos = relationship("Modulo", secondary=rol_modulos, back_populates="roles")


class Usuario(Base):
    __tablename__ = 'usuarios'
    __table_args__ = {'schema': 'app'}

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100))
    password_hash = Column(String(255), nullable=False)
    nombre_completo = Column(String(100))
    rol_id = Column(Integer, ForeignKey('app.roles.id'))
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    last_login = Column(DateTime)
    invite_token = Column(String(64), nullable=True, unique=True, index=True)
    invite_token_expires_at = Column(DateTime, nullable=True)

    rol = relationship("Role", back_populates="usuarios")
    modulos = relationship("Modulo", secondary=usuario_modulos, back_populates="usuarios")


class Modulo(Base):
    __tablename__ = 'modulos'
    __table_args__ = {'schema': 'app'}

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(50), unique=True, nullable=False)
    nombre = Column(String(100), nullable=False)
    descripcion = Column(String(255))
    icono = Column(String(50))
    ruta = Column(String(100))
    orden = Column(Integer, default=0)
    activo = Column(Boolean, default=True)

    roles = relationship("Role", secondary=rol_modulos, back_populates="modulos")
    usuarios = relationship("Usuario", secondary=usuario_modulos, back_populates="modulos")
