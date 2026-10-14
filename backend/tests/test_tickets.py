"""Self-check del módulo de tickets: plazo, editable, sniff de imágenes y
separación del JWT del portal respecto del de la plataforma.

Todo puro, no necesita base. Ejecutar:
    python -m tests.test_tickets
"""
from datetime import date, datetime, time, timedelta, timezone

from app.modules.tickets.config import TicketsSettings
from app.modules.tickets.logica import (
    ESTADOS, ESTADOS_ABIERTOS, ESTADOS_ADMIN, ESTADOS_QUE_OCUPAN, aviso_de_cambio,
    calcular_costo, calcular_plazo, cancelable, cancelacion_tardia, cantidad_de,
    cierra_automaticamente, clave_jwt, disponibilidad_del_bloque, editable, huecos_libres,
    id_de_servicio, mime_de_imagen, plazo_efectivo, se_solapan, servicios_respondidos,
)


def test_plazo():
    # Almuerzo del lunes 2026-09-28, hasta 1 día antes a las 12:00 de Chile.
    p = calcular_plazo(date(2026, 9, 28), 1, time(12, 0), "America/Santiago")
    assert p.strftime("%Y-%m-%d %H:%M") == "2026-09-27 12:00"
    # Septiembre 2026 ya es horario de verano en Chile (UTC-3).
    assert p.astimezone(timezone.utc).hour == 15
    # Invierno (UTC-4): la misma regla cae una hora distinta en UTC.
    p = calcular_plazo(date(2026, 6, 15), 0, time(9, 30), "America/Santiago")
    assert p.astimezone(timezone.utc).strftime("%H:%M") == "13:30"
    print("ok  plazo")


def test_editable():
    plazo = datetime(2026, 9, 27, 15, tzinfo=timezone.utc)
    antes, despues = plazo - timedelta(seconds=1), plazo
    assert editable("pendiente", plazo, antes)
    assert not editable("pendiente", plazo, despues)       # justo en el plazo ya no
    # Que el admin la haya tomado no cierra la puerta: el cambio no entra solo,
    # se lo manda a él.
    assert editable("en_curso", plazo, antes)
    # En revisión ya hay un cambio esperando respuesta; el resto ya terminó.
    for estado in ("en_revision", "cancelado", "rechazado", "cerrado"):
        assert not editable(estado, plazo, antes)
    print("ok  editable")


def test_estados():
    """Los conjuntos de estados tienen que seguir hablando del mismo universo:
    una lista que se queda atrás deja un estado que nadie cierra ni libera."""
    for grupo in (ESTADOS_ADMIN, ESTADOS_ABIERTOS, ESTADOS_QUE_OCUPAN):
        assert set(grupo) <= set(ESTADOS)
    # El panel no pone los dos que no son suyos.
    assert "cancelado" not in ESTADOS_ADMIN and "en_revision" not in ESTADOS_ADMIN
    # Lo terminado no está abierto, y lo abierto no está terminado.
    assert set(ESTADOS_ABIERTOS) == {"pendiente", "en_curso", "en_revision"}
    # Bajarse libera el horario; lo cerrado lo sigue ocupando, porque se sirvió.
    assert "cancelado" not in ESTADOS_QUE_OCUPAN and "rechazado" not in ESTADOS_QUE_OCUPAN
    assert "cerrado" in ESTADOS_QUE_OCUPAN and "en_revision" in ESTADOS_QUE_OCUPAN
    print("ok  estados")


def test_cancelable():
    """Cancelar no mira el plazo: solo que la solicitud siga abierta."""
    for estado in ESTADOS_ABIERTOS:
        assert cancelable(estado)
    for estado in ("cancelado", "rechazado", "cerrado"):
        assert not cancelable(estado)
    print("ok  cancelable")


