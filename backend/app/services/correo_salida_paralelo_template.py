"""Plantilla del aviso paralelo de salida de personal.

Va a una casilla distinta del aviso principal (SALIDA_PERSONAL_PARALELO_TO) y
el cuerpo cambia según el tipo de contrato del trabajador.
"""

from datetime import date

# Texto propio de cada tipo de contrato. Ajustar aquí el wording, no en el servicio.
CUERPO_POR_CONTRATO = {
    "indefinido": (
        "<p>El trabajador tenía <b>contrato indefinido</b>, por lo que corresponde "
        "revisar el pago de indemnización por años de servicio y el aviso previo.</p>"
    ),
    "fijo": (
        "<p>El trabajador tenía <b>contrato a plazo fijo</b>, por lo que el término "
        "se produce por vencimiento del plazo y no corresponde indemnización por "
        "años de servicio.</p>"
    ),
}


def asunto(nombre_trabajador: str) -> str:
    return f"Salida de personal (gestión interna) - {nombre_trabajador}"


def cuerpo(
    *,
    nombre_trabajador: str,
    rut: str,
    cargo: str | None,
    fecha_salida: date,
    motivo_texto: str,
    tipo_contrato: str,
) -> str:
    fecha = fecha_salida.strftime("%d-%m-%Y")
    cargo_txt = f" ({cargo})" if cargo else ""
    return (
        "<p>Estimados.</p>"
        f"<p>&nbsp;&nbsp;&nbsp;&nbsp;Se les informa que con fecha de {fecha}, "
        f"{motivo_texto} {nombre_trabajador}, Rut: {rut}{cargo_txt}.</p>"
        f"{CUERPO_POR_CONTRATO[tipo_contrato]}"
        "<p>Atte.</p>"
    )
