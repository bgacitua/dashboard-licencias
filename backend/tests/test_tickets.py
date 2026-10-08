"""Self-check del módulo de tickets: plazo, editable, sniff de imágenes y
separación del JWT del portal respecto del de la plataforma.

Todo puro, no necesita base. Ejecutar:
    python -m tests.test_tickets
"""
from datetime import date, datetime, time, timedelta, timezone

from app.modules.tickets.config import TicketsSettings
from app.modules.tickets.logica import (
    aviso_de_cambio, calcular_costo, calcular_plazo, cantidad_de, clave_jwt, editable,
    id_de_servicio, mime_de_imagen, plazo_efectivo, servicios_respondidos,
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
    for estado in ("en_curso", "rechazado", "cerrado"):
        assert not editable(estado, plazo, antes)
    print("ok  editable")


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
    # Pero no revive un ticket que ya dejó de ser del usuario.
    assert editable("en_curso", plazo, justo_despues, emergencia=mas_tarde) is False
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


if __name__ == "__main__":
    test_plazo()
    test_editable()
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
