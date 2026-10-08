from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey, Integer, LargeBinary, Numeric, String, Text, Time,
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
    # `name` de la pregunta que sirve de cantidad al costear los servicios
    # cobrados por unidad. None = en este formulario todo se cobra una vez.
    pregunta_cantidad = Column(String(80))
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
    # Bloque horario de la reserva de sala que originó la solicitud. Es una
    # copia congelada: si después mueven la reunión en Outlook, lo ya pedido no
    # se mueve solo. NULL en los tickets anteriores a la integración.
    hora_inicio = Column(Time)
    hora_fin = Column(Time)
    # Tramo que el usuario pidió dentro del bloque reservado. Puede ser más
    # corto que la reunión: el café llega a las 15:30 de una reserva que va
    # de 15:00 a 17:00.
    servicio_inicio = Column(Time)
    servicio_fin = Column(Time)
    reserva_id = Column(Text)
    reserva_asunto = Column(String(200))
    reserva_sala = Column(String(200))
    plazo = Column(TZ, nullable=False)
    # La versión que rige. Puede no ser la última: una propuesta pendiente
    # lleva un número mayor y no cuenta hasta que el admin la apruebe.
    version_actual = Column(Integer, nullable=False, default=1)
    version_vista_admin = Column(Integer, nullable=False, default=0)
    # Plazo excepcional solo para este ticket, por sobre la regla del tipo.
    plazo_emergencia = Column(TZ)
    plazo_emergencia_por = Column(String(150))
    created_at = Column(TZ, nullable=False, server_default=func.now())
    updated_at = Column(TZ, nullable=False, server_default=func.now(), onupdate=func.now())


class TkVersion(Base):
    __tablename__ = "versiones"
    __table_args__ = (UniqueConstraint("ticket_id", "version"), _S)

    id = Column(Integer, primary_key=True)
    ticket_id = Column(Integer, ForeignKey("tickets.tickets.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False)
    fecha_servicio = Column(Date, nullable=False)
    # La reserva viaja con la versión: un cambio puede mover el servicio a otra
    # reunión, y recién rige cuando el administrador lo aprueba.
    hora_inicio = Column(Time)
    hora_fin = Column(Time)
    servicio_inicio = Column(Time)
    servicio_fin = Column(Time)
    reserva_id = Column(Text)
    reserva_asunto = Column(String(200))
    reserva_sala = Column(String(200))
    datos = Column(JSONB, nullable=False)
    # Costo calculado al guardar esta versión, con las tarifas de ese momento.
    # No se recalcula: un reporte emitido no puede moverse porque cambie un
    # precio. NULL = versión previa al costeo, o sin servicios tarifados.
    costo = Column(JSONB)
    # 'vigente' | 'propuesta' | 'rechazada'.
    #
    # Distingue si la versión llegó a aplicarse, no cuál manda hoy: tras
    # aprobar un cambio quedan varias en 'vigente', todas las que rigieron en
    # su momento. Cuál rige ahora lo dice tickets.version_actual, y es por ahí
    # que se leen los datos y el costo.
    estado = Column(String(20), nullable=False, default="vigente")
    resuelta_por = Column(String(150))
    resuelta_at = Column(TZ)
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


class TkServicio(Base):
    """Servicio cobrable del catálogo.

    Vive aparte de los formularios: estos lo referencian por id en el `value`
    de la opción (`srv:<id>`), nunca por el texto. Renombrarlo no rompe nada y
    el mismo servicio vale igual en todos los formularios donde aparece.
    """

    __tablename__ = "servicios"
    __table_args__ = _S

    id = Column(Integer, primary_key=True)
    nombre = Column(String(160), nullable=False)
    descripcion = Column(Text)
    # 'fijo' se cobra una vez; 'cantidad' se multiplica por la pregunta que el
    # tipo marcó como cantidad.
    modo = Column(String(20), nullable=False, default="fijo")
    activo = Column(Boolean, nullable=False, default=True)
    created_at = Column(TZ, nullable=False, server_default=func.now())
    updated_at = Column(TZ, nullable=False, server_default=func.now(), onupdate=func.now())


class TkServicioPrecio(Base):
    """Un precio con vigencia. No se pisa: se cierra el anterior y entra otro,
    así un reporte de septiembre sigue costando lo que costaba en septiembre."""

    __tablename__ = "servicio_precios"
    __table_args__ = _S

    id = Column(Integer, primary_key=True)
    servicio_id = Column(
        Integer, ForeignKey("tickets.servicios.id", ondelete="CASCADE"), nullable=False
    )
    valor = Column(Numeric(12, 2), nullable=False)
    desde = Column(Date, nullable=False)
    # None = vigente sin término. `hasta` es inclusivo.
    hasta = Column(Date)
    creado_por = Column(String(150))
    created_at = Column(TZ, nullable=False, server_default=func.now())
