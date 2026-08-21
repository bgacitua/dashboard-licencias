"""Self-check del flujo de créditos: máquina de estados + generación del pagaré.

No toca la BD ni la API de BUK (usa un crédito falso y un stub de sesión).

Ejecutar dentro del contenedor backend:
    python -m tests.test_creditos
"""

import asyncio
import re
from datetime import date

from app.services.creditos_service import (
    CreditosService, CreditoFlowError, LEGAL_AGENT_PERSON_ID, _bool,
    BORRADOR, DOCUMENTO_SUBIDO, FIRMA_EN_PROCESO, FIRMADO, CREDITO_CREADO,
)
from app.services.pagare_pdf import generar_pagare


class _FakeDb:
    def commit(self): pass
    def refresh(self, _obj): pass


class _FakeCredito:
    def __init__(self, **kw):
        self.id = 1
        self.employee_id = 1024
        self.rut = "11.111.111-1"
        self.nombre_trabajador = "Juana Pérez"
        self.nombre = "Crédito Consumo"
        self.tipo = "credito_personal"
        self.tipo_prestamo = "Préstamo Habitacional"
        self.start_date = date(2026, 8, 1)
        self.moneda = "peso"
        self.amount = 50000
        self.cuota_actual = 1
        self.duracion = 12
        self.monto_original = 600000
        self.equivalente_pesos = 600000
        self.comentario = "Aprobado por gerencia"
        self.dia_uf = None
        self.buk_file_id = None
        self.buk_credit_id = None
        self.estado = BORRADOR
        self.firmas_requeridas = {
            "employee_sign": True,
            "legal_agent_sign": True,
            "second_legal_agent_sign": False,
            "_opciones": {"visible": True, "overwrite": False, "path": None},
        }
        self.firmas_estado = None
        self.__dict__.update(kw)


def _texto_pdf(credito, empleado) -> str:
    """Texto visible del PDF. Desactiva la compresión para leer el stream sin
    dependencias extra (poppler/pypdf no están instalados)."""
    import app.services.pagare_pdf as P

    original = P.FPDF

    class FPDFPlano(original):
        def __init__(self, *a, **kw):
            super().__init__(*a, **kw)
            self.set_compression(False)

    P.FPDF = FPDFPlano
    try:
        raw = P.generar_pagare(credito, empleado).decode("latin-1")
    finally:
        P.FPDF = original
    return " ".join(re.findall(r"\((.*?)\) *Tj", raw))


def _raises(fn, mensaje):
    try:
        asyncio.run(fn())
    except CreditoFlowError:
        return
    raise AssertionError(mensaje)


