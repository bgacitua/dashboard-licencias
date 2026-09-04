from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB

from app.db.base import Base


class Formulario(Base):
    __tablename__ = "formularios"
    __table_args__ = {"schema": "app"}

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(80), unique=True, nullable=False, index=True)
    titulo = Column(String(200), nullable=False)
    definicion = Column(JSONB, nullable=False, default=lambda: {"pages": []})
    n8n_webhook_url = Column(Text, nullable=True)
    activo = Column(Boolean, nullable=False, default=True)
    creado_por = Column(String(150), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class FormToken(Base):
    __tablename__ = "form_tokens"
    __table_args__ = {"schema": "app"}

    token = Column(String(64), primary_key=True)
    formulario_id = Column(Integer, ForeignKey("app.formularios.id", ondelete="CASCADE"), nullable=False, index=True)
    rut = Column(String(20), nullable=False)
    expira_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    # A qué casilla se mandó el enlace y quién lo mandó. El correo se guarda
    # acá y no se lee de rh.employees al mostrar: si la persona cambia de
    # correo, el registro tiene que seguir diciendo dónde llegó.
    email = Column(String(150), nullable=True)
    enviado_por = Column(String(150), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class FormRespuesta(Base):
    __tablename__ = "form_respuestas"
    __table_args__ = {"schema": "app"}

    id = Column(Integer, primary_key=True, index=True)
    formulario_id = Column(Integer, ForeignKey("app.formularios.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(64), nullable=True)
    rut = Column(String(20), nullable=True)
    datos = Column(JSONB, nullable=False)
    ip = Column(String(64), nullable=True)
    n8n_ok = Column(Boolean, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
