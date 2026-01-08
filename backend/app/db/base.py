from sqlalchemy.ext.declarative import declarative_base
# Importamos todos los modelos aquí para que Alembic o el motor de DB los detecte
from app.models.licencia import Licencia

# Todos los modelos de datos heredarán de esta clase
Base = declarative_base()