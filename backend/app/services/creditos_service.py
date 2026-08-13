from typing import List, Optional, Dict, Any

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging_config import logger
from app.models.creditos import Credito
from app.schemas.creditos import CreditoCreate, CreditoUpdate
from app.services.pagare_pdf import generar_pagare

# Estados del flujo, en orden
BORRADOR = "borrador"
DOCUMENTO_SUBIDO = "documento_subido"
FIRMA_EN_PROCESO = "firma_en_proceso"
FIRMADO = "firmado"
CREDITO_CREADO = "credito_creado"

FLAGS_FIRMA = {
    "signable_by_employee": "employee_sign",
    "signable_by_legal_agent": "legal_agent_sign",
    "signable_by_second_legal_agent": "second_legal_agent_sign",
}


class CreditoFlowError(Exception):
    """Transición de estado inválida (el endpoint lo traduce a 409)."""


class BukError(Exception):
    """Falla al hablar con la API de BUK (el endpoint lo traduce a 502)."""


def _headers() -> Dict[str, str]:
    if not settings.BUK_API_KEY:
        logger.error("CRITICAL: BUK_API_KEY no está configurada o está vacía.")
    return {"auth_token": settings.BUK_API_KEY}


async def _buk(method: str, path: str, **kwargs) -> Dict[str, Any]:
    url = f"{settings.BUK_API_BASE_URL}{path}"
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.request(method, url, headers=_headers(), **kwargs)
            response.raise_for_status()
            return response.json() if response.content else {}
    except httpx.HTTPStatusError as e:
        logger.error(f"Error HTTP BUK {method} {path}: {e.response.status_code} - {e.response.text[:500]}")
        raise BukError(f"BUK respondió {e.response.status_code}: {e.response.text[:300]}")
    except httpx.RequestError as e:
        logger.error(f"Error de conexión BUK {method} {path}: {e}")
        raise BukError(f"Error de conexión con BUK: {e}")