def test_cancelacion_tardia():
    """La ventana de 24 h no impide cancelar: solo marca lo que el casino cobra
    igual. Se mide contra el inicio del servicio, en hora de Chile."""
    zona = "America/Santiago"
    servicio, inicio = date(2026, 9, 28), time(13, 0)
    # 28-09-2026 13:00 en Chile (UTC-3 en primavera) = 16:00 UTC.
    limite = datetime(2026, 9, 27, 16, tzinfo=timezone.utc)   # justo 24 h antes
    assert not cancelacion_tardia(servicio, inicio, limite, zona)
    assert not cancelacion_tardia(servicio, inicio, limite - timedelta(hours=1), zona)
    assert cancelacion_tardia(servicio, inicio, limite + timedelta(seconds=1), zona)
    # Ya empezado el servicio, por supuesto que se cobra.
    assert cancelacion_tardia(servicio, inicio, limite + timedelta(days=1), zona)
    # Sin tramo guardado (tickets anteriores a Outlook) se mide contra el
    # comienzo del día: quedarse corto es preferible a cobrar de más. El evento
    # pasa a empezar el 28-09 00:00 de Chile, así que la ventana abre el 27-09
    # 00:00 (= 03:00 UTC), trece horas antes que con el tramo de las 13:00.
    sin_tramo = datetime(2026, 9, 27, 3, tzinfo=timezone.utc)
    assert not cancelacion_tardia(servicio, None, sin_tramo, zona)
    assert cancelacion_tardia(servicio, None, sin_tramo + timedelta(seconds=1), zona)
    # A esa misma hora, con tramo a las 13:00 todavía queda margen.
    assert not cancelacion_tardia(servicio, inicio, sin_tramo + timedelta(seconds=1), zona)
    # La ventana es configurable: con 48 h, lo que antes estaba a tiempo ya no.
    assert cancelacion_tardia(servicio, inicio, limite, zona, horas=48)
    print("ok  cancelacion tardia")


def test_cierre_automatico():
    """Se cierra el día siguiente al servicio, no el mismo día: mientras el día
    corre, el servicio todavía puede estar ocurriendo."""
    servicio = date(2026, 9, 28)
    assert not cierra_automaticamente("pendiente", servicio, servicio)
    assert cierra_automaticamente("pendiente", servicio, date(2026, 9, 29))
    # Alcanza a todo lo que quedó abierto, revisión incluida.
    for estado in ESTADOS_ABIERTOS:
        assert cierra_automaticamente(estado, servicio, date(2026, 9, 29))
    # Lo que ya terminó no se toca: cerrar algo cancelado borraría por qué murió.
    for estado in ("cancelado", "rechazado", "cerrado"):
        assert not cierra_automaticamente(estado, servicio, date(2026, 10, 30))
    print("ok  cierre automatico")


