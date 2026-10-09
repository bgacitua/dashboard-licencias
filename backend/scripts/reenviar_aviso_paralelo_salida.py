"""Manda el aviso paralelo de salida para los correos que se enviaron sin él.

Entre el deploy del aviso paralelo y el fix de normalización del RUT, la
consulta a rh.employees comparaba el RUT en crudo contra el formato
xx.xxx.xxx-x y nunca devolvía fila: el aviso principal salía y el paralelo se
saltaba en silencio. Esto recorre los procesos de esa ventana y manda el que
faltó.

    cd backend
    .venv/bin/python scripts/reenviar_aviso_paralelo_salida.py                    # dry-run
    .venv/bin/python scripts/reenviar_aviso_paralelo_salida.py --enviar
    .venv/bin/python scripts/reenviar_aviso_paralelo_salida.py --ruts 12345678-9,9876543-2 --enviar

Dry-run por defecto: lista a quién le llegaría qué y no manda nada. Reusa
enviar_correo_salida_paralelo(), así que el correo es idéntico al que sale en
vivo y respeta EMAIL_TEST_REDIRECT. No toca el aviso principal.

Consulta con el rol de solo lectura: necesita DB_RO_USER y DB_RO_PASSWORD
configuradas, y falla con un mensaje claro si no están.

No lleva control de reintento: correrlo dos veces con --enviar manda el correo
dos veces.
"""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.session import readonly_session  # noqa: E402
from app.services.correo_salida_paralelo import enviar_correo_salida_paralelo  # noqa: E402

# Ventana del bug: PR #73 (deploy del paralelo) hasta PR #112 (fix del RUT).
DESDE_POR_DEFECTO = "2026-10-02"
HASTA_POR_DEFECTO = "2026-10-09"


def limpiar_rut(valor: str) -> str:
    """Misma normalización que la consulta: sin puntos ni guion, en minúsculas."""
    return re.sub(r"[^0-9kK]", "", valor or "").lower()


def procesos_con_correo(db, desde: str, hasta: str) -> list[dict]:
    """Procesos con el aviso de salida ya enviado dentro de la ventana.

    `hasta` es exclusivo. Se trae el nombre de rh.employees solo para que el
    listado del dry-run sea legible; el correo lo arma el servicio por su
    cuenta.
    """
    filas = db.execute(
        text("""
            SELECT p.rut,
                   COALESCE(p.salida_fecha, p.fecha_termino) AS fecha_salida,
                   p.correo_enviado_at,
                   e.full_name AS nombre
            FROM app.desvinculacion_proceso AS p
            LEFT JOIN LATERAL (
                SELECT DISTINCT ON (lower(regexp_replace(e2.rut, '[^0-9kK]', '', 'g')))
                       e2.full_name
                FROM rh.employees AS e2
                WHERE lower(regexp_replace(e2.rut, '[^0-9kK]', '', 'g'))
                    = lower(regexp_replace(p.rut, '[^0-9kK]', '', 'g'))
                ORDER BY lower(regexp_replace(e2.rut, '[^0-9kK]', '', 'g')),
                         e2.active_since DESC NULLS LAST
            ) AS e ON TRUE
            WHERE p.correo_enviado_at >= CAST(:desde AS date)
              AND p.correo_enviado_at <  CAST(:hasta AS date)
            ORDER BY p.correo_enviado_at
        """),
        {"desde": desde, "hasta": hasta},
    ).mappings()
    return [dict(f) for f in filas]


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--desde", default=DESDE_POR_DEFECTO, help="yyyy-mm-dd (inclusive)")
    p.add_argument("--hasta", default=HASTA_POR_DEFECTO, help="yyyy-mm-dd (exclusivo)")
    p.add_argument("--ruts", default="",
                   help="lista separada por comas; limita el envío a esos RUT")
    p.add_argument("--enviar", action="store_true",
                   help="manda los correos de verdad; sin esto solo lista")
    args = p.parse_args()

    destino = settings.SALIDA_PERSONAL_PARALELO_TO.strip()
    if not destino:
        print("SALIDA_PERSONAL_PARALELO_TO está vacía: no hay a quién avisar.")
        return 1

    # Solo lee: va con el rol RO para que ni un error de tipeo pueda escribir.
    db = readonly_session()
    try:
        pendientes = procesos_con_correo(db, args.desde, args.hasta)

        filtro = {limpiar_rut(r) for r in args.ruts.split(",") if r.strip()}
        if filtro:
            pendientes = [n for n in pendientes if limpiar_rut(n["rut"]) in filtro]
            sobran = filtro - {limpiar_rut(n["rut"]) for n in pendientes}
            for rut in sorted(sobran):
                print(f"  OJO  {rut}: sin proceso con correo en la ventana; se omite")

        print(f"{len(pendientes)} proceso(s) entre {args.desde} y {args.hasta} -> {destino}"
              f"{'' if args.enviar else '  [DRY-RUN, no se manda nada]'}\n")

        fallidos = 0
        for n in pendientes:
            salida = f"{n['fecha_salida']:%d-%m-%Y}" if n["fecha_salida"] else "sin fecha"
            etiqueta = (f"  {n['correo_enviado_at']:%d-%m-%Y} · "
                        f"{n['nombre'] or n['rut']} ({n['rut']}) · salida {salida}")
            if n["fecha_salida"] is None:
                # El cuerpo del aviso lleva la fecha; sin ella no se manda nada.
                print(etiqueta + "  -> SIN FECHA DE SALIDA, se omite")
                fallidos += 1
                continue
            if not args.enviar:
                print(etiqueta)
                continue
            ok = enviar_correo_salida_paralelo(db, n["rut"], n["fecha_salida"])
            print(etiqueta + ("  -> enviado" if ok else "  -> FALLÓ (ver el log)"))
            fallidos += 0 if ok else 1
    finally:
        db.close()

    if not args.enviar and pendientes:
        print("\nAgrega --enviar para mandarlos.")
    if fallidos:
        print(f"\n{fallidos} sin enviar: revisar a mano.")
    return 1 if fallidos else 0


if __name__ == "__main__":
    raise SystemExit(main())