class CreditosService:
    def __init__(self, db: Session):
        self.db = db

    # ---------- CRUD local ----------

    def get_all(self) -> List[Credito]:
        return self.db.query(Credito).order_by(Credito.id.desc()).all()

    def get_by_id(self, credito_id: int) -> Optional[Credito]:
        return self.db.query(Credito).filter(Credito.id == credito_id).first()

    def create(self, data: CreditoCreate, created_by: Optional[str] = None) -> Credito:
        payload = data.model_dump()
        firmas_requeridas = {
            api_key: payload.pop(flag)
            for flag, api_key in FLAGS_FIRMA.items()
        }
        # Parámetros de subida que no son columnas de la tabla
        opciones = {k: payload.pop(k) for k in ("visible", "overwrite", "path", "reviewer_id")}
        firmas_requeridas["_opciones"] = opciones

        credito = Credito(**payload, firmas_requeridas=firmas_requeridas, created_by=created_by)
        self.db.add(credito)
        self.db.commit()
        self.db.refresh(credito)
        return credito

    def update(self, credito_id: int, data: CreditoUpdate) -> Optional[Credito]:
        credito = self.get_by_id(credito_id)
        if not credito:
            return None
        if credito.estado != BORRADOR:
            raise CreditoFlowError("Solo se puede editar un crédito en estado borrador")
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(credito, field, value)
        self.db.commit()
        self.db.refresh(credito)
        return credito

    def delete(self, credito_id: int) -> bool:
        credito = self.get_by_id(credito_id)
        if not credito:
            return False
        if credito.buk_credit_id:
            raise CreditoFlowError("El crédito ya fue cargado en BUK; anúlalo desde BUK")
        self.db.delete(credito)
        self.db.commit()
        return True

    def buscar_trabajadores(self, q: str) -> List[Dict[str, Any]]:
        rows = self.db.execute(
            text("""
                SELECT e.person_id, e.rut, e.full_name
                FROM rh.employees e
                WHERE e.status = 'activo'
                  AND e.person_id IS NOT NULL
                  AND (e.full_name ILIKE :q OR e.rut ILIKE :q)
                ORDER BY e.full_name
                LIMIT 20
            """),
            {"q": f"%{q}%"},
        ).fetchall()
        return [{"employee_id": r[0], "rut": r[1], "full_name": r[2]} for r in rows]

    async def datos_empleado(self, credito: Credito) -> Dict[str, Any]:
        """Cargo, empresa y datos bancarios que pide el comprobante, desde BUK.

        ponytail: los nombres de campo de BUK varían entre instalaciones, así que
        se prueban alias y lo que no aparece queda en blanco en el PDF en vez de
        romper la generación. Si un campo sale vacío en producción, agregar su
        nombre real a la lista de alias correspondiente.
        """
        try:
            data = await _buk("GET", f"/employees/{credito.employee_id}")
        except BukError as e:
            logger.warning(f"No se pudieron traer los datos del empleado {credito.employee_id}: {e}")
            return {}

        emp = data.get("data", data)
        job = emp.get("current_job") or {}

        def primero(origen: Dict[str, Any], *claves):
            for clave in claves:
                valor = origen.get(clave)
                if isinstance(valor, dict):  # BUK a veces anida {"name": ...}
                    valor = valor.get("name")
                if valor:
                    return valor
            return None

        return {
            "full_name": primero(emp, "full_name", "name"),
            "rut": emp.get("rut"),
            "cargo": primero(job, "role", "name_role", "position") or primero(emp, "name_role"),
            "empresa": primero(job, "company", "cost_center", "first_level_name") or primero(emp, "company"),
            # Nombres exactos de la API de BUK
            "banco": emp.get("bank"),
            "tipo_cuenta": emp.get("account_type"),
            "cuenta": emp.get("account_number"),
        }

    async def generar_pdf(self, credito: Credito) -> bytes:
        return generar_pagare(credito, await self.datos_empleado(credito))

    # ---------- Flujo BUK ----------

    async def subir_documento(self, credito: Credito) -> Credito:
        if credito.buk_file_id and not credito.firmas_requeridas.get("_opciones", {}).get("overwrite"):
            raise CreditoFlowError("El documento ya fue subido. Marca 'sobreescribir' para reemplazarlo.")

        opciones = credito.firmas_requeridas.get("_opciones", {})
        params = {
            "visible": opciones.get("visible", True),
            "overwrite": opciones.get("overwrite", False),
            # El paso 2 es un botón explícito del usuario, no se dispara solo.
            "start_signature_workflow": False,
            "signable_by_employee": credito.firmas_requeridas.get("employee_sign", False),
            "signable_by_legal_agent": credito.firmas_requeridas.get("legal_agent_sign", False),
            "signable_by_second_legal_agent": credito.firmas_requeridas.get("second_legal_agent_sign", False),
        }
        if opciones.get("path"):
            params["path"] = opciones["path"]
        if opciones.get("reviewer_id"):
            params["reviewer_id"] = opciones["reviewer_id"]

        nombre_archivo = f"comprobante_prestamo_{credito.id}.pdf"
        pdf = await self.generar_pdf(credito)
        data = await _buk(
            "POST",
            f"/employees/{credito.employee_id}/docs",
            params=params,
            files={"file": (nombre_archivo, pdf, "application/pdf")},
        )

        doc = data.get("data", data)
        file_id = doc.get("id")
        if not file_id:
            raise BukError(f"BUK no devolvió el id del documento: {str(data)[:300]}")

        credito.buk_file_id = file_id
        credito.estado = DOCUMENTO_SUBIDO
        self.db.commit()
        self.db.refresh(credito)
        return credito

    async def iniciar_firma(self, credito: Credito) -> Credito:
        if not credito.buk_file_id:
            raise CreditoFlowError("Primero debes subir el documento a BUK")

        await _buk("POST", f"/docs/{credito.buk_file_id}/signatures/process")
        credito.estado = FIRMA_EN_PROCESO
        self.db.commit()
        self.db.refresh(credito)
        return credito

    async def verificar_firma(self, credito: Credito) -> Dict[str, Any]:
        if not credito.buk_file_id:
            raise CreditoFlowError("Primero debes subir el documento a BUK")

        data = await _buk("GET", f"/employees/{credito.employee_id}/docs/{credito.buk_file_id}")
        doc = data.get("data", data)
        firmas_estado = doc.get("settings") or {}

        requeridas = {
            k: bool(v)
            for k, v in credito.firmas_requeridas.items()
            if k in FLAGS_FIRMA.values()
        }
        firmado = all(
            firmas_estado.get(api_key) is True
            for api_key, req in requeridas.items()
            if req
        ) and any(requeridas.values())

        credito.firmas_estado = firmas_estado
        if firmado and credito.estado in (DOCUMENTO_SUBIDO, FIRMA_EN_PROCESO):
            credito.estado = FIRMADO
        self.db.commit()
        self.db.refresh(credito)

        return {
            "firmado": firmado,
            "firmas_requeridas": requeridas,
            "firmas_estado": firmas_estado,
            "estado": credito.estado,
        }

    async def crear_credito_buk(self, credito: Credito) -> Credito:
        if credito.estado != FIRMADO:
            raise CreditoFlowError("El documento debe estar firmado antes de cargar el crédito")
        if credito.buk_credit_id:
            raise CreditoFlowError("El crédito ya fue cargado en BUK")

        params = {
            "employee_id": credito.employee_id,
            "nombre": credito.nombre,
            "tipo": credito.tipo,
            "start_date": credito.start_date.isoformat(),
            "moneda": credito.moneda,
            "amount": credito.amount,
            "cuota_actual": credito.cuota_actual,
            "duracion": credito.duracion,
        }
        if credito.comentario:
            params["comentario"] = credito.comentario
        if credito.moneda == "uf" and credito.dia_uf:
            params["dia_uf"] = credito.dia_uf

        data = await _buk("POST", "/credits/create", params=params)
        credit = data.get("data", data)
        credit_id = credit.get("id")
        if not credit_id:
            raise BukError(f"BUK no devolvió el id del crédito: {str(data)[:300]}")

        credito.buk_credit_id = credit_id
        credito.estado = CREDITO_CREADO
        self.db.commit()
        self.db.refresh(credito)
        return credito

    async def verificar_credito(self, credito: Credito) -> Dict[str, Any]:
        if not credito.buk_credit_id:
            raise CreditoFlowError("El crédito aún no ha sido cargado en BUK")

        return await _buk(
            "GET",
            f"/credits/{credito.buk_credit_id}",
            params={"year": credito.start_date.year, "month": credito.start_date.month},
        )
