"""Self-check del módulo de formularios: allowlist del webhook y un-solo-uso del token.

Las dos partes son las rutas de seguridad del módulo. La primera es pura y
corre siempre; la segunda necesita Postgres y la migración 017 aplicada, y se
salta sola si no hay base.

Ejecutar dentro del contenedor backend:
    python -m tests.test_formularios_token
"""

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


def test_webhook_bearer():
    """El header va cuando hay token y no va cuando no lo hay.

    Es la única barrera del webhook, y el modo sin token es silencioso desde
    afuera (el POST sale igual), así que se afirman los dos casos.
    """
    import httpx

    from app.modules.formularios import service

    llamadas = []

    class RespFalsa:
        status_code = 200

    def post_falso(url, **kwargs):
        llamadas.append(kwargs)
        return RespFalsa()

    original_post, original_token = httpx.post, service.form_settings.n8n_token
    try:
        httpx.post = post_falso

        service.form_settings.n8n_token = "s3creto"
        assert service.enviar_a_n8n("https://n8n.cramer.cl/w", {"a": 1})
        assert llamadas[-1]["headers"] == {"Authorization": "Bearer s3creto"}, llamadas[-1]

        service.form_settings.n8n_token = ""
        assert service.enviar_a_n8n("https://n8n.cramer.cl/w", {"a": 1})
        assert llamadas[-1]["headers"] is None, llamadas[-1]

        # Sin URL no se llama a nadie.
        assert not service.enviar_a_n8n("", {"a": 1})
        assert len(llamadas) == 2
    finally:
        httpx.post = original_post
        service.form_settings.n8n_token = original_token
    print("ok  webhook bearer")


def test_token_reutilizable():
    """Vale hasta que vence, no hasta el primer uso.

    El token dejó de quemarse con el primer submit: el trabajador puede corregir
    su respuesta. Lo que sí sigue cerrado es el token de otro formulario, el
    vencido y el inexistente.
    """
    from sqlalchemy import text

    from app.db.session import SessionLocal
    from app.modules.formularios import repository as repo
    from app.modules.formularios.models import Formulario

    try:
        db = SessionLocal()
        db.execute(text("SELECT 1 FROM app.form_tokens LIMIT 1"))
    except Exception as e:
        print(f"skip token reutilizable (sin base o sin migraciones 017-019: {e})")
        return

    a = Formulario(slug="_selfcheck_a", titulo="A", definicion={"pages": []}, activo=True)
    b = Formulario(slug="_selfcheck_b", titulo="B", definicion={"pages": []}, activo=True)
    db.add_all([a, b])
    db.commit()

    try:
        t = repo.crear_token_envio(
            db, a.id, "12.345.678-9", "quien@cramer.cl", ttl_horas=72, enviado_por="selfcheck"
        )
        assert repo.token_vigente(db, t, a.id)

        # De otro formulario: no sirve aunque el token exista.
        assert repo.usar_token(db, t, b.id) is None

        # Primer uso: entrega el RUT normalizado y marca used_at.
        assert repo.usar_token(db, t, a.id) == "123456789"
        primera = db.execute(
            text("SELECT used_at FROM app.form_tokens WHERE token = :t"), {"t": t}
        ).scalar()
        assert primera is not None

        # Segundo uso: sigue sirviendo, porque ahora se puede editar.
        assert repo.usar_token(db, t, a.id) == "123456789"
        assert repo.token_vigente(db, t, a.id)

        # used_at no se pisa: es la fecha de la PRIMERA respuesta.
        assert db.execute(
            text("SELECT used_at FROM app.form_tokens WHERE token = :t"), {"t": t}
        ).scalar() == primera

        # Cada respuesta guardada sube la versión y no borra la anterior.
        repo.guardar_respuesta(db, a.id, t, "123456789", {"p": "uno"}, None)
        db.commit()
        repo.guardar_respuesta(db, a.id, t, "123456789", {"p": "dos"}, None)
        db.commit()
        vigente = repo.respuesta_vigente(db, t)
        assert vigente["version"] == 2, vigente
        assert vigente["datos"] == {"p": "dos"}, vigente
        assert db.execute(
            text("SELECT COUNT(*) FROM app.form_respuestas WHERE token = :t"), {"t": t}
        ).scalar() == 2

        # Expirado.
        t2 = repo.crear_token_envio(
            db, a.id, "12345678-9", "quien@cramer.cl", ttl_horas=72, enviado_por="selfcheck"
        )
        # El vencimiento se mueve con el reloj de Postgres, que es el mismo con
        # el que se compara: Python y la base no están en la misma zona.
        db.execute(
            text("UPDATE app.form_tokens SET expira_at = NOW() - interval '1 minute' WHERE token = :t"),
            {"t": t2},
        )
        db.commit()
        assert not repo.token_vigente(db, t2, a.id)
        assert repo.usar_token(db, t2, a.id) is None

        # Inexistente.
        assert repo.usar_token(db, "no-existe", a.id) is None
        print("ok  token reutilizable y respuestas versionadas")
    finally:
        db.execute(text("DELETE FROM app.formularios WHERE slug IN ('_selfcheck_a', '_selfcheck_b')"))
        db.commit()
        db.close()


if __name__ == "__main__":
    test_webhook_allowlist()
    test_limpiar_rut()
    test_webhook_bearer()
    test_token_reutilizable()
    print("todo ok")
