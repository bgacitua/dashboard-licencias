from sqlalchemy.orm import declarative_base

# Base declarativa para todos los modelos
Base = declarative_base()

# Importar modelos aquí para que Alembic los detecte
from app.models import licencias  # noqa: F401, E402
from app.models import auth  # noqa: F401, E402
from app.models import finiquito  # noqa: F401, E402