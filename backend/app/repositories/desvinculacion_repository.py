import json
from typing import Any, Dict, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.logging_config import logger

# Columnas devueltas por todas las lecturas. Se listan explícitamente para que el
# schema de respuesta no dependa del orden físico de la tabla.
_COLUMNS = """
    rut, causal, fecha_termino, payload_json, total_finiquito,
    carta_generada_at, finiquito_generado_at, correo_enviado_at,
    created_by, updated_at
"""


class DesvinculacionRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_rut(self, rut: str) -> Optional[Dict[str, Any]]:
        row = self.db.execute(
            text(f"SELECT {_COLUMNS} FROM app.desvinculacion_proceso WHERE rut = :rut"),
            {"rut": rut},
        ).mappings().first()
        return dict(row) if row else None

    def list_all(self) -> list[Dict[str, Any]]:
        """Todos los procesos, sin payload_json (pesa y no se usa en los listados)."""
        rows = self.db.execute(
            text("""
                SELECT rut, causal, fecha_termino, total_finiquito,
                       carta_generada_at, finiquito_generado_at, correo_enviado_at,
                       created_by, updated_at
                FROM app.desvinculacion_proceso
                ORDER BY updated_at DESC
            """)
        ).mappings().all()
        return [dict(r) for r in rows]

    def upsert(
        self,
        rut: str,
        causal: Optional[str],
        fecha_termino: Optional[Any],
        payload_json: Optional[Dict[str, Any]],
        created_by: Optional[str],
        total_finiquito: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Crea o actualiza el proceso del trabajador. `created_by` solo se fija en el INSERT:
        quien abrió el proceso no cambia porque otro usuario lo edite después."""
        query = text(f"""
            INSERT INTO app.desvinculacion_proceso
                (rut, causal, fecha_termino, payload_json, total_finiquito, created_by)
            VALUES
                (:rut, :causal, :fecha_termino, CAST(:payload_json AS jsonb),
                 :total_finiquito, :created_by)
            ON CONFLICT (rut) DO UPDATE SET
                -- COALESCE: un campo omitido en el request conserva lo guardado en vez de
                -- borrarlo. Para vaciar un campo hay que hacerlo desde el formulario.
                causal        = COALESCE(EXCLUDED.causal, desvinculacion_proceso.causal),
                fecha_termino = COALESCE(EXCLUDED.fecha_termino, desvinculacion_proceso.fecha_termino),
                payload_json  = COALESCE(EXCLUDED.payload_json, desvinculacion_proceso.payload_json),
                -- Solo se re-congela cuando el request trae un total nuevo (al generar carta).
                total_finiquito = COALESCE(EXCLUDED.total_finiquito, desvinculacion_proceso.total_finiquito),
                updated_at    = NOW()
            RETURNING {_COLUMNS}
        """)
        row = self.db.execute(
            query,
            {
                "rut": rut,
                "causal": causal,
                "fecha_termino": fecha_termino,
                "payload_json": json.dumps(payload_json) if payload_json is not None else None,
                "total_finiquito": total_finiquito,
                "created_by": created_by,
            },
        ).mappings().first()
        self.db.commit()
        logger.info(f"Proceso de desvinculación guardado para {rut}")
        return dict(row)

    def marcar_hito(self, rut: str, columna: str) -> Optional[Dict[str, Any]]:
        """Sella el timestamp del hito. `columna` ya viene validada contra la lista blanca
        del servicio: nunca interpolar aquí un valor que venga del request sin ese paso.
        Sobrescribe si ya existía (se pueden generar varias cartas hasta la definitiva)."""
        query = text(f"""
            UPDATE app.desvinculacion_proceso
            SET {columna} = NOW(), updated_at = NOW()
            WHERE rut = :rut
            RETURNING {_COLUMNS}
        """)
        row = self.db.execute(query, {"rut": rut}).mappings().first()
        self.db.commit()
        if not row:
            return None
        logger.info(f"Hito {columna} marcado para {rut}")
        return dict(row)
