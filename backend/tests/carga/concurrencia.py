"""Carreras del módulo de tickets: lo que tiene que salir bien bajo simultaneidad.

Corre DENTRO del contenedor, después de `preparar crear`, contra el servicio
directo (sin HTTP): lo que se prueba es la guarda del UPDATE condicional en
Postgres, no la red.

    python -m tests.carga.concurrencia --confirmo

Cada caso imprime ok/FALLA y el script sale con código 1 si alguno falla.
Deja tickets de prueba: `preparar limpiar` los borra.
"""
import argparse
import sys
import threading
import time
from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import text

from app.db.session import SessionLocal
from app.modules.tickets import service
from app.modules.tickets.auth import pwd
from app.modules.tickets.models import TkTipo, TkUsuario

from .preparar import CLAVE, DOMINIO, SLUG, _destino

FALLAS: list[str] = []


def verificar(ok: bool, caso: str, detalle: str = "") -> None:
    print(f"{'ok   ' if ok else 'FALLA'} {caso}{f' — {detalle}' if detalle else ''}")
    if not ok:
        FALLAS.append(caso)


def _contexto():
    db = SessionLocal()
    usuario = db.query(TkUsuario).filter(TkUsuario.email == f"carga-001@{DOMINIO}").first()
    tipo = db.query(TkTipo).filter(TkTipo.slug == SLUG).first()
    if not usuario or not tipo:
        sys.exit("Faltan los datos de prueba: corre `python -m tests.carga.preparar crear --confirmo`.")
    return db, usuario.id, tipo.id


def _ticket_nuevo(db, uid, tipo_id) -> int:
    u = db.get(TkUsuario, uid)
    return service.crear_ticket(db, u, tipo_id, date.today() + timedelta(days=5), {"menu": "Pollo"}, "concurrencia")