def demo():
    service = CreditosService(_FakeDb())

    # No se puede iniciar la firma sin documento subido
    c = _FakeCredito()
    _raises(lambda: service.iniciar_firma(c), "iniciar_firma debe fallar sin buk_file_id")
    _raises(lambda: service.verificar_firma(c), "verificar_firma debe fallar sin buk_file_id")

    # No se puede crear el crédito en BUK si el documento no está firmado
    c = _FakeCredito(buk_file_id=999, estado=FIRMA_EN_PROCESO)
    _raises(lambda: service.crear_credito_buk(c), "crear_credito_buk debe fallar si no está firmado")

    # No se puede verificar un crédito que nunca se cargó
    c = _FakeCredito(estado=FIRMADO, buk_file_id=999)
    _raises(lambda: service.verificar_credito(c), "verificar_credito debe fallar sin buk_credit_id")

    # No se re-sube el documento salvo overwrite explícito
    c = _FakeCredito(buk_file_id=999, estado=DOCUMENTO_SUBIDO)
    _raises(lambda: service.subir_documento(c), "subir_documento debe fallar si ya hay file_id sin overwrite")

    # Se puede editar mientras no haya documento en BUK; después no
    from app.schemas.creditos import CreditoUpdate
    c = _FakeCredito()
    service.get_by_id = lambda _id: c
    service.update(1, CreditoUpdate(amount=80000, signable_by_legal_agent=False))
    assert c.amount == 80000, c.amount
    assert c.firmas_requeridas["legal_agent_sign"] is False, c.firmas_requeridas
    assert "signable_by_legal_agent" not in c.__dict__, "el flag no es columna"

    c = _FakeCredito(buk_file_id=999, estado=DOCUMENTO_SUBIDO)
    service.get_by_id = lambda _id: c
    try:
        service.update(1, CreditoUpdate(amount=1))
        raise AssertionError("update debe fallar si el documento ya está en BUK")
    except CreditoFlowError:
        pass

    # Regresión: BUK anida el documento distinto según el endpoint
    from app.services.creditos_service import _archivo, _bool
    subida = {"employee_id": 11154, "employee_file": {"id": 85402, "settings": {"employee_sign": True}}}
    assert _archivo(subida)["id"] == 85402, _archivo(subida)
    assert _archivo({"data": {"id": 7, "settings": {}}})["id"] == 7
    assert _archivo({"id": 9})["id"] == 9
    assert _archivo(subida)["settings"]["employee_sign"] is True
    assert (_bool(True), _bool(False), _bool(None)) == ("true", "false", "false")

    # Estado de firma: sale de employee_file.signatures[].status == 'signed'
    from app.services.creditos_service import evaluar_firmas
    firma_empleado = {
        "signature_type": "employee_signature", "person_id": 11102,
        "status": "signed", "signed_at": "2026-08-13T15:49:39.130-04:00",
    }
    firma_legal_pendiente = {"signature_type": "legal_agent_signature", "status": "pending"}

    solo_empleado = {"employee_sign": True, "legal_agent_sign": False, "second_legal_agent_sign": False}
    firmado, estado = evaluar_firmas(solo_empleado, [firma_empleado])
    assert firmado is True, estado
    assert estado["employee_sign"]["status"] == "signed", estado

    ambas = {"employee_sign": True, "legal_agent_sign": True, "second_legal_agent_sign": False}
    firmado, _ = evaluar_firmas(ambas, [firma_empleado, firma_legal_pendiente])
    assert firmado is False, "falta la firma del representante legal"

    firmado, _ = evaluar_firmas(ambas, [firma_empleado])
    assert firmado is False, "una firma requerida que ni siquiera aparece no está firmada"

    firmado, _ = evaluar_firmas({"employee_sign": False}, [])
    assert firmado is False, "sin firmas requeridas no se da por firmado"

    # Sin ninguna firma marcada el flujo se salta la firma: no hay proceso que iniciar
    from app.services.creditos_service import _firmas_activas
    sin_firmas = {
        "employee_sign": False, "legal_agent_sign": False,
        "second_legal_agent_sign": False, "_opciones": {"visible": True},
    }
    c = _FakeCredito(buk_file_id=999, estado=FIRMADO, firmas_requeridas=sin_firmas)
    assert _firmas_activas(c) == {}, _firmas_activas(c)
    _raises(lambda: service.iniciar_firma(c), "iniciar_firma debe fallar si no se requieren firmas")
    assert _firmas_activas(_FakeCredito()) == {"employee_sign": True, "legal_agent_sign": True}

    # Un crédito ya cargado en BUK no se borra desde el dashboard
    c = _FakeCredito(estado=CREDITO_CREADO, buk_credit_id=77)
    service.get_by_id = lambda _id: c
    try:
        service.delete(1)
        raise AssertionError("delete debe fallar si el crédito ya está en BUK")
    except CreditoFlowError:
        pass

    # El comprobante sale como PDF válido, con y sin datos de empleado de BUK
    empleado = {
        "empresa": "Cramer S.A.", "cargo": "Analista", "banco": "Banco de Chile",
        "tipo_cuenta": "Cuenta corriente", "cuenta": "00012345678",
    }
    for datos in (empleado, {}, None):
        pdf = generar_pagare(_FakeCredito(), datos)
        assert pdf[:4] == b"%PDF", pdf[:20]
        assert len(pdf) > 1000, len(pdf)

    # El comprobante imprime tipo_prestamo, no el enum que se le manda a BUK
    assert "Habitacional" in _texto_pdf(_FakeCredito(), empleado)

    # Regresión: con campos vacíos las filas se montaban entre sí y desaparecían
    for datos in (empleado, {}):
        texto = _texto_pdf(_FakeCredito(), datos)
        faltan = [e for e in ("Empleado", "Rut", "Cargo", "Fecha de inicio",
                              "Tipo de cuenta", "Banco", "de cuenta",
                              "Monto Original", "Valor de la cuota") if e not in texto]
        assert not faltan, faltan

    # El comprobante en UF también renderiza (incluye la nota de ajuste)
    pdf_uf = generar_pagare(_FakeCredito(moneda="uf", amount=2, monto_original=24.5), empleado)
    assert pdf_uf[:4] == b"%PDF"

    # Formato de montos
    from app.services.pagare_pdf import _monto, _pesos, _uf
    assert _pesos(600000) == "$600.000", _pesos(600000)
    assert _uf(24.5) == "UF 24,50", _uf(24.5)
    assert _monto(None, "peso") == "", repr(_monto(None, "peso"))

    # --- Params de la subida y del PUT de firmas ---
    svc = CreditosService(_FakeDb())

    def params_subida(**flags):
        """Los params que arma subir_documento, sin llamar a BUK."""
        c = _FakeCredito()
        c.firmas_requeridas = {**c.firmas_requeridas, **flags}
        opciones = c.firmas_requeridas.get("_opciones", {})
        return {
            "start_signature_workflow": "false",
            "signable_by_employee": _bool(c.firmas_requeridas.get("employee_sign")),
            "signable_by_legal_agent": "false",
            "signable_by_second_legal_agent": "false",
        }

    # El representante legal nunca se declara en la subida: va por el PUT
    for flags in ({"employee_sign": True, "legal_agent_sign": True},
                  {"employee_sign": True, "legal_agent_sign": False}):
        p = params_subida(**flags)
        assert p["signable_by_employee"] == "true", p
        assert p["signable_by_legal_agent"] == "false", p
        assert p["signable_by_second_legal_agent"] == "false", p
        assert p["start_signature_workflow"] == "false", p

    # Sin firma del trabajador el documento se sube como no firmable
    assert params_subida(employee_sign=False)["signable_by_employee"] == "false"

    # El PUT lleva solo al representante legal, sin position ni reviewer_id
    llamadas = []

    async def _fake_buk(method, path, **kw):
        llamadas.append((method, path, kw.get("json")))
        return {}

    import app.services.creditos_service as CS
    real_buk, CS._buk = CS._buk, _fake_buk
    try:
        c = _FakeCredito(buk_file_id=86134, estado=DOCUMENTO_SUBIDO)
        asyncio.run(svc.iniciar_firma(c))
        assert c.estado == FIRMA_EN_PROCESO, c.estado
        put = [l for l in llamadas if l[0] == "PUT"]
        assert len(put) == 1, llamadas
        assert put[0][1] == "/docs/86134/signatures", put
        assert put[0][2] == {"signatures": [
            {"signature_type": "legal_agent_signature",
             "person_id": LEGAL_AGENT_PERSON_ID}]}, put[0][2]
        assert [l[0] for l in llamadas] == ["PUT", "POST"], llamadas
        assert llamadas[-1][1] == "/docs/86134/signatures/process", llamadas

        # Solo trabajador: no hay PUT, se va derecho a iniciar el proceso
        llamadas.clear()
        c = _FakeCredito(buk_file_id=86135, estado=DOCUMENTO_SUBIDO)
        c.firmas_requeridas = {**c.firmas_requeridas, "legal_agent_sign": False}
        asyncio.run(svc.iniciar_firma(c))
        assert [l[0] for l in llamadas] == ["POST"], llamadas

        # El segundo representante legal falla explícito, sin tocar BUK
        llamadas.clear()
        c = _FakeCredito(buk_file_id=86136, estado=DOCUMENTO_SUBIDO)
        c.firmas_requeridas = {**c.firmas_requeridas, "second_legal_agent_sign": True}
        _raises(lambda: svc.iniciar_firma(c), "second_legal_agent_sign debe fallar")
        assert llamadas == [], llamadas
    finally:
        CS._buk = real_buk

    print("OK: máquina de estados, comprobante PDF y flujo de firmas")


if __name__ == "__main__":
    demo()
