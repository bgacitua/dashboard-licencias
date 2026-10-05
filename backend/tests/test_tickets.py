"""Self-check del módulo de tickets: plazo, editable, sniff de imágenes y
separación del JWT del portal respecto del de la plataforma.

Todo puro, no necesita base. Ejecutar:
    python -m tests.test_tickets
"""
from datetime import date, datetime, time, timedelta, timezone

from app.modules.tickets.config import TicketsSettings
from app.modules.tickets.logica import (
    aviso_de_cambio, calcular_plazo, cantidad_de, clave_jwt, editable, id_de_servicio,
    mime_de_imagen, servicios_respondidos,
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
