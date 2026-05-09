from sqlalchemy import Column, Numeric, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import JSONB

from app.db.base import Base


class CountryConfig(Base):
    __tablename__ = "country_config"
    __table_args__ = {"schema": "calculadora"}

    pais = Column(Text, primary_key=True)

    afp_data = Column(JSONB)
    afp_updated_at = Column(TIMESTAMP(timezone=True))

    uf_value = Column(Numeric)
    uf_updated_at = Column(TIMESTAMP(timezone=True))

    tasas = Column(JSONB)
    tasas_updated_at = Column(TIMESTAMP(timezone=True))

    updated_at = Column(TIMESTAMP(timezone=True))

    tax_brackets = Column(JSONB)
    tax_brackets_updated_at = Column(TIMESTAMP(timezone=True))

    dolar_value = Column(Numeric)
    dolar_updated_at = Column(TIMESTAMP(timezone=True))

    bonos_anuales_uf = Column(JSONB)
    bonos_empresa = Column(JSONB)
