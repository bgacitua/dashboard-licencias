"""Orden y visibilidad de columnas del dataset de marcajes.

Buk devuelve las claves en orden arbitrario y con campos internos que no
aportan en la tabla. Esto fija un orden estable y esconde el ruido.
"""

_PREFERRED = [
    "id", "rut_trabajador", "nombre", "apellido_paterno", "apellido_materno",
    "id_recinto", "nombre_recinto", "codigo_recinto", "rut_empleado",
    "especialidad", "area", "contrato", "supervisor",
    "turno", "entrada_format", "salida_format",
    "entrada", "salida", "entrada_turno", "salida_turno", "turno_noche",
]

_HIDDEN = {"entrada", "salida", "entrada_turno", "salida_turno", "turno_noche", "art22", "codigo_turno"}


def ordered_columns(rows: list[dict]) -> list[str]:
    seen = {k for r in rows for k in r} - _HIDDEN
    return [c for c in _PREFERRED if c in seen] + [c for c in seen if c not in _PREFERRED]


def columnas_crudas(rows: list[dict]) -> list[str]:
    """Claves tal como vienen, en orden de aparición. Para endpoints sin orden fijo."""
    return list(dict.fromkeys(k for r in rows for k in r))
