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


def test_el_allowlist_de_escrituras_esta_al_dia():
    """Buk no tiene ambiente de pruebas: cada escritura nueva debe ser deliberada.

    Este test no decide si la ruta toca Buk (de eso se encarga el de dry_run);
    exige que nadie agregue un verbo de escritura sin declarar acá qué escribe.
    Si falla, la pregunta no es "cómo lo hago pasar" sino "esta ruta escribe en
    Buk y, si lo hace, pasa por dry_run".
    """
    from app.modules.asistencia.router import router

    # ruta -> por qué existe y, sobre todo, DÓNDE escribe.
    deliberadas = {
        # ESCRIBE EN BUK (irreversible): manda las marcas al sistema real.
        # Gateada por rol admin (dependencies propias) y por dry_run.
        "/marcas": "crea marcas en Buk",
        # ESCRIBE EN BUK (irreversible): crea el permiso del trabajador.
        # Rol admin y el mismo dry_run que /marcas. El motivo sale de la base,
        # no del request: el token del enlace no alcanza para elegir qué crear.
        "/notificaciones/{token}/{fecha}/permiso": "crea un permiso en Buk",
        # LOCAL: solo marca la respuesta como gestionada en app.asistencia_*.
        "/notificaciones/{token}/{fecha}/descartar": "marca gestión local",
        # LOCAL: idem, deja constancia de que la marca se arregla en otro flujo
        # (Corrección de Marcas) en vez de quedar como "descartada".
        "/notificaciones/{token}/{fecha}/marca-registrada": "marca gestión local",
        # LOCAL: calcula el tramo de presencialidad y lo guarda en la base de la
        # plataforma. De Buk y de Morpho solo lee. Es idempotente por tramo.
        "/presencialidad/calcular": "calcula y guarda presencialidad local",
        # LOCAL respecto de Buk: dispara el job diario de ausencias. Contra Buk
        # solo LEE; lo que persiste son las rachas avisadas, en la base de la
        # plataforma. POST y rol admin porque manda un correo real.
        "/ausencias-consecutivas/correr": "corre el job de ausencias (correo)",
    }
    # Prefijos ya auditados como cálculo puro o escritura local, y que crecen
    # seguido: /reportes solo calcula sobre lo que recibe en el cuerpo (el
    # frontend parsea el archivo de atrasos), /operaciones y /notificar-jefatura
    # escriben en la base de la plataforma, y /hhee dispara el barrido del
    # contenedor hhee-scrapping, que contra Buk solo LEE.
    locales = ("/reportes/", "/operaciones", "/notificar-jefatura", "/hhee/")
    escrituras = {
        r.path for r in router.routes
        if r.methods - {"GET"} and not r.path.startswith(locales)
    }
    assert escrituras == set(deliberadas), escrituras ^ set(deliberadas)


def test_toda_escritura_saliente_pasa_por_dry_run():
    """Lo que de verdad importa: ningún POST/PUT/PATCH/DELETE hacia la red sale
    sin haber consultado antes settings.dry_run en la misma función.

    El allowlist de rutas se queda atrás con cada endpoint nuevo; esto no: mira
    el código del módulo entero, así que una escritura saliente nueva —venga de
    un endpoint, de un job o de un helper— tiene que traer su guard o rompe acá.
    """
    import ast
    from pathlib import Path

    escrituras_http = {"post", "put", "patch", "delete"}
    # Funciones que hoy escriben hacia afuera. Está acá para que sumar una sea
    # un cambio visible en el test, no para validar el guard (eso es sin_guard).
    conocidas = {("marcas.py", "registrar"), ("permisos.py", "crear")}

    encontradas: set[tuple[str, str]] = set()
    sin_guard: list[str] = []

    for archivo in sorted(Path("app/modules/asistencia").rglob("*.py")):
        arbol = ast.parse(archivo.read_text(encoding="utf-8"))
        for fn in ast.walk(arbol):
            if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            # Solo el cuerpo: los decoradores (@router.post) también cuelgan
            # del FunctionDef y no son llamadas a la red.
            cuerpo = [n for st in fn.body for n in ast.walk(st)]
            # Línea de la primera consulta a dry_run dentro de la función.
            guard = min(
                (n.lineno for n in cuerpo
                 if isinstance(n, ast.Attribute) and n.attr == "dry_run"),
                default=None,
            )
            for n in cuerpo:
                # cli.post(...) / client.post(...): la llamada a la red, sobre
                # un cliente httpx que vive en una variable local.
                es_llamada = (
                    isinstance(n, ast.Call)
                    and isinstance(n.func, ast.Attribute)
                    and n.func.attr in escrituras_http
                    and isinstance(n.func.value, ast.Name)
                )
                if not es_llamada:
                    continue
                encontradas.add((archivo.name, fn.name))
                if guard is None or guard > n.lineno:
                    sin_guard.append(f"{archivo.name}:{n.lineno} en {fn.name}()")

    assert not sin_guard, (
        "escritura saliente sin pasar antes por settings.dry_run: "
        + ", ".join(sin_guard)
    )
    assert encontradas == conocidas, (
        "cambió el conjunto de funciones que escriben hacia afuera: "
        f"{encontradas ^ conocidas}"
    )


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


def test_la_marca_exige_motivo():
    """El motivo lo decide el cruce con los intentos; un default lo taparía."""
    from pydantic import ValidationError
    from app.modules.asistencia.schemas import MarcaIn

    try:
        MarcaIn(rut="1-9", i="entrada", fecha="20/6/2026", hora="8:0:0")
        raise AssertionError("mov debería ser obligatorio")
    except ValidationError:
        pass


def test_el_motivo_de_olvido_calza_con_el_dispositivo_del_bono():
    """El bono cuenta olvidos por el dispositivo que Buk arma con el motivo.

    Buk expone la marca como "API-<motivo>", y el reporte de bono busca
    "API-Olvido de marca". Si el motivo que manda el frontend cambia, el olvido
    deja de contarse y el bono sale inflado, sin ningún error visible.
    """
    import re
    from pathlib import Path

    from app.modules.asistencia.reportes.incidencias import AUD_DISPOSITIVO_OLVIDO

    js = Path("../frontend/src/features/asistencia/correccion.js").read_text(encoding="utf-8")
    motivo = re.search(r"MOTIVO_OLVIDO = '([^']+)'", js).group(1)
    assert AUD_DISPOSITIVO_OLVIDO == f"API-{motivo}", (AUD_DISPOSITIVO_OLVIDO, motivo)


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
    test_el_allowlist_de_escrituras_esta_al_dia()
    test_toda_escritura_saliente_pasa_por_dry_run()
    test_las_tablas_del_historial_estan_en_la_migracion()
    test_registrar_marcas_exige_rol_ademas_del_modulo()
    test_el_formulario_de_jefatura_es_publico()
    test_la_marca_exige_motivo()
    test_el_motivo_de_olvido_calza_con_el_dispositivo_del_bono()
    test_dry_run_viene_encendido()
    test_router_exige_el_modulo()
    print("ok")
