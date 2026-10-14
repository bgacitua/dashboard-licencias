"""Reglas puras del módulo: plazo, estados, sniff de imágenes y clave del JWT.

Sin base ni FastAPI, para que el self-check las pruebe sin nada levantado.
"""
import hashlib
from datetime import date, datetime, time, timedelta

import pytz

# El recorrido de una solicitud:
#
#   pendiente ──(el admin la toma)──> en_curso ──(pasa el día)──> cerrado
#       │                                 │
#       └────(el usuario modifica)───> en_revision ──(resuelta)──> en_curso
#       │                                 │
#       └─────────────────────────────────┴──> cancelado (el usuario se baja)
#                                         └──> rechazado (el admin, con motivo)
#
# `en_revision` no la pone nadie a mano: la enciende la solicitud de cambio y
# la apaga el administrador al resolverla, apruebe o rechace.
ESTADOS = ("pendiente", "en_curso", "en_revision", "cancelado", "rechazado", "cerrado")

# Los que el administrador puede poner desde el panel. `cancelado` es del
# usuario final y `en_revision` la mueve el flujo de cambios: ninguno de los
# dos es un botón del panel, o el estado diría algo que no pasó.
ESTADOS_ADMIN = ("pendiente", "en_curso", "rechazado", "cerrado")

# Una solicitud que todavía puede moverse. Son las que el usuario puede
# cancelar y las que el cierre automático alcanza; el resto ya terminó.
ESTADOS_ABIERTOS = ("pendiente", "en_curso", "en_revision")


def calcular_plazo(fecha_servicio: date, dias: int, hora: time, zona: str) -> datetime:
    """Hasta cuándo se puede pedir o editar: `dias` antes del servicio a `hora`,
    hora local. Con pytz y no zoneinfo: la imagen slim no garantiza tzdata del
    sistema y pytz trae la suya."""
    local = datetime.combine(fecha_servicio - timedelta(days=dias), hora)
    return pytz.timezone(zona).localize(local)


def plazo_efectivo(plazo: datetime, emergencia: datetime | None) -> datetime:
    """Hasta cuándo se puede pedir un cambio en un ticket puntual.

    El administrador puede abrir un plazo de emergencia; manda el más tardío de
    los dos, porque abrirlo nunca debería acortar el que ya regía.
    """
    return max(plazo, emergencia) if emergencia else plazo


def editable(
    estado: str, plazo: datetime, ahora: datetime, *,
    emergencia: datetime | None = None, propuesta_pendiente: bool = False,
) -> bool:
    """Si el usuario puede proponer un cambio.

    Pendiente o en curso, y dentro de plazo. Que ya se esté atendiendo no le
    cierra la puerta: el cambio no entra solo, se lo manda al administrador
    para que decida. Cancelado, rechazado y cerrado no se tocan, porque ahí la
    solicitud ya terminó. Y con una propuesta esperando respuesta no se admite
    otra —el ticket está en `en_revision`, que no es editable— o el admin
    estaría resolviendo una mientras la siguiente ya la dejó vieja.
    """
    if propuesta_pendiente:
        return False
    return estado in ("pendiente", "en_curso") and ahora < plazo_efectivo(plazo, emergencia)


def cancelable(estado: str) -> bool:
    """Si el usuario final puede bajarse de la solicitud.

    Sin plazo de por medio, a propósito: cancelar tarde se cobra, pero eso es
    cosa del casino y del reporte, no un motivo para dejar a alguien amarrado a
    un servicio que ya no necesita. Ver `cancelacion_tardia`.
    """
    return estado in ESTADOS_ABIERTOS


def inicio_del_evento(
    fecha_servicio: date, servicio_inicio: time | None, zona: str,
) -> datetime:
    """Cuándo empieza lo que se pidió, con zona.

    Sin tramo guardado —los tickets anteriores a la integración con Outlook— se
    toma el comienzo del día del servicio: es lo más temprano que pudo ser, y al
    medir una anticipación conviene quedarse corto antes que cobrar de más.
    """
    return pytz.timezone(zona).localize(
        datetime.combine(fecha_servicio, servicio_inicio or time(0, 0))
    )


