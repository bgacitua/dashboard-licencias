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


def _archivo(data: Dict[str, Any]) -> Dict[str, Any]:
    """Documento dentro de la respuesta de BUK.

    BUK lo anida distinto según el endpoint: al subir viene en
    {"employee_id": .., "employee_file": {...}} y al consultarlo en {"data": {...}}.
    """
    cuerpo = data.get("data", data)
    if isinstance(cuerpo, dict):
        for clave in ("employee_file", "document", "doc"):
            anidado = cuerpo.get(clave)
            if isinstance(anidado, dict):
                return anidado
    return cuerpo if isinstance(cuerpo, dict) else {}


def _bool(valor) -> str:
    """BUK espera 'true'/'false' en la query string, no el bool de Python."""
    return "true" if valor else "false"


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

    OPCIONES_DOC = ("visible", "overwrite", "path", "reviewer_id")

    def _separar_opciones(self, payload: dict, base: Optional[dict] = None) -> dict:
        """Saca del payload los flags de firma y las opciones de subida (no son
        columnas) y los devuelve como el JSON que se guarda en firmas_requeridas."""
        firmas = dict(base or {})
        opciones = dict(firmas.get("_opciones") or {})
        for flag, api_key in FLAGS_FIRMA.items():
            if flag in payload:
                firmas[api_key] = payload.pop(flag)
        for clave in self.OPCIONES_DOC:
            if clave in payload:
                opciones[clave] = payload.pop(clave)
        firmas["_opciones"] = opciones
        return firmas

    def create(self, data: CreditoCreate, created_by: Optional[str] = None) -> Credito:
        payload = data.model_dump()
        firmas_requeridas = self._separar_opciones(payload)

        credito = Credito(**payload, firmas_requeridas=firmas_requeridas, created_by=created_by)
        self.db.add(credito)
        self.db.commit()
        self.db.refresh(credito)
        return credito

    def update(self, credito_id: int, data: CreditoUpdate) -> Optional[Credito]:
        credito = self.get_by_id(credito_id)
        if not credito:
            return None
        if credito.estado != BORRADOR or credito.buk_file_id:
            raise CreditoFlowError(
                "El documento ya fue subido a BUK; el crédito no se puede editar"
            )
        payload = data.model_dump(exclude_unset=True)
        credito.firmas_requeridas = self._separar_opciones(payload, credito.firmas_requeridas)
        for field, value in payload.items():
            setattr(credito, field, value)
        # Vincular un documento ya existente en BUK adelanta el flujo
        if credito.buk_file_id:
            credito.estado = DOCUMENTO_SUBIDO
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
                -- e.id es el employee_id que usa la API de BUK (person_id es otro id y da 404)
                SELECT e.id, e.rut, e.full_name
                FROM rh.employees e
                WHERE e.status = 'activo'
                  AND e.id IS NOT NULL
                  AND (e.full_name ILIKE :q OR e.rut ILIKE :q)
                ORDER BY e.full_name
                LIMIT 20
            """),
            {"q": f"%{q}%"},
        ).fetchall()
        return [{"employee_id": r[0], "rut": r[1], "full_name": r[2]} for r in rows]

    async def _buk_empleado(self, credito: Credito, method: str, sufijo: str, **kwargs) -> Dict[str, Any]:
        """Llama a /employees/{id}{sufijo}, reintentando con el RUT si el id da 404.

        ponytail: BUK acepta tanto el employee_id como el RUT en esa ruta, y qué
        id trae la réplica local varía por empresa. Reintentar es más barato que
        mantener un mapeo id↔rut al día.
        """
        identificadores = [credito.employee_id]
        if credito.rut and credito.rut != str(credito.employee_id):
            identificadores.append(credito.rut)

        for i, identificador in enumerate(identificadores):
            try:
                return await _buk(method, f"/employees/{identificador}{sufijo}", **kwargs)
            except BukError as e:
                ultimo = i == len(identificadores) - 1
                if ultimo or "404" not in str(e):
                    raise
                logger.warning(
                    f"BUK 404 para employee_id={identificador}; reintentando con RUT {credito.rut}"
                )
        return {}

    async def datos_empleado(self, credito: Credito) -> Dict[str, Any]:
        """Datos que pide el comprobante: los bancarios y el cargo desde BUK,
        la empresa desde rh.areas.first_level_name de la réplica local.

        ponytail: los nombres de campo de BUK varían entre instalaciones, así que
        se prueban alias y lo que no aparece queda en blanco en el PDF en vez de
        romper la generación. Si un campo sale vacío en producción, agregar su
        nombre real a la lista de alias correspondiente.
        """
        try:
            data = await self._buk_empleado(credito, "GET", "")
        except BukError as e:
            # Sin BUK igual se emite el comprobante con lo que hay en la BD local
            logger.warning(f"No se pudieron traer los datos del empleado {credito.employee_id}: {e}")
            data = {}

        emp = data.get("data", data)
        job = emp.get("current_job") or {}

        # Si la réplica local tenía otro id, guardamos el de BUK: /credits/create
        # solo acepta el employee_id numérico y ahí no sirve el RUT.
        id_buk = emp.get("id") or emp.get("employee_id")
        if isinstance(id_buk, int) and id_buk != credito.employee_id:
            logger.info(f"employee_id corregido {credito.employee_id} → {id_buk} (BUK)")
            credito.employee_id = id_buk
            self.db.commit()

        def primero(origen: Dict[str, Any], *claves):
            for clave in claves:
                valor = origen.get(clave)
                if isinstance(valor, dict):  # BUK a veces anida {"name": ...}
                    valor = valor.get("name")
                if valor:
                    return valor
            return None

        datos = {
            "full_name": primero(emp, "full_name", "name"),
            "rut": emp.get("rut"),
            "cargo": primero(job, "role", "name_role", "position") or primero(emp, "name_role"),
            # Nombres exactos de la API de BUK
            "banco": emp.get("bank"),
            "tipo_cuenta": emp.get("account_type"),
            "cuenta": emp.get("account_number"),
        }

        # La empresa (y el cargo, si BUK no lo trae) salen de la réplica local
        local = self.db.execute(
            text("""
                SELECT a.first_level_name, e.name_role
                FROM rh.employees e
                LEFT JOIN rh.areas a ON a.id = e.area_id
                WHERE e.id = :employee_id
            """),
            {"employee_id": credito.employee_id},
        ).fetchone()
        datos["empresa"] = local[0] if local else None
        datos["cargo"] = datos["cargo"] or (local[1] if local else None)

        faltantes = [k for k, v in datos.items() if not v]
        if faltantes:
            logger.warning(
                f"Empleado {credito.employee_id}: BUK no trajo {faltantes}. "
                f"Claves disponibles: {sorted(emp.keys())} | current_job: {sorted(job.keys())}"
            )
        return datos

    async def generar_pdf(self, credito: Credito) -> bytes:
        return generar_pagare(credito, await self.datos_empleado(credito))

    # ---------- Flujo BUK ----------

    async def subir_documento(self, credito: Credito) -> Credito:
        if credito.buk_file_id and not credito.firmas_requeridas.get("_opciones", {}).get("overwrite"):
            raise CreditoFlowError("El documento ya fue subido. Marca 'sobreescribir' para reemplazarlo.")

        opciones = credito.firmas_requeridas.get("_opciones", {})
        params = {
            "visible": _bool(opciones.get("visible", True)),
            "overwrite": _bool(opciones.get("overwrite", False)),
            # El paso 2 es un botón explícito del usuario, no se dispara solo.
            "start_signature_workflow": "false",
            "signable_by_employee": _bool(credito.firmas_requeridas.get("employee_sign")),
            "signable_by_legal_agent": _bool(credito.firmas_requeridas.get("legal_agent_sign")),
            "signable_by_second_legal_agent": _bool(credito.firmas_requeridas.get("second_legal_agent_sign")),
        }
        if opciones.get("path"):
            params["path"] = opciones["path"]
        if opciones.get("reviewer_id"):
            params["reviewer_id"] = opciones["reviewer_id"]

        nombre_archivo = f"comprobante_prestamo_{credito.id}.pdf"
        pdf = await self.generar_pdf(credito)
        data = await self._buk_empleado(
            credito,
            "POST",
            "/docs",
            params=params,
            files={"file": (nombre_archivo, pdf, "application/pdf")},
        )

        file_id = _archivo(data).get("id")
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

        data = await self._buk_empleado(credito, "GET", f"/docs/{credito.buk_file_id}")
        firmas_estado = _archivo(data).get("settings") or {}

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
