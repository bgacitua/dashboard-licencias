"""Historial de marcas registradas y operaciones de corrección.

Buk no deja consultar qué mandó este módulo ni deshacerlo, así que cada marca
enviada se guarda acá: es el único registro de qué se escribió y con qué
resultado. La tabla es de solo-append.

Una "operación" es una tanda de corrección en curso: guarda los registros que se
prepararon para poder retomarlos en otra sesión sin volver a subir los archivos.

El original usaba SQLite en un volumen del contenedor; acá van a PostgreSQL con
la sesión de la plataforma, así que sobreviven a un rebuild y se respaldan con
el resto de la base.
"""
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

ESTADOS = ("pending", "synced", "discarded")


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# === Marcas enviadas ===

_INSERT_MARCA = text("""
    INSERT INTO app.asistencia_historial
        (ts, obra_id, rut, sentido, fecha, hora, mov, ok, detail)
    VALUES (:ts, :obra_id, :rut, :sentido, :fecha, :hora, :mov, :ok, :detail)
""")


def registrar(db: Session, obra_id: str, marcas: list[dict]) -> None:
    """Una fila por marca enviada, con su resultado."""
    if not marcas:
        return
    ts = _ahora()
    db.execute(_INSERT_MARCA, [
        {
            "ts": ts, "obra_id": obra_id, "rut": m["rut"], "sentido": m["sentido"],
            "fecha": m["fecha"], "hora": m["hora"], "mov": m.get("mov", ""),
            "ok": bool(m["ok"]), "detail": m.get("detail", ""),
        }
        for m in marcas
    ])
    db.commit()


def consultar(db: Session, desde: str | None = None, hasta: str | None = None) -> list[dict]:
    """Marcas enviadas, más recientes primero. Filtra por el día del envío."""
    condiciones = []
    params: dict = {}
    if desde:
        condiciones.append("ts >= :desde")
        params["desde"] = desde
    if hasta:
        # ts es ISO con hora: hay que incluir todo el día `hasta`.
        condiciones.append("ts <= :hasta")
        params["hasta"] = hasta + "T23:59:59"

    sql = "SELECT id, ts, obra_id, rut, sentido, fecha, hora, mov, ok, detail FROM app.asistencia_historial"
    if condiciones:
        sql += " WHERE " + " AND ".join(condiciones)
    sql += " ORDER BY ts DESC, id DESC"
    return [dict(r) for r in db.execute(text(sql), params).mappings()]


# === Operaciones de corrección ===

_INSERT_REGISTRO = text("""
    INSERT INTO app.asistencia_operacion_registro
        (op_id, record_id, rut, nombre, fecha, hora_intento, sentido,
         turno_inicio, turno_fin, status, updated_at)
    VALUES (:op_id, :record_id, :rut, :nombre, :fecha, :hora_intento, :sentido,
            :turno_inicio, :turno_fin, :status, :updated_at)
    ON CONFLICT (op_id, record_id) DO NOTHING
""")


def crear_operacion(
    db: Session, obra_id: str, desde: str, hasta: str, label: str, registros: list[dict]
) -> int:
    ts = _ahora()
    op_id = db.execute(
        text("""
            INSERT INTO app.asistencia_operacion (obra_id, desde, hasta, label, created_at)
            VALUES (:obra_id, :desde, :hasta, :label, :created_at)
            RETURNING id
        """),
        {"obra_id": obra_id, "desde": desde, "hasta": hasta, "label": label, "created_at": ts},
    ).scalar_one()

    if registros:
        db.execute(_INSERT_REGISTRO, [
            {
                "op_id": op_id, "record_id": r["record_id"], "rut": r["rut"],
                "nombre": r["nombre"], "fecha": r["fecha"],
                "hora_intento": r.get("hora_intento", ""), "sentido": r["sentido"],
                "turno_inicio": r.get("turno_inicio", ""), "turno_fin": r.get("turno_fin", ""),
                "status": r.get("status", "pending"), "updated_at": ts,
            }
            for r in registros
        ])
    db.commit()
    return op_id


def listar_operaciones(db: Session, obra_id: str | None = None) -> list[dict]:
    """Operaciones con el conteo de registros por estado."""
    where = "WHERE o.obra_id = :obra_id" if obra_id else ""
    sql = f"""
        SELECT o.id, o.obra_id, o.desde, o.hasta, o.label, o.created_at,
               COUNT(r.id) AS total,
               COUNT(*) FILTER (WHERE r.status = 'synced')    AS synced,
               COUNT(*) FILTER (WHERE r.status = 'discarded') AS discarded,
               COUNT(*) FILTER (WHERE r.status = 'pending')   AS pending
        FROM app.asistencia_operacion o
        LEFT JOIN app.asistencia_operacion_registro r ON r.op_id = o.id
        {where}
        GROUP BY o.id
        ORDER BY o.created_at DESC
    """
    params = {"obra_id": obra_id} if obra_id else {}
    return [dict(r) for r in db.execute(text(sql), params).mappings()]


def obtener_operacion(db: Session, op_id: int) -> dict | None:
    cabecera = db.execute(
        text("""SELECT id, obra_id, desde, hasta, label, created_at
                FROM app.asistencia_operacion WHERE id = :id"""),
        {"id": op_id},
    ).mappings().first()
    if not cabecera:
        return None
    registros = db.execute(
        text("""SELECT record_id, rut, nombre, fecha, hora_intento, sentido,
                       turno_inicio, turno_fin, status
                FROM app.asistencia_operacion_registro
                WHERE op_id = :id ORDER BY fecha, rut"""),
        {"id": op_id},
    ).mappings()
    return {**dict(cabecera), "registros": [dict(r) for r in registros]}


def eliminar_operacion(db: Session, op_id: int) -> None:
    db.execute(text("DELETE FROM app.asistencia_operacion_registro WHERE op_id = :id"), {"id": op_id})
    db.execute(text("DELETE FROM app.asistencia_operacion WHERE id = :id"), {"id": op_id})
    db.commit()


def actualizar_registros(db: Session, op_id: int, updates: list[dict]) -> None:
    """Cambia el estado de registros puntuales: {record_id, status}."""
    if not updates:
        return
    ts = _ahora()
    db.execute(
        text("""UPDATE app.asistencia_operacion_registro
                SET status = :status, updated_at = :updated_at
                WHERE op_id = :op_id AND record_id = :record_id"""),
        [
            {"status": u["status"], "updated_at": ts, "op_id": op_id, "record_id": u["record_id"]}
            for u in updates
            if u["status"] in ESTADOS
        ],
    )
    db.commit()
