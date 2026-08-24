# Módulo: Asistencia

Integración de `buk-asistencia` como módulo de la plataforma. El repo original
sigue existiendo por separado y no se modifica: acá se copia código, no se
mueve.

## Regla de acoplamiento

Este paquete importa de la plataforma **solo**:

| Import | Para qué |
|---|---|
| `app.core.security.require_module` | Autorización (aplicada al router entero) |
| `app.db.deps.get_db` | Sesión SQLAlchemy contra PostgreSQL |
| `app.core.logging_config.logger` | Logs |

Todo lo demás vive dentro de la carpeta. Config propia en `config.py` con
prefijo `ASISTENCIA_`. Borrar la carpeta y el bloque final de
`app/api/v1/api.py` desinstala el módulo por completo.

## Flag

`ASISTENCIA_ENABLED=false` por defecto. Con el flag apagado el paquete no se
importa siquiera, así que la rama es segura de mergear a `main` antes de estar
terminada.

## DRY_RUN

`ASISTENCIA_DRY_RUN=true` (por defecto) hace que el registro de marcas loguee
el payload en vez de escribirlo en el Buk productivo. Dejarlo en true en local:
el entorno de desarrollo apunta a los sistemas reales.

## Estado de la migración

- [x] Esqueleto, flag, autorización, health
- [ ] `shared/external_client.py` -> cliente httpx a Buk Ctrl
- [ ] `shared/recintos.py`, `morpho.py`, `excel.py`
- [ ] `asistencia/queries.py` + `commands.py` -> endpoints
- [ ] `reportes/` -> bonos por quincena
- [ ] Historial: SQLite -> tabla PostgreSQL vía SQLAlchemy
- [ ] `notificaciones.py` -> `app.services.email_service` (romperá la regla de
      acoplamiento con un cuarto import; es el único aceptado de antemano)
- [ ] Frontend `features/asistencia/`
