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


def test_lo_unico_que_escribe_en_buk_es_marcas():
    """Buk no tiene ambiente de pruebas: cada escritura nueva debe ser deliberada.

    Los POST de /reportes son cálculo (reciben el archivo de atrasos ya parseado)
    y /operaciones escribe solo en la base de la plataforma.
    """
    from app.modules.asistencia.router import router
    locales = ("/reportes/", "/operaciones", "/notificar-jefatura")
    escrituras = {
        r.path for r in router.routes
        if r.methods - {"GET"} and not r.path.startswith(locales)
    }
    assert escrituras == {"/marcas"}, escrituras


def test_las_tablas_del_historial_estan_en_la_migracion():
    """El SQL se corre a mano: un nombre de tabla que no exista falla en runtime."""
    import re
    from pathlib import Path

    codigo = (
        Path("app/modules/asistencia/historial.py").read_text(encoding="utf-8")
        + Path("app/modules/asistencia/notificaciones.py").read_text(encoding="utf-8")
    )
    sql = Path("../docs/sql/modulo_asistencia_historial.sql").read_text(encoding="utf-8")

    usadas = set(re.findall(r"app\.asistencia_\w+", codigo))
    creadas = set(re.findall(r"CREATE TABLE IF NOT EXISTS (app\.asistencia_\w+)", sql))
    assert usadas <= creadas, usadas - creadas


def test_registrar_marcas_exige_rol_ademas_del_modulo():
    from app.modules.asistencia.router import router
    ruta = next(r for r in router.routes if r.path == "/marcas")
    assert ruta.dependencies, "/marcas quedó solo con el require_module del router"


def test_el_formulario_de_jefatura_es_publico():
    """Lo abre alguien sin cuenta: si quedara detrás de require_module, no sirve.

    A cambio, el token del enlace es la única credencial, así que el router
    público no puede exponer nada más.
    """
    from app.modules.asistencia.notificaciones import publico
    rutas = {r.path for r in publico.routes}
    assert rutas == {"/notificacion/{token}"}, rutas
    assert not publico.dependencies, "el router público no debe exigir autorización"


def test_dry_run_viene_encendido():
    """Sin configurar nada, el registro de marcas no envía a Buk."""
    from app.modules.asistencia.config import AsistenciaSettings
    assert AsistenciaSettings(_env_file=None).dry_run is True


def test_router_exige_el_modulo():
    """La autorización va en el router: no depende de que cada endpoint la ponga."""
    from app.modules.asistencia.router import router
    assert router.dependencies, "el router quedó sin require_module"


if __name__ == "__main__":
    test_flag_apagado_no_monta_ni_importa_el_router()
    test_flag_encendido_monta_las_lecturas()
    test_lo_unico_que_escribe_en_buk_es_marcas()
    test_las_tablas_del_historial_estan_en_la_migracion()
    test_registrar_marcas_exige_rol_ademas_del_modulo()
    test_el_formulario_de_jefatura_es_publico()
    test_dry_run_viene_encendido()
    test_router_exige_el_modulo()
    print("ok")
