"""Plantilla del aviso paralelo de salida de personal.

Va a una casilla distinta del aviso principal (SALIDA_PERSONAL_PARALELO_TO).
Salvo la fecha de salida, que la elige el usuario, los datos vienen de la BD
(rh.employees + rh.areas).
"""

from datetime import date

def etiqueta_contrato(contract_type: str | None) -> str:
    """rh.employees.contract_type trae 'Indefinido' o 'Fijo'; se muestra tal cual.
    ponytail: sin mapa de traducción, el valor de la BD ya es presentable."""
    return f"Contrato {contract_type.strip().lower()}" if contract_type else "Contrato sin especificar"


def asunto(empresa: str | None) -> str:
    return f"Movimiento de personal - {empresa or 'sin empresa'}"


def cuerpo(
    *,
    nombre_trabajador: str,
    rut_trabajador: str,
    empresa: str | None,
    contract_type: str | None,
    fecha_salida: date,
) -> str:
    fecha = fecha_salida.strftime("%d-%m-%Y")
    return (
        "<p>Estimados,</p>"
        f"<p>Por favor excluir con fecha de {fecha} del seguro complementario "
        "de salud o vida, según corresponda, a:</p>"
        "<p>"
        f"{nombre_trabajador},<br>"
        f"{rut_trabajador},<br>"
        f"{empresa or 'sin empresa'},<br>"
        f"{etiqueta_contrato(contract_type)}"
        "</p>"
    )