def test_mime():
    assert mime_de_imagen(b"\x89PNG\r\n\x1a\n...") == "image/png"
    assert mime_de_imagen(b"\xff\xd8\xff\xe0...") == "image/jpeg"
    assert mime_de_imagen(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "image/webp"
    assert mime_de_imagen(b"<svg onload=alert(1)>") is None   # SVG fuera
    assert mime_de_imagen(b"<html>") is None
    assert mime_de_imagen(b"") is None
    print("ok  mime")


def test_jwt_separado():
    from jose import JWTError, jwt

    secreto = "secreto-plataforma"
    token = jwt.encode({"sub": "admin", "token_type": "tickets"}, clave_jwt(secreto), algorithm="HS256")
    try:
        jwt.decode(token, secreto, algorithms=["HS256"])
    except JWTError:
        pass
    else:
        raise AssertionError("un token del portal no puede validar con la clave de la plataforma")
    print("ok  jwt separado")


def test_dominio():
    cfg = TicketsSettings(dominios="cramer.cl")
    assert cfg.dominio_permitido("Juan@Cramer.cl ")
    assert not cfg.dominio_permitido("juan@cramer.cl.evil.com")
    assert not cfg.dominio_permitido("juan@gmail.com")
    assert not cfg.dominio_permitido("cramer.cl")
    print("ok  dominio")


def test_slug_libre():
    from app.modules.tickets.service import slug_libre

    class _Db:
        """Simula la tabla: .first() devuelve algo si el slug consultado ya existe."""
        def __init__(self, ocupados):
            self.ocupados, self.pedido = set(ocupados), None
        def query(self, *_):
            return self
        def filter(self, cond):
            self.pedido = cond.right.value
            return self
        def first(self):
            return 1 if self.pedido in self.ocupados else None

    assert slug_libre(_Db([]), "Almuerzos Área Técnica") == "almuerzos-area-tecnica"
    assert slug_libre(_Db(["almuerzos", "almuerzos-2"]), "Almuerzos") == "almuerzos-3"
    assert slug_libre(_Db([]), "¡¡¡") == "tipo"
    print("ok  slug_libre")


def test_aviso_de_cambio():
    assert aviso_de_cambio("pendiente", "activo") == "usuario_aprobado"
    assert aviso_de_cambio("rechazado", "activo") == "usuario_aprobado"  # el admin se arrepintió
    assert aviso_de_cambio("pendiente", "rechazado") == "usuario_rechazado"
    # Dar de baja o reactivar una cuenta ya usada no es respuesta a una solicitud.
    assert aviso_de_cambio("activo", "inactivo") is None
    assert aviso_de_cambio("inactivo", "activo") is None
    assert aviso_de_cambio("activo", "rechazado") is None
    assert aviso_de_cambio("activo", "activo") is None
    print("ok  aviso de cambio")


def test_id_de_servicio():
    assert id_de_servicio("srv:12") == 12
    # Las opciones de texto libre de siempre no son servicios.
    assert id_de_servicio("Opción 1") is None
    assert id_de_servicio("srv:") is None
    assert id_de_servicio("srv:abc") is None
    assert id_de_servicio("srv:-1") is None  # el '-' no es dígito: no hay ids negativos
    assert id_de_servicio(None) is None
    assert id_de_servicio(12) is None  # un número suelto no referencia al catálogo
    print("ok  id_de_servicio")


def test_servicios_respondidos():
    datos = {
        "coffee": "srv:3",
        "extras": ["srv:7", "Sin azúcar", "srv:3"],  # repetido: una sola vez
        "comentario": "texto libre",
        "personas": 5,
    }
    assert servicios_respondidos(datos) == [3, 7]
    assert servicios_respondidos({}) == []
    assert servicios_respondidos(None) == []
    print("ok  servicios_respondidos")


def test_cantidad_de():
    assert cantidad_de({"personas": 5}, "personas") == 5
    assert cantidad_de({"personas": "12"}, "personas") == 12
    assert cantidad_de({"personas": "5.0"}, "personas") == 5
    # Sin pregunta marcada se cobra una vez.
    assert cantidad_de({"personas": 5}, None) == 1
    # Respuesta inservible: cobrar de menos antes que inventar el multiplicador.
    assert cantidad_de({"personas": "muchas"}, "personas") == 1
    assert cantidad_de({"personas": 0}, "personas") == 1
    assert cantidad_de({"personas": -3}, "personas") == 1
    assert cantidad_de({}, "personas") == 1
    print("ok  cantidad_de")


def test_calcular_costo():
    tarifas = {
        4: {"nombre": "Coffee Básico", "modo": "cantidad", "valor": 3500},
        7: {"nombre": "Arriendo sala", "modo": "fijo", "valor": 25000},
        9: {"nombre": "Sin tarifa", "modo": "fijo", "valor": None},
    }
    # 'cantidad' multiplica; 'fijo' se cobra una vez, con la misma respuesta.
    c = calcular_costo({"coffee": "srv:4", "sala": "srv:7", "personas": 5}, tarifas, "personas")
    assert c["total"] == 3500 * 5 + 25000
    assert [l["subtotal"] for l in c["lineas"]] == [17500, 25000]
    assert [l["cantidad"] for l in c["lineas"]] == [5, 1]

    # Sin pregunta de cantidad marcada, lo 'cantidad' se cobra una vez.
    assert calcular_costo({"coffee": "srv:4", "personas": 5}, tarifas, None)["total"] == 3500

    # Un servicio sin precio vigente se omite en vez de inventar tarifa.
    assert calcular_costo({"x": "srv:9"}, tarifas, None) is None
    c = calcular_costo({"x": "srv:9", "y": "srv:7"}, tarifas, None)
    assert c["total"] == 25000 and len(c["lineas"]) == 1

    # Un servicio que no está en el catálogo tampoco rompe.
    assert calcular_costo({"x": "srv:999"}, tarifas, None) is None

    # Sin servicios no hay costo: None, que no es lo mismo que total 0.
    assert calcular_costo({"texto": "nada"}, tarifas, None) is None
    assert calcular_costo({}, tarifas, None) is None

    # Un servicio que vale 0 sí produce costo, con total 0.
    c = calcular_costo({"x": "srv:1"}, {1: {"nombre": "Gratis", "modo": "fijo", "valor": 0}}, None)
    assert c is not None and c["total"] == 0

    # Checkbox: varios servicios en una sola respuesta.
    c = calcular_costo({"extras": ["srv:4", "srv:7"], "personas": 2}, tarifas, "personas")
    assert c["total"] == 3500 * 2 + 25000
    print("ok  calcular_costo")


def test_plazo_de_emergencia():
    plazo = datetime(2026, 10, 6, 12, 0, tzinfo=timezone.utc)
    mas_tarde = datetime(2026, 10, 8, 12, 0, tzinfo=timezone.utc)
    antes = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)

    assert plazo_efectivo(plazo, None) == plazo
    assert plazo_efectivo(plazo, mas_tarde) == mas_tarde
    # Abrir una emergencia no puede acortar el plazo que ya regía.
    assert plazo_efectivo(plazo, antes) == plazo

    justo_despues = datetime(2026, 10, 6, 12, 1, tzinfo=timezone.utc)
    # Vencido el plazo normal, la emergencia lo reabre.
    assert editable("pendiente", plazo, justo_despues) is False
    assert editable("pendiente", plazo, justo_despues, emergencia=mas_tarde) is True
    # La emergencia también alcanza a lo que el admin ya tomó: lo que el
    # usuario manda es una propuesta, y el admin la resuelve igual.
    assert editable("en_curso", plazo, justo_despues, emergencia=mas_tarde) is True
    # Pero no revive una solicitud que ya terminó.
    for estado in ("cancelado", "rechazado", "cerrado"):
        assert editable(estado, plazo, justo_despues, emergencia=mas_tarde) is False
    print("ok  plazo de emergencia")


