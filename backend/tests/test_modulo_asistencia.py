"""Check del cableado del módulo de asistencia.

Verifica lo único no trivial del esqueleto: que el flag realmente decida si las
rutas existen, y que con el flag apagado el paquete del módulo ni se importe.
"""
import subprocess
import sys
import textwrap


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
        env={**__import__("os").environ, "ASISTENCIA_ENABLED": enabled},
    )
    import json
    return json.loads(salida.stdout.strip().splitlines()[-1])


def test_flag_apagado_no_monta_ni_importa_el_router():
    rutas, cargados = _rutas_con("false")
    assert not any("/asistencia" in r for r in rutas)
    assert "app.modules.asistencia.router" not in cargados


def test_flag_encendido_monta_health():
    rutas, _ = _rutas_con("true")
    assert "/asistencia/health" in rutas


if __name__ == "__main__":
    test_flag_apagado_no_monta_ni_importa_el_router()
    test_flag_encendido_monta_health()
    print("ok")
