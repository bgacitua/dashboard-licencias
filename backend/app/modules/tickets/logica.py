"""Reglas puras del módulo: plazo, estados, sniff de imágenes y clave del JWT.

Sin base ni FastAPI, para que el self-check las pruebe sin nada levantado.
"""
import hashlib
from datetime import date, datetime, time, timedelta

import pytz

ESTADOS = ("pendiente", "en_curso", "rechazado", "cerrado")


def calcular_plazo(fecha_servicio: date, dias: int, hora: time, zona: str) -> datetime:
    """Hasta cuándo se puede pedir o editar: `dias` antes del servicio a `hora`,
    hora local. Con pytz y no zoneinfo: la imagen slim no garantiza tzdata del
    sistema y pytz trae la suya."""
    local = datetime.combine(fecha_servicio - timedelta(days=dias), hora)
    return pytz.timezone(zona).localize(local)


def editable(estado: str, plazo: datetime, ahora: datetime) -> bool:
    """Solo lo pendiente y dentro de plazo. En curso, rechazado o cerrado ya es
    del admin: editarlo cambiaría algo que otro está atendiendo."""
    return estado == "pendiente" and ahora < plazo


# Firmas de los formatos que se aceptan. SVG queda fuera a propósito: es XML con
# script, y la imagen se sirve desde el mismo origen que la plataforma.
_FIRMAS = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
)


def mime_de_imagen(datos: bytes) -> str | None:
    """Tipo real según los primeros bytes; el Content-Type que manda el
    navegador lo elige quien sube el archivo."""
    for firma, mime in _FIRMAS:
        if datos.startswith(firma):
            return mime
    if datos[:4] == b"RIFF" and datos[8:12] == b"WEBP":
        return "image/webp"
    return None


def clave_jwt(secreto_plataforma: str) -> str:
    """Clave del JWT del portal, derivada de la de la plataforma.

    Distinta a propósito: con la misma clave, un token del portal cuyo `sub`
    coincidiera con un username pasaría get_current_user de la plataforma. Así
    no hace falta otro secreto en el .env y los dos mundos no se cruzan.
    """
    return hashlib.sha256(f"tickets|{secreto_plataforma}".encode()).hexdigest()


def aviso_de_cambio(anterior: str, nuevo: str) -> str | None:
    """Evento a notificar cuando el admin cambia el estado de una cuenta.

    Solo se avisa la respuesta a una solicitud de acceso: aprobar a quien
    esperaba (o a quien se había rechazado) y rechazar a quien esperaba.
    Desactivar o reactivar una cuenta ya usada no manda correo.
    """
    if nuevo == "activo" and anterior in ("pendiente", "rechazado"):
        return "usuario_aprobado"
    if nuevo == "rechazado" and anterior == "pendiente":
        return "usuario_rechazado"
    return None


# === Catálogo de servicios ===

PREFIJO_SERVICIO = "srv:"


def id_de_servicio(valor) -> int | None:
    """El id del servicio detrás del `value` de una opción, o None si esa
    opción es texto libre de los de siempre.

    Las opciones del catálogo se guardan como 'srv:<id>' justamente para poder
    distinguirlas sin mirar la definición del formulario.
    """
    if not isinstance(valor, str) or not valor.startswith(PREFIJO_SERVICIO):
        return None
    resto = valor[len(PREFIJO_SERVICIO):]
    return int(resto) if resto.isdigit() else None


def servicios_respondidos(datos: dict) -> list[int]:
    """Ids de servicio elegidos en una respuesta, en orden y sin repetir.

    Recorre todas las preguntas porque una respuesta puede ser un valor suelto
    (radio, dropdown) o una lista (checkbox).
    """
    salida = []
    for valor in (datos or {}).values():
        for v in (valor if isinstance(valor, list) else [valor]):
            sid = id_de_servicio(v)
            if sid is not None and sid not in salida:
                salida.append(sid)
    return salida


def cantidad_de(datos: dict, pregunta_cantidad: str | None) -> int:
    """Por cuánto se multiplican los servicios cobrados por unidad.

    Sin pregunta marcada, o con una respuesta que no es un número usable, se
    cobra una vez: es preferible costear de menos que inventar un multiplicador.
    """
    if not pregunta_cantidad:
        return 1
    crudo = (datos or {}).get(pregunta_cantidad)
    try:
        n = int(float(crudo))
    except (TypeError, ValueError):
        return 1
    return n if n > 0 else 1


def calcular_costo(datos: dict, tarifas: dict, pregunta_cantidad: str | None) -> dict | None:
    """Costo de una respuesta según las tarifas vigentes al momento de guardarla.

    `tarifas` es `{servicio_id: {"nombre", "modo", "valor"}}` ya resuelto a una
    fecha por quien llama: acá no se consulta nada, para que el cálculo sea
    puro y testeable sin base.

    Devuelve None si la respuesta no toca ningún servicio tarifado. Es distinto
    de un total 0 —que sí puede darse con un servicio que vale 0— y quien lo
    guarda lo deja en NULL en vez de inventar un costo.

    Un servicio elegido pero sin precio vigente se omite de las líneas: cobrar
    de menos y que se note en el detalle es mejor que inventar una tarifa.
    """
    lineas = []
    cantidad = cantidad_de(datos, pregunta_cantidad)
    for sid in servicios_respondidos(datos):
        tarifa = tarifas.get(sid)
        if not tarifa or tarifa.get("valor") is None:
            continue
        unitario = tarifa["valor"]
        veces = cantidad if tarifa.get("modo") == "cantidad" else 1
        lineas.append({
            "servicio_id": sid,
            "nombre": tarifa.get("nombre"),
            "modo": tarifa.get("modo"),
            "valor_unitario": unitario,
            "cantidad": veces,
            "subtotal": unitario * veces,
        })
    if not lineas:
        return None
    return {"total": sum(l["subtotal"] for l in lineas), "lineas": lineas}