def _en_paralelo(n: int, fn) -> list:
    """Corre fn(i) en n hilos que arrancan juntos, cada uno con su sesión."""
    barrera = threading.Barrier(n)
    resultados = [None] * n

    def correr(i):
        db = SessionLocal()
        try:
            barrera.wait()
            resultados[i] = ("ok", fn(db, i))
        except HTTPException as e:
            resultados[i] = (e.status_code, e.detail)
        except Exception as e:  # cualquier otra cosa es un bug, no un rechazo
            resultados[i] = ("error", repr(e))
        finally:
            db.close()

    hilos = [threading.Thread(target=correr, args=(i,)) for i in range(n)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    return resultados


def _conteo(db, tid) -> tuple[int, int]:
    db.expire_all()
    fila = db.execute(text("""
        SELECT t.version_actual, (SELECT count(*) FROM tickets.versiones v WHERE v.ticket_id = t.id)
        FROM tickets.tickets t WHERE t.id = :id
    """), {"id": tid}).first()
    return fila[0], fila[1]


def ediciones_simultaneas(db, uid, tipo_id) -> None:
    """20 ediciones de la misma versión a la vez: gana una sola, el resto 409."""
    tid = _ticket_nuevo(db, uid, tipo_id)
    fecha = date.today() + timedelta(days=5)
    r = _en_paralelo(20, lambda s, i: service.editar_ticket(
        s, s.get(TkUsuario, uid), tid, fecha, {"menu": f"v{i}"}, 1, "concurrencia"))
    ganadas = sum(1 for x in r if x[0] == "ok")
    rechazos = sum(1 for x in r if x[0] == 409)
    errores = [x for x in r if x[0] == "error"]
    version, filas = _conteo(db, tid)
    verificar(ganadas == 1 and rechazos == 19 and not errores,
              "ediciones simultáneas: gana una sola", f"ganadas={ganadas} 409={rechazos} errores={errores[:1]}")
    verificar(version == 2 and filas == 2, "ediciones simultáneas: sin versiones perdidas ni duplicadas",
              f"version_actual={version} filas={filas}")


def admin_contra_usuario(db, uid, tipo_id, rondas: int = 25) -> None:
    """El admin pasa a 'en curso' en el mismo instante en que el usuario edita.
    Cualquiera puede ganar; lo que no puede pasar es quedar inconsistente."""
    malas = []
    for _ in range(rondas):
        tid = _ticket_nuevo(db, uid, tipo_id)
        fecha = date.today() + timedelta(days=5)

        def paso(s, i):
            if i == 0:
                return service.cambiar_estado(s, tid, "en_curso", None, "concurrencia")
            return service.editar_ticket(s, s.get(TkUsuario, uid), tid, fecha, {"menu": "x"}, 1, "concurrencia")

        r = _en_paralelo(2, paso)
        version, filas = _conteo(db, tid)
        estado = db.execute(text("SELECT estado FROM tickets.tickets WHERE id = :id"), {"id": tid}).scalar()
        if any(x[0] == "error" for x in r) or version != filas or estado != "en_curso":
            malas.append((tid, r, version, filas, estado))
    verificar(not malas, f"admin contra usuario ({rondas} rondas): siempre consistente",
              f"{len(malas)} inconsistentes, ej. {malas[:1]}")


def borde_del_plazo(db, uid, tipo_id) -> None:
    """Se editan sin parar mientras vence el plazo: ninguna versión puede quedar
    guardada después del vencimiento."""
    tid = _ticket_nuevo(db, uid, tipo_id)
    db.execute(text("UPDATE tickets.tickets SET plazo = NOW() + interval '1.5 seconds' WHERE id = :id"), {"id": tid})
    db.commit()
    plazo = db.execute(text("SELECT plazo FROM tickets.tickets WHERE id = :id"), {"id": tid}).scalar()
    fecha = date.today() + timedelta(days=5)

    # El plazo de la fecha nueva lo recalcula el servicio con la regla del
    # tipo (lejos en el futuro); por eso acá se prueba la guarda `plazo > NOW()`
    # sobre el plazo vigente del ticket, que es la que importa en el borde.
    fin = time.time() + 3
    while time.time() < fin:
        s = SessionLocal()
        try:
            v = _conteo(s, tid)[0]
            # Sin tocar el plazo al editar: se restaura el vencimiento corto
            # tras cada éxito para que el borde siga ahí.
            service.editar_ticket(s, s.get(TkUsuario, uid), tid, fecha, {"menu": "x"}, v, "concurrencia")
            s.execute(text("UPDATE tickets.tickets SET plazo = :p WHERE id = :id"), {"p": plazo, "id": tid})
            s.commit()
        except HTTPException:
            pass
        finally:
            s.close()
        time.sleep(0.05)

    tardias = db.execute(text(
        "SELECT count(*) FROM tickets.versiones WHERE ticket_id = :id AND created_at >= :p"
    ), {"id": tid, "p": plazo}).scalar()
    verificar(tardias == 0, "borde del plazo: nada se guarda después de vencer", f"versiones tardías={tardias}")


def costo_login() -> None:
    """bcrypt es CPU pura en el único proceso del backend: este número manda
    cuánto tarda la fila cuando mucha gente entra a la vez."""
    h = pwd.hash(CLAVE)
    t0 = time.perf_counter()
    for _ in range(10):
        pwd.verify(CLAVE, h)
    ms = (time.perf_counter() - t0) / 10 * 1000
    print(f"info  bcrypt: {ms:.0f} ms por login → 100 ingresos simultáneos ≈ {ms * 100 / 1000:.1f} s de CPU")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--confirmo", action="store_true")
    args = ap.parse_args()
    print(f"Base: {_destino()}")
    if not args.confirmo:
        sys.exit("Revisa la base de arriba y repite con --confirmo.")

    db, uid, tipo_id = _contexto()
    ediciones_simultaneas(db, uid, tipo_id)
    admin_contra_usuario(db, uid, tipo_id)
    borde_del_plazo(db, uid, tipo_id)
    costo_login()
    db.close()
    sys.exit(1 if FALLAS else 0)
