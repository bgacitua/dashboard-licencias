"""Datos para la prueba de carga del módulo de tickets: crear y limpiar.

Corre DENTRO del contenedor del backend, que ya tiene la conexión y el
secreto. Así los tokens se generan sin pasar por /login, que tiene rate limit
por IP y bloquearía a los usuarios simulados, que salen todos de la misma IP.

    python -m tests.carga.preparar crear --usuarios 200 --confirmo
    python -m tests.carga.preparar limpiar --confirmo

`crear` escribe tests/carga/tokens.json. Son credenciales del portal para
usuarios de prueba y vencen con TICKETS_SESION_HORAS: se borran al terminar.

Solo toca lo marcado como prueba: correos @prueba-carga.invalid y el tipo
con slug `prueba-carga`. `limpiar` borra exactamente eso y nada más.
"""
import argparse
import json
import sys
from datetime import time
from pathlib import Path

from app.core.config import settings as app_settings
from app.db.session import SessionLocal
from app.modules.tickets.auth import crear_token, pwd
from app.modules.tickets.models import TkTicket, TkTipo, TkUsuario

DOMINIO = "prueba-carga.invalid"
SLUG = "prueba-carga"
# Clave conocida para medir el login a pequeña escala. Estas cuentas solo
# existen durante la prueba y usan un dominio que no recibe correo.
CLAVE = "PruebaCarga2026"
SALIDA = Path(__file__).with_name("tokens.json")

DEFINICION = {
    "pages": [{
        "name": "p1",
        "elements": [
            {"type": "dropdown", "name": "menu", "title": "Menú", "isRequired": True,
             "choices": ["Pollo", "Vegetariano", "Pescado"]},
            {"type": "text", "inputType": "number", "name": "cantidad", "title": "Personas", "min": 1, "max": 50},
            {"type": "comment", "name": "notas", "title": "Notas"},
        ],
    }],
}


def _destino() -> str:
    return f"{app_settings.DB_USER}@{app_settings.DB_HOST}:{app_settings.DB_PORT}/{app_settings.DB_NAME}"


def crear(n: int) -> None:
    db = SessionLocal()
    try:
        tipo = db.query(TkTipo).filter(TkTipo.slug == SLUG).first()
        if not tipo:
            # Activo a la fuerza: el portal solo acepta tickets de tipos activos.
            # Se ve en el portal mientras dura la prueba; limpiar lo borra.
            tipo = TkTipo(
                slug=SLUG, nombre="[PRUEBA] Carga — no usar",
                descripcion="Tipo temporal de la prueba de carga.",
                definicion=DEFINICION, dias_anticipacion=0, hora_limite=time(23, 59),
                activo=True, orden=0,
            )
            db.add(tipo)

        hash_ = pwd.hash(CLAVE)  # una vez: bcrypt por usuario serían minutos
        existentes = {
            u.email for u in db.query(TkUsuario.email).filter(TkUsuario.email.like(f"%@{DOMINIO}"))
        }
        for i in range(1, n + 1):
            email = f"carga-{i:03d}@{DOMINIO}"
            if email not in existentes:
                db.add(TkUsuario(email=email, nombre=f"Usuario de carga {i:03d}",
                                 password_hash=hash_, estado="activo", activado_por="prueba-carga"))
        db.commit()

        usuarios = (
            db.query(TkUsuario).filter(TkUsuario.email.like(f"%@{DOMINIO}"))
            .order_by(TkUsuario.email).limit(n).all()
        )
        SALIDA.write_text(json.dumps(
            [{"email": u.email, "token": crear_token(u)} for u in usuarios], indent=0,
        ))
        print(f"ok  {len(usuarios)} usuarios, tipo #{tipo.id}, tokens en {SALIDA}")
    finally:
        db.close()


def limpiar() -> None:
    db = SessionLocal()
    try:
        ids = [u.id for u in db.query(TkUsuario.id).filter(TkUsuario.email.like(f"%@{DOMINIO}"))]
        tipo = db.query(TkTipo).filter(TkTipo.slug == SLUG).first()
        # Tickets de los usuarios de prueba y del tipo de prueba. Versiones y
        # eventos caen solos (ON DELETE CASCADE).
        q = db.query(TkTicket).filter(
            (TkTicket.usuario_id.in_(ids)) | (TkTicket.tipo_id == (tipo.id if tipo else -1))
        )
        n_tickets = q.delete(synchronize_session=False)
        n_usuarios = db.query(TkUsuario).filter(TkUsuario.id.in_(ids)).delete(synchronize_session=False)
        if tipo:
            db.delete(tipo)
        db.commit()
        SALIDA.unlink(missing_ok=True)
        print(f"ok  borrados {n_tickets} tickets, {n_usuarios} usuarios y {'1' if tipo else '0'} tipo")
    finally:
        db.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("accion", choices=["crear", "limpiar"])
    ap.add_argument("--usuarios", type=int, default=200)
    # Sin esto no hace nada: primero muestra contra qué base va a escribir.
    ap.add_argument("--confirmo", action="store_true")
    args = ap.parse_args()

    print(f"Base: {_destino()}")
    if not args.confirmo:
        sys.exit("Revisa la base de arriba y repite con --confirmo.")
    crear(args.usuarios) if args.accion == "crear" else limpiar()
