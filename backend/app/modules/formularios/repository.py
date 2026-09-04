"""Acceso a datos del módulo. Lo único que se lee fuera de `app` es rh.employees."""
import re
import secrets

from sqlalchemy import text
from sqlalchemy.orm import Session

from .models import Formulario, FormRespuesta


def limpiar_rut(value: object) -> str:
    """RUT comparable: sin puntos ni guión, dígito verificador en minúscula."""
    return re.sub(r"[^0-9kK]", "", str(value or "")).lower()


def rut_en_nomina(db: Session, rut: str) -> bool:
    """¿Existe el RUT en rh.employees y sigue activo?

    Se normaliza a ambos lados porque la columna guarda el formato de Buk y el
    usuario escribe como quiere. El filtro por `status` importa: sin él un
    exempleado sigue pudiendo abrir formularios internos, y el gate confirma
    desde afuera que esa persona alguna vez trabajó acá.
    """
    limpio = limpiar_rut(rut)
    if not limpio:
        return False
    row = db.execute(
        text("""
            SELECT 1
            FROM rh.employees
            WHERE lower(regexp_replace(rut, '[^0-9kK]', '', 'g')) = :rut
              AND status = 'activo'
            LIMIT 1
        """),
        {"rut": limpio},
    ).first()
    return row is not None


def get_por_slug(db: Session, slug: str) -> Formulario | None:
    return db.query(Formulario).filter(Formulario.slug == slug).first()


def crear_token(db: Session, formulario_id: int, rut: str, ttl_min: int) -> str:
    """El vencimiento lo calcula Postgres, no Python.

    La columna es TIMESTAMP sin zona y las validaciones comparan contra NOW():
    con un datetime.now() del contenedor (UTC) contra un NOW() del servidor
    (America/Santiago) el TTL real sería de 15 min más el desfase horario.
    """
    token = secrets.token_urlsafe(32)
    db.execute(
        text("""
            INSERT INTO app.form_tokens (token, formulario_id, rut, expira_at)
            VALUES (:t, :f, :r, NOW() + make_interval(mins => :ttl))
        """),
        {"t": token, "f": formulario_id, "r": limpiar_rut(rut), "ttl": ttl_min},
    )
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


def respuestas_de(db: Session, formulario_id: int, limit: int) -> list[dict]:
    """Respuestas de un formulario, con el nombre de quien respondió y las fechas.

    El nombre sale de rh.employees y las fechas de form_tokens: `created_at` del
    token es cuándo se generó el enlace y `used_at` cuándo se respondió. Ambos
    LEFT JOIN: una respuesta sobrevive a que el trabajador salga de la nómina o
    a que se limpien tokens viejos, y en ese caso se muestra sin adorno.
    """
    rows = db.execute(
        text("""
            SELECT
                r.id,
                r.formulario_id,
                r.rut,
                r.datos,
                r.n8n_ok,
                r.created_at,
                e.full_name AS nombre,
                t.created_at AS fecha_envio,
                t.used_at    AS fecha_respuesta
            FROM app.form_respuestas r
            LEFT JOIN app.form_tokens t ON t.token = r.token
            -- DISTINCT ON: rh.employees trae una fila por contrato, así que un
            -- join directo duplicaría la respuesta tantas veces como contratos
            -- tenga esa persona.
            LEFT JOIN (
                SELECT DISTINCT ON (lower(regexp_replace(rut, '[^0-9kK]', '', 'g')))
                       lower(regexp_replace(rut, '[^0-9kK]', '', 'g')) AS rut_limpio,
                       full_name
                FROM rh.employees
                ORDER BY 1, status = 'activo' DESC, id DESC
            ) e ON e.rut_limpio = r.rut
            WHERE r.formulario_id = :fid
            ORDER BY r.created_at DESC
            LIMIT :limit
        """),
        {"fid": formulario_id, "limit": limit},
    ).mappings().all()
    return [dict(r) for r in rows]


def conteo_respuestas(db: Session) -> dict[int, int]:
    """{formulario_id: respuestas}. Una query para todo el listado, no una por fila."""
    rows = db.execute(
        text("""
            SELECT formulario_id, COUNT(*) AS n
            FROM app.form_respuestas
            GROUP BY formulario_id
        """)
    ).all()
    return {fid: n for fid, n in rows}


def buscar_personas(db: Session, q: str, limit: int = 20) -> list[dict]:
    """Trabajadores activos que calzan con `q` por nombre o RUT.

    Devuelve nombre, RUT y correo, nada más: es la base de datos de personal y
    lo que no se necesita para elegir a quién enviarle no tiene por qué salir
    de la tabla. DISTINCT ON deja una fila por persona aunque tenga varios
    contratos.
    """
    limpio = limpiar_rut(q)
    rows = db.execute(
        text("""
            SELECT DISTINCT ON (rut_limpio) rut_limpio, rut, full_name, email
            FROM (
                SELECT
                    lower(regexp_replace(rut, '[^0-9kK]', '', 'g')) AS rut_limpio,
                    rut, full_name, email, status, id
                FROM rh.employees
                WHERE status = 'activo'
            ) e
            -- translate() y no unaccent(): esa extensión no está instalada en
            -- la base y buscar "jose" tiene que encontrar a "José".
            WHERE (:q <> '' AND translate(lower(full_name), 'áéíóúñü', 'aeiounu')
                                LIKE translate(lower(:patron), 'áéíóúñü', 'aeiounu'))
               OR (:limpio <> '' AND rut_limpio LIKE :patron_rut)
            ORDER BY rut_limpio, id DESC
            LIMIT :limit
        """),
        {
            "q": q.strip(),
            "patron": f"%{q.strip()}%",
            "limpio": limpio,
            "patron_rut": f"{limpio}%",
            "limit": limit,
        },
    ).mappings().all()
    return [
        {"rut": r["rut"], "nombre": r["full_name"], "email": r["email"]}
        for r in rows
    ]


def persona_activa(db: Session, rut: str) -> dict | None:
    """Datos de un trabajador activo por RUT, o None. Se consulta al enviar:
    el RUT viene del navegador y no se confía en el correo que traiga."""
    limpio = limpiar_rut(rut)
    if not limpio:
        return None
    row = db.execute(
        text("""
            SELECT rut, full_name, email
            FROM rh.employees
            WHERE lower(regexp_replace(rut, '[^0-9kK]', '', 'g')) = :rut
              AND status = 'activo'
            ORDER BY id DESC
            LIMIT 1
        """),
        {"rut": limpio},
    ).mappings().first()
    return dict(row) if row else None


def crear_token_envio(
    db: Session, formulario_id: int, rut: str, email: str, ttl_horas: int, enviado_por: str
) -> str:
    """Token para el enlace que se manda por correo. Mismo criterio de reloj
    que crear_token: el vencimiento lo calcula Postgres."""
    token = secrets.token_urlsafe(32)
    db.execute(
        text("""
            INSERT INTO app.form_tokens
                (token, formulario_id, rut, expira_at, email, enviado_por)
            VALUES
                (:t, :f, :r, NOW() + make_interval(hours => :ttl), :email, :por)
        """),
        {
            "t": token, "f": formulario_id, "r": limpiar_rut(rut),
            "ttl": ttl_horas, "email": email, "por": enviado_por,
        },
    )
    db.commit()
    return token
