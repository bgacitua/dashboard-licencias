"""Acceso a datos del módulo. Lo único que se lee fuera de `app` es rh.employees."""
import re
import secrets
from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from .models import Formulario, FormRespuesta, FormToken


def limpiar_rut(value: object) -> str:
    """RUT comparable: sin puntos ni guión, dígito verificador en minúscula."""
    return re.sub(r"[^0-9kK]", "", str(value or "")).lower()


def rut_en_nomina(db: Session, rut: str) -> bool:
    """¿Existe el RUT en rh.employees? Se normaliza a ambos lados porque la
    columna guarda el formato de Buk y el usuario escribe como quiere."""
    limpio = limpiar_rut(rut)
    if not limpio:
        return False
    row = db.execute(
        text("""
            SELECT 1
            FROM rh.employees
            WHERE lower(regexp_replace(rut, '[^0-9kK]', '', 'g')) = :rut
            LIMIT 1
        """),
        {"rut": limpio},
    ).first()
    return row is not None


def get_por_slug(db: Session, slug: str) -> Formulario | None:
    return db.query(Formulario).filter(Formulario.slug == slug).first()


def crear_token(db: Session, formulario_id: int, rut: str, ttl_min: int) -> str:
    token = secrets.token_urlsafe(32)
    db.add(FormToken(
        token=token,
        formulario_id=formulario_id,
        rut=limpiar_rut(rut),
        expira_at=datetime.now() + timedelta(minutes=ttl_min),
    ))
    db.commit()
    return token


def token_vigente(db: Session, token: str, formulario_id: int) -> bool:
    """Solo lectura, para abrir el formulario. No consume el token."""
    row = db.execute(
        text("""
            SELECT 1 FROM app.form_tokens
            WHERE token = :t AND formulario_id = :f
              AND used_at IS NULL AND expira_at > NOW()
        """),
        {"t": token, "f": formulario_id},
    ).first()
    return row is not None


def consumir_token(db: Session, token: str, formulario_id: int) -> str | None:
    """Marca el token como usado y devuelve el RUT, o None si no era usable.

    El UPDATE condicional ES el un-solo-uso: dos submits concurrentes compiten
    por la misma fila y solo uno ve `used_at IS NULL`. Un SELECT seguido de un
    UPDATE dejaría pasar los dos.
    """
    row = db.execute(
        text("""
            UPDATE app.form_tokens
               SET used_at = NOW()
             WHERE token = :t AND formulario_id = :f
               AND used_at IS NULL AND expira_at > NOW()
         RETURNING rut
        """),
        {"t": token, "f": formulario_id},
    ).first()
    return row[0] if row else None


def guardar_respuesta(
    db: Session, formulario_id: int, token: str, rut: str | None, datos: dict, ip: str | None
) -> FormRespuesta:
    r = FormRespuesta(
        formulario_id=formulario_id, token=token, rut=rut, datos=datos, ip=ip
    )
    db.add(r)
    return r


def marcar_n8n(db: Session, respuesta_id: int, ok: bool) -> None:
    db.execute(
        text("UPDATE app.form_respuestas SET n8n_ok = :ok WHERE id = :id"),
        {"ok": ok, "id": respuesta_id},
    )
    db.commit()
