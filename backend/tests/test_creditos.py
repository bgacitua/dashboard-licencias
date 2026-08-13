"""Self-check del flujo de créditos: máquina de estados + generación del pagaré.

No toca la BD ni la API de BUK (usa un crédito falso y un stub de sesión).

Ejecutar dentro del contenedor backend:
    python -m tests.test_creditos
"""

import asyncio
from datetime import date

from app.services.creditos_service import (
    CreditosService, CreditoFlowError,
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
            "_opciones": {"visible": True, "overwrite": False, "path": None, "reviewer_id": None},
        }
        self.firmas_estado = None
        self.__dict__.update(kw)


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

    # El comprobante en UF también renderiza (incluye la nota de ajuste)
    pdf_uf = generar_pagare(_FakeCredito(moneda="uf", amount=2, monto_original=24.5), empleado)
    assert pdf_uf[:4] == b"%PDF"

    # Formato de montos
    from app.services.pagare_pdf import _monto, _pesos, _uf
    assert _pesos(600000) == "$600.000", _pesos(600000)
    assert _uf(24.5) == "UF 24,50", _uf(24.5)
    assert _monto(None, "peso") == "", repr(_monto(None, "peso"))

    print("OK: máquina de estados y comprobante PDF")


if __name__ == "__main__":
    demo()