def test_una_propuesta_a_la_vez():
    plazo = datetime(2026, 10, 6, 12, 0, tzinfo=timezone.utc)
    dentro = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)

    assert editable("pendiente", plazo, dentro) is True
    # Con una propuesta esperando respuesta no se admite otra.
    assert editable("pendiente", plazo, dentro, propuesta_pendiente=True) is False
    print("ok  una propuesta a la vez")


def test_reserva_de_sala():
    """Qué evento de Outlook cuenta como reserva de sala y cómo se parte."""
    from app.modules.tickets.calendario import _es_reserva_de_sala, _reserva

    con_sala = {
        "id": "AAA", "subject": "Comité",
        "locations": [{"displayName": "Sala Andes", "locationType": "conferenceRoom"}],
        "start": {"dateTime": "2026-10-20T09:30:00.0000000"},
        "end": {"dateTime": "2026-10-20T11:00:00.0000000"},
    }
    cruza_medianoche = {
        "id": "BBB", "subject": "Inducción",
        "locations": [{"displayName": "Sala Lircay", "locationType": "conferenceRoom"}],
        "start": {"dateTime": "2026-10-21T23:00:00.0000000"},
        "end": {"dateTime": "2026-10-22T01:00:00.0000000"},
    }
    # Teams trae ubicación y hasta `location.displayName`, pero no es una sala.
    teams = {
        "id": "CCC", "subject": "Webinar",
        "location": {"displayName": "Reunión de Microsoft Teams"},
        "locations": [{"displayName": "Reunión de Microsoft Teams", "locationType": "default"}],
        "start": {"dateTime": "2026-10-20T09:00:00.0000000"},
        "end": {"dateTime": "2026-10-20T09:30:00.0000000"},
    }
    # Invitar el buzón de la sala sin que Graph la promueva a `locations` no basta.
    solo_recurso = {
        "id": "DDD", "subject": "1:1",
        "attendees": [{"type": "resource", "emailAddress": {"name": "Sala Lircay"}}],
        "start": {"dateTime": "2026-10-20T15:00:00.0000000"},
        "end": {"dateTime": "2026-10-20T16:00:00.0000000"},
    }

    assert _es_reserva_de_sala(con_sala) is True
    # Sin una sala en `locations` no hay bloque que ofrecer.
    assert _es_reserva_de_sala(teams) is False
    assert _es_reserva_de_sala(solo_recurso) is False

    r = _reserva(con_sala)
    assert r["sala"] == "Sala Andes"
    assert (r["fecha"], r["hora_inicio"], r["hora_fin"]) == (date(2026, 10, 20), time(9, 30), time(11, 0))
    assert r["multidia"] is False
    # Cruzar la medianoche no define el día del servicio: queda marcada.
    assert _reserva(cruza_medianoche)["multidia"] is True
    print("ok  reserva de sala")


def test_tramo_del_servicio():
    """El tramo pedido tiene que caber en la reserva, y ser un tramo."""
    from fastapi import HTTPException
    from app.modules.tickets.service import _campos_de_reserva

    reserva = {
        "id": "AAA", "asunto": "Comité", "sala": "Auditorio",
        "fecha": date(2026, 10, 22), "hora_inicio": time(15, 30), "hora_fin": time(16, 30),
        "multidia": False,
    }

    campos = _campos_de_reserva(reserva, time(15, 30), time(16, 0))
    # El bloque de la reserva y el tramo pedido se guardan por separado.
    assert (campos["hora_inicio"], campos["hora_fin"]) == (time(15, 30), time(16, 30))
    assert (campos["servicio_inicio"], campos["servicio_fin"]) == (time(15, 30), time(16, 0))

    def rechaza(inicio, fin):
        try:
            _campos_de_reserva(reserva, inicio, fin)
        except HTTPException as e:
            return e.status_code == 400
        return False

    assert rechaza(time(15, 0), time(16, 0))   # empieza antes de la reserva
    assert rechaza(time(16, 0), time(17, 0))   # termina después
    assert rechaza(time(16, 0), time(16, 0))   # no es un tramo
    assert rechaza(time(16, 0), time(15, 45))  # al revés
    print("ok  tramo del servicio")



