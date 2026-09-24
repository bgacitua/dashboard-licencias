"""Self-check del módulo de tickets: plazo, editable, sniff de imágenes y
separación del JWT del portal respecto del de la plataforma.

Todo puro, no necesita base. Ejecutar:
    python -m tests.test_tickets
"""
from datetime import date, datetime, time, timedelta, timezone

from app.modules.tickets.config import TicketsSettings
from app.modules.tickets.logica import aviso_de_cambio, calcular_plazo, clave_jwt, editable, mime_de_imagen


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


if __name__ == "__main__":
    test_plazo()
    test_editable()
    test_mime()
    test_jwt_separado()
    test_dominio()
    test_slug_libre()
    test_aviso_de_cambio()
