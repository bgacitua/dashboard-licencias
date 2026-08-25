"""Check del cableado del módulo de asistencia.

Verifica lo único no trivial del esqueleto: que el flag realmente decida si las
rutas existen, y que con el flag apagado el paquete del módulo ni se importe.
"""
import os
import subprocess
import sys
import textwrap

# Ejecutable como script suelto desde backend/: `python tests/test_modulo_asistencia.py`.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _rutas_con(enabled: str) -> tuple[list[str], list[str]]:
    """Arranca un intérprete limpio con el flag dado y devuelve (rutas, módulos)."""
    codigo = textwrap.dedent("""
        import json, sys
        from app.api.v1.api import api_router
        rutas = [r.path for r in api_router.routes]
        cargados = [m for m in sys.modules if m.startswith("app.modules.asistencia")]
        print(json.dumps([rutas, cargados]))
    """)
    salida = subprocess.run(
        [sys.executable, "-c", codigo],
        capture_output=True, text=True, check=True,
        env={**os.environ, "ASISTENCIA_ENABLED": enabled},
        cwd=sys.path[0],
    )
    import json
    return json.loads(salida.stdout.strip().splitlines()[-1])


def test_flag_apagado_no_monta_ni_importa_el_router():
    rutas, cargados = _rutas_con("false")
    assert not any("/asistencia" in r for r in rutas)
    assert "app.modules.asistencia.router" not in cargados


def test_flag_encendido_monta_las_lecturas():
    rutas, _ = _rutas_con("true")
    esperadas = {
        "/asistencia/health",
        "/asistencia/obras",
        "/asistencia/marcajes",
        "/asistencia/auditoria",
        "/asistencia/inasistencias",
        "/asistencia/asignacion-turnos",
        "/asistencia/recinto-trabajador",
        "/asistencia/morpho-marcas",
        "/asistencia/reportes/bono",
    }
    assert esperadas <= set(rutas), esperadas - set(rutas)


def test_nada_escribe_todavia():
    """Ningún endpoint muta nada hasta que DRY_RUN esté probado end-to-end.

    Los POST de /reportes son cálculo: usan el cuerpo para recibir el archivo de
    atrasos ya parseado, no para escribir.
    """
    from app.modules.asistencia.router import router
    escrituras = {
        r.path for r in router.routes
        if r.methods - {"GET"} and not r.path.startswith("/reportes/")
    }
    assert not escrituras, escrituras


def test_router_exige_el_modulo():
    """La autorización va en el router: no depende de que cada endpoint la ponga."""
    from app.modules.asistencia.router import router
    assert router.dependencies, "el router quedó sin require_module"


if __name__ == "__main__":
    test_flag_apagado_no_monta_ni_importa_el_router()
    test_flag_encendido_monta_las_lecturas()
    test_nada_escribe_todavia()
    test_router_exige_el_modulo()
    print("ok")
