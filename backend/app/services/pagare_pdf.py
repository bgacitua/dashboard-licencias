"""Genera el comprobante de préstamo en PDF.

Replica el layout de app/templates/plantilla_prestamos.docx. Se arma con fpdf2
en vez de renderizar el .docx porque BUK necesita PDF y convertir docx→pdf
exigiría LibreOffice (~500MB) en la imagen del backend.

ponytail: los textos fijos viven en las constantes de abajo. Si RRHH necesita
editarlos sin deploy, moverlos a un .txt en app/templates y leerlo con open().
"""

from datetime import date
from decimal import Decimal
from fpdf import FPDF

MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

TIPOS_LABEL = {
    "credito_personal": "Préstamo personal",
    "dental": "Préstamo dental",
    "leasing": "Leasing",
    "seguro_vida": "Seguro de vida",
    "credito_otro": "Préstamo habitacional",
}

TITULO = "COMPROBANTE DE PRÉSTAMO"
NOTA = "Nota: La cuota se ajustará al valor de la UF del último día del mes en curso."
PIE = (
    "El presente documento es firmado electrónicamente, quedando una copia digital "
    "del mismo en poder del Empleador y otra en poder del Trabajador."
)

GRIS = (245, 245, 245)


def _pesos(valor) -> str:
    if valor in (None, ""):
        return ""
    return f"${int(valor):,}".replace(",", ".")


def _uf(valor) -> str:
    if valor in (None, ""):
        return ""
    d = Decimal(str(valor))
    entero, decimales = divmod(d * 100, 100)
    return f"UF {int(entero):,}".replace(",", ".") + f",{int(decimales):02d}"


def _monto(valor, moneda: str) -> str:
    return _uf(valor) if moneda == "uf" else _pesos(valor)


def _fecha(f: date) -> str:
    return f"{f.day:02d}-{f.month:02d}-{f.year}"


def _fecha_larga(f: date) -> str:
    return f"{f.day} de {MESES[f.month - 1]} de {f.year}"


def generar_pagare(credito, empleado: dict | None = None) -> bytes:
    """Recibe un app.models.creditos.Credito y los datos del empleado traídos
    de BUK (cargo, empresa, banco, cuenta). Devuelve los bytes del PDF."""
    emp = empleado or {}

    pdf = FPDF(format="letter", unit="mm")
    pdf.set_margins(25, 20, 25)
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()
    ancho = pdf.epw

    # --- Encabezado ---
    pdf.set_font("Helvetica", "B", 15)
    pdf.multi_cell(ancho, 9, TITULO, align="C")
    pdf.set_font("Helvetica", "B", 11)
    pdf.multi_cell(ancho, 6, emp.get("empresa") or "", align="C")
    pdf.set_font("Helvetica", size=10)
    pdf.multi_cell(ancho, 6, f"Fecha: {_fecha_larga(date.today())}", align="C")
    pdf.ln(8)

    # --- Datos del empleado ---
    filas_empleado = [
        ("Empleado", credito.nombre_trabajador or emp.get("full_name") or ""),
        ("Rut", credito.rut or emp.get("rut") or ""),
        ("Cargo", emp.get("cargo") or ""),
        ("Tipo de Préstamo", TIPOS_LABEL.get(credito.tipo, credito.tipo)),
        ("Fecha de inicio", _fecha(credito.start_date)),
    ]
    for etiqueta, valor in filas_empleado:
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(45, 7, f"{etiqueta}:")
        pdf.set_font("Helvetica", size=10)
        pdf.multi_cell(ancho - 45, 7, str(valor))
    pdf.ln(6)

    # --- Detalle del préstamo ---
    pdf.set_font("Helvetica", "B", 11)
    pdf.multi_cell(ancho, 7, "Detalle del préstamo")
    pdf.ln(1)

    col_izq = ancho * 0.6
    col_der = ancho - col_izq

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(*GRIS)
    pdf.cell(col_izq, 8, "  Concepto", border=1, fill=True)
    pdf.cell(col_der, 8, "Valor", border=1, align="R", fill=True)
    pdf.ln()

    filas_detalle = [
        ("Monto Original", _monto(credito.monto_original, credito.moneda)),
        ("Equivalente en pesos", _pesos(credito.equivalente_pesos)),
        ("Número de cuotas", str(credito.duracion)),
        ("Valor de la cuota", _monto(credito.amount, credito.moneda)),
    ]
    pdf.set_font("Helvetica", size=10)
    for concepto, valor in filas_detalle:
        pdf.cell(col_izq, 8, f"  {concepto}", border=1)
        pdf.cell(col_der, 8, f"{valor}  ", border=1, align="R")
        pdf.ln()
    pdf.ln(8)

    # --- Datos bancarios ---
    pdf.set_font("Helvetica", "B", 11)
    pdf.multi_cell(ancho, 7, "Datos bancarios")
    pdf.ln(1)
    for etiqueta, valor in [
        ("Tipo de cuenta", emp.get("tipo_cuenta") or ""),
        ("Banco", emp.get("banco") or ""),
        ("N° de cuenta", emp.get("cuenta") or ""),
    ]:
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(45, 7, f"{etiqueta}:")
        pdf.set_font("Helvetica", size=10)
        pdf.multi_cell(ancho - 45, 7, str(valor))
    pdf.ln(6)

    if credito.moneda == "uf":
        pdf.set_font("Helvetica", "I", 9)
        pdf.multi_cell(ancho, 6, NOTA)
        pdf.ln(2)

    if credito.comentario:
        pdf.set_font("Helvetica", size=10)
        pdf.multi_cell(ancho, 6, f"Observaciones: {credito.comentario}")
        pdf.ln(2)

    pdf.ln(4)
    pdf.set_font("Helvetica", size=9)
    pdf.multi_cell(ancho, 6, PIE, align="J")

    # fpdf2 devuelve bytearray; httpx quiere bytes
    return bytes(pdf.output())