def cancelacion_tardia(
    fecha_servicio: date, servicio_inicio: time | None, ahora: datetime, zona: str,
    horas: int = 24,
) -> bool:
    """Si cancelar a esta hora cae dentro de la ventana que el casino cobra.

    No bloquea nada: es una marca para el panel y el reporte. La política no se
    le muestra al usuario final, así que esto no tiene que llegar al portal.
    """
    return ahora > inicio_del_evento(fecha_servicio, servicio_inicio, zona) - timedelta(hours=horas)


def cierra_automaticamente(estado: str, fecha_servicio: date, hoy: date) -> bool:
    """Si al correr el barrido de `hoy` esta solicitud ya puede darse por
    cerrada: el día del servicio quedó atrás y nadie la cerró a mano.

    Un día después y no el mismo día: el servicio se presta hasta el final de
    su jornada, y cerrarlo mientras todavía puede estar ocurriendo dejaría el
    panel mintiendo.
    """
    return estado in ESTADOS_ABIERTOS and fecha_servicio < hoy


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


# Estados que siguen ocupando el horario. Rechazado y cancelado no se van a
# servir, así que liberan su tramo; cerrado sí ocupa, porque ya se sirvió. Uno
# en revisión también: lo que rige mientras tanto es su versión vigente, y esa
# sigue en pie pase lo que pase con el cambio.
ESTADOS_QUE_OCUPAN = ("pendiente", "en_curso", "en_revision", "cerrado")


def se_solapan(a_inicio: time, a_fin: time, b_inicio: time, b_fin: time) -> bool:
    """Si dos tramos comparten aunque sea un minuto.

    Los extremos no cuentan como choque: un servicio que termina 12:00 y otro
    que arranca 12:00 conviven, que es como la gente parte el bloque.
    """
    return a_inicio < b_fin and b_inicio < a_fin


def huecos_libres(
    bloque_inicio: time, bloque_fin: time, ocupados: list[tuple[time, time]],
) -> list[tuple[time, time]]:
    """Lo que queda sin pedir dentro del bloque reservado, en orden.

    Sirve para el mensaje de error: decir "ya tienes algo de 12:00 a 13:00" no
    ayuda tanto como decir en qué rango sí se puede pedir. Los tramos ocupados
    pueden venir desordenados y superponerse entre ellos.
    """
    libres = []
    cursor = bloque_inicio
    for inicio, fin in sorted(ocupados):
        if fin <= cursor:  # ya cubierto por un tramo anterior
            continue
        if inicio > cursor:
            libres.append((cursor, min(inicio, bloque_fin)))
        cursor = max(cursor, fin)
        if cursor >= bloque_fin:
            break
    if cursor < bloque_fin:
        libres.append((cursor, bloque_fin))
    return [(a, b) for a, b in libres if a < b]


def disponibilidad_del_bloque(
    bloque_inicio: time, bloque_fin: time, ocupados: list[tuple[time, time]],
) -> tuple[list[tuple[time, time]], list[tuple[time, time]]]:
    """Lo ocupado y lo libre de un bloque reservado, a partir de lo ya pedido.

    Los tramos pueden venir de otras reuniones del mismo día en la misma sala,
    así que primero se descarta lo que no toca este bloque: decirle al usuario
    que tiene ocupado un horario fuera de la reserva que está mirando no explica
    nada. Qué tickets entran en `ocupados` lo decide el service contra la base;
    acá solo se recorta, que es la parte que no necesita base para probarse.
    """
    dentro = sorted(t for t in ocupados if se_solapan(bloque_inicio, bloque_fin, *t))
    return dentro, huecos_libres(bloque_inicio, bloque_fin, dentro)