def test_tramos_que_se_pisan():
    """Dos servicios del mismo usuario no pueden compartir horario."""
    # Pedido: 12:00 a 13:00. Lo que choca y lo que no.
    assert se_solapan(time(12, 30), time(13, 0), time(12, 0), time(13, 0))
    assert se_solapan(time(11, 0), time(12, 30), time(12, 0), time(13, 0))
    # Tocarse en el borde no es pisarse: uno termina donde el otro empieza.
    assert not se_solapan(time(10, 0), time(12, 0), time(12, 0), time(13, 0))
    assert not se_solapan(time(13, 0), time(14, 0), time(12, 0), time(13, 0))
    # Uno contenido en el otro, en los dos sentidos.
    assert se_solapan(time(12, 15), time(12, 30), time(12, 0), time(13, 0))
    assert se_solapan(time(10, 0), time(14, 0), time(12, 0), time(13, 0))
    print("ok  tramos que se pisan")


def test_lo_que_queda_libre():
    """El mensaje de error dice dónde sí se puede pedir, no solo qué choca."""
    bloque = (time(10, 0), time(13, 0))
    # El caso del ejemplo: con 12:00-13:00 tomado, queda 10:00 a 12:00.
    assert huecos_libres(*bloque, [(time(12, 0), time(13, 0))]) == [(time(10, 0), time(12, 0))]
    # Un tramo al medio parte el bloque en dos huecos.
    assert huecos_libres(*bloque, [(time(11, 0), time(12, 0))]) == [
        (time(10, 0), time(11, 0)), (time(12, 0), time(13, 0)),
    ]
    # Desordenados y superpuestos entre ellos: se funden, no se cuentan dos veces.
    assert huecos_libres(*bloque, [(time(12, 0), time(13, 0)), (time(11, 30), time(12, 30))]) == [
        (time(10, 0), time(11, 30)),
    ]
    # Bloque entero tomado: no queda nada que ofrecer.
    assert huecos_libres(*bloque, [(time(9, 0), time(14, 0))]) == []
    # Sin nada pedido, el bloque completo está libre.
    assert huecos_libres(*bloque, []) == [bloque]
    print("ok  lo que queda libre")


def test_disponibilidad_de_la_reserva():
    """Lo que el portal pinta en cada reserva, y qué cambia al editar un ticket."""
    bloque = (time(10, 0), time(13, 0))
    # Tramos del usuario ese día en esa sala: uno dentro de esta reunión y otro
    # de otra reunión más tarde, que no tiene por qué ensuciar este bloque.
    propio = (time(12, 0), time(13, 0))
    otra_reunion = (time(15, 0), time(16, 0))

    ocupados, libres = disponibilidad_del_bloque(*bloque, [otra_reunion, propio])
    assert ocupados == [propio]
    assert libres == [(time(10, 0), time(12, 0))]

    # Editando ese mismo ticket, su tramo no viene en la lista (el service lo
    # saca con `excluir_ticket`): la reserva vuelve a estar entera disponible y
    # el usuario puede mover el servicio sin chocar consigo mismo.
    assert disponibilidad_del_bloque(*bloque, [otra_reunion]) == ([], [bloque])

    # Un tramo que empieza donde termina el bloque no lo toca: 13:00 cierra uno
    # y abre el otro.
    assert disponibilidad_del_bloque(*bloque, [(time(13, 0), time(14, 0))]) == ([], [bloque])

    # Lo ocupado sale ordenado aunque la consulta lo devuelva en cualquier orden.
    revueltos = [(time(12, 0), time(12, 30)), (time(10, 30), time(11, 0))]
    assert disponibilidad_del_bloque(*bloque, revueltos)[0] == sorted(revueltos)
    print("ok  disponibilidad de la reserva")


if __name__ == "__main__":
    test_plazo()
    test_editable()
    test_estados()
    test_cancelable()
    test_cancelacion_tardia()
    test_cierre_automatico()
    test_mime()
    test_jwt_separado()
    test_dominio()
    test_slug_libre()
    test_aviso_de_cambio()
    test_id_de_servicio()
    test_servicios_respondidos()
    test_cantidad_de()
    test_calcular_costo()
    test_plazo_de_emergencia()
    test_una_propuesta_a_la_vez()
    test_reserva_de_sala()
    test_tramo_del_servicio()
    test_tramos_que_se_pisan()
    test_lo_que_queda_libre()
    test_disponibilidad_de_la_reserva()
