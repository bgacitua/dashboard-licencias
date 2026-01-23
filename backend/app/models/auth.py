"""
Modelos SQLAlchemy para autenticación y autorización.
Tablas ubicadas en el esquema 'App' de la BD IARRHH.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base

# Tabla de relación muchos-a-muchos entre Roles y Módulos
rol_modulos = Table(
    'RolModulos',
    Base.metadata,
    Column('rol_id', Integer, ForeignKey('App.Roles.id'), primary_key=True),
    Column('modulo_id', Integer, ForeignKey('App.Modulos.id'), primary_key=True),
    schema='App'
)


class Role(Base):
    """Modelo para roles del sistema (admin, rrhh, usuario)"""
    __tablename__ = 'Roles'
    __table_args__ = {'schema': 'App'}
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50), unique=True, nullable=False)
    descripcion = Column(String(255))
    created_at = Column(DateTime, server_default=func.now())
    
    # Relación con usuarios
    usuarios = relationship("Usuario", back_populates="rol")
    # Relación con módulos permitidos
    modulos = relationship("Modulo", secondary=rol_modulos, back_populates="roles")


class Usuario(Base):
    """Modelo para usuarios del sistema"""
    __tablename__ = 'Usuarios'
    __table_args__ = {'schema': 'App'}
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100))
    password_hash = Column(String(255), nullable=False)
    nombre_completo = Column(String(100))
    rol_id = Column(Integer, ForeignKey('App.Roles.id'))
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    last_login = Column(DateTime)
    
    # Relación con rol
    rol = relationship("Role", back_populates="usuarios")


class Modulo(Base):
    """Modelo para módulos de la aplicación"""
    __tablename__ = 'Modulos'
    __table_args__ = {'schema': 'App'}
    
    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(50), unique=True, nullable=False)
    nombre = Column(String(100), nullable=False)
    descripcion = Column(String(255))
    icono = Column(String(50))
    ruta = Column(String(100))
    orden = Column(Integer, default=0)
    activo = Column(Boolean, default=True)
    
    # Relación con roles que tienen acceso
    roles = relationship("Role", secondary=rol_modulos, back_populates="modulos")
