"""Self-check del módulo de formularios: allowlist del webhook y un-solo-uso del token.

Las dos partes son las rutas de seguridad del módulo. La primera es pura y
corre siempre; la segunda necesita Postgres y la migración 017 aplicada, y se
salta sola si no hay base.

Ejecutar dentro del contenedor backend:
    python -m tests.test_formularios_token
"""

from datetime import datetime, timedelta

from app.modules.formularios.config import FormulariosSettings
from app.modules.formularios.repository import limpiar_rut


def test_webhook_allowlist():
    cfg = FormulariosSettings(n8n_hosts="n8n.cramer.cl, otro.example.com")

    assert cfg.webhook_permitido("https://n8n.cramer.cl/webhook/abc")
    assert cfg.webhook_permitido("https://OTRO.example.com/webhook/abc")  # host case-insensitive

    assert not cfg.webhook_permitido("http://n8n.cramer.cl/webhook/abc")   # sin TLS
    assert not cfg.webhook_permitido("https://evil.com/webhook")           # fuera de la lista
    assert not cfg.webhook_permitido("https://n8n.cramer.cl.evil.com/x")   # sufijo, no el host
    assert not cfg.webhook_permitido("http://169.254.169.254/latest/meta") # metadata de la VPS
    assert not cfg.webhook_permitido("file:///etc/passwd")
    assert not cfg.webhook_permitido("")

    # Sin allowlist configurada no pasa nada: el default no puede ser abierto.
    assert not FormulariosSettings(n8n_hosts="").webhook_permitido("https://n8n.cramer.cl/w")
    print("ok  webhook allowlist")


def test_limpiar_rut():
    assert limpiar_rut("12.345.678-9") == "123456789"
    assert limpiar_rut("12345678-K") == "12345678k"
    assert limpiar_rut("  12345678k ") == "12345678k"
    assert limpiar_rut(None) == ""
    assert limpiar_rut("'; DROP TABLE app.formularios; --") == ""
    print("ok  limpiar_rut")


def test_token_un_solo_uso():
    """Válido → consume; ya usado, expirado y de otro formulario → None."""
    from sqlalchemy import text

    from app.db.session import SessionLocal
    from app.modules.formularios import repository as repo
    from app.modules.formularios.models import Formulario

    try:
        db = SessionLocal()
        db.execute(text("SELECT 1 FROM app.form_tokens LIMIT 1"))
    except Exception as e:
        print(f"skip token un-solo-uso (sin base o sin migración 017: {e})")
        return

    a = Formulario(slug="_selfcheck_a", titulo="A", definicion={"pages": []}, activo=True)
    b = Formulario(slug="_selfcheck_b", titulo="B", definicion={"pages": []}, activo=True)
    db.add_all([a, b])
    db.commit()

    try:
        t = repo.crear_token(db, a.id, "12.345.678-9", ttl_min=15)
        assert repo.token_vigente(db, t, a.id)

        # De otro formulario: no sirve aunque el token exista.
        assert repo.consumir_token(db, t, b.id) is None
        # Primer uso: entrega el RUT normalizado.
        assert repo.consumir_token(db, t, a.id) == "123456789"
        # Segundo uso: nada. Esto es el un-solo-uso.
        assert repo.consumir_token(db, t, a.id) is None
        assert not repo.token_vigente(db, t, a.id)

        # Expirado.
        t2 = repo.crear_token(db, a.id, "12345678-9", ttl_min=15)
        db.execute(
            text("UPDATE app.form_tokens SET expira_at = :e WHERE token = :t"),
            {"e": datetime.now() - timedelta(minutes=1), "t": t2},
        )
        db.commit()
        assert not repo.token_vigente(db, t2, a.id)
        assert repo.consumir_token(db, t2, a.id) is None

        # Inexistente.
        assert repo.consumir_token(db, "no-existe", a.id) is None
        print("ok  token un-solo-uso")
    finally:
        db.execute(text("DELETE FROM app.formularios WHERE slug IN ('_selfcheck_a', '_selfcheck_b')"))
        db.commit()
        db.close()


if __name__ == "__main__":
    test_webhook_allowlist()
    test_limpiar_rut()
    test_token_un_solo_uso()
    print("todo ok")
