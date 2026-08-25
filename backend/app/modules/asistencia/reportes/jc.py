"""Listas del reporte "JC_": mismo bono de asistencia, acotado a estos cargos y empresas.

Editar acá y listo — no hay query aparte, el filtro se aplica en Python sobre las
mismas filas que ya trae ReportesRepo.query.

Lista vacía = no filtra por ese criterio (así se puede filtrar solo por cargo, solo
por empresa, o por ambos). Comparación case-insensitive y sin espacios sobrantes.

ponytail: constantes en el módulo en vez de config/.env — son dos listas que cambian
cuando RRHH lo pida, no por entorno. Mover a Settings si algún día difieren por deploy.
"""

# em.name_role
CARGOS: list[str] = [
    "Operario",
    "Ayudante De Bodega",
    "Peoneta",
    "Chofer",
    "Administrativo Bodega Despacho",
    "Chofer Administrativo Transporte",
    "Asistente De Bodega",
    "Encargado De Bodega Materias Primas",
    "Encargado De Bodega Inflamables",
]

# a.first_level_name  (columna "Nombre Empresa" del reporte)
EMPRESAS: list[str] = [
    "CARLOS CRAMER PRODUCTOS AROMÁTICOS S.A. C.I.",
    "Servicios De Producción Y Logística Ccpa Ltda.",
]


def _norm(v: object) -> str:
    return str(v or "").strip().casefold()


def incluye(name_role: object, empresa: object) -> bool:
    """True si la fila entra en el reporte JC_."""
    if CARGOS and _norm(name_role) not in {_norm(c) for c in CARGOS}:
        return False
    if EMPRESAS and _norm(empresa) not in {_norm(e) for e in EMPRESAS}:
        return False
    return True


if __name__ == "__main__":
    import app.modules.asistencia.reportes.jc as m

    # Listas reales: un cargo/empresa fuera de lista no debe pasar.
    assert incluye("Operario", "CARLOS CRAMER PRODUCTOS AROMÁTICOS S.A. C.I.")
    assert incluye("Peoneta", "Servicios De Producción Y Logística Ccpa Ltda.")
    assert not incluye("Auxiliar de Laboratorio", "CARLOS CRAMER PRODUCTOS AROMÁTICOS S.A. C.I.")
    assert not incluye("Operario", "Otra Empresa Ltda.")

    m.CARGOS, m.EMPRESAS = ["Operario"], ["ACME"]
    assert m.incluye("Operario", "ACME")
    assert m.incluye(" operario ", "acme"), "case/espacios no deben importar"
    assert not m.incluye("Chofer", "ACME")
    assert not m.incluye("Operario", "OTRA")

    m.CARGOS, m.EMPRESAS = ["Operario"], []
    assert m.incluye("Operario", "CUALQUIERA"), "lista vacía = no filtra por empresa"

    m.CARGOS, m.EMPRESAS = [], []
    assert m.incluye("X", "Y"), "ambas vacías = pasa todo"
    print("jc demo OK")
