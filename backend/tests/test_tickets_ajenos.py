"""Self-check del portal de tickets: nadie entra a la solicitud de otro.

El id del ticket va en la URL y es correlativo (/tickets/t/37), así que
adivinar el de otra persona es trivial. Lo único que lo sostiene es que cada
camino del portal compara el dueño, y hoy esa comparación está escrita a mano
en cuatro services distintos. Esto la fija: si alguien agrega un quinto camino
con `ticket_id` y se olvida, acá se cae.

Todas las respuestas tienen que ser 404 y no 403. Un 403 confirmaría que la
solicitud existe, y con ids correlativos eso ya es filtrar información.

Necesita Postgres con el esquema `tickets` y se salta solo si no hay base.
Escribe dos usuarios, un tipo y un ticket marcados con el sufijo de abajo, y
los borra al terminar.

Ejecutar dentro del contenedor backend:
    python -m tests.test_tickets_ajenos
"""
from datetime import date, datetime, time, timedelta, timezone

MARCA = "_selfcheck_ajenos"
DOMINIO = "selfcheck-ajenos.invalid"


def _sin_base(e: Exception) -> None:
    print(f"skip tickets ajenos (sin base o sin el esquema tickets: {e})")


def test_nadie_entra_al_ticket_de_otro():  # noqa: C901 - es una batería, se lee en orden
    from fastapi import HTTPException
    from sqlalchemy import text

    from app.db.session import SessionLocal
    from app.modules.tickets import service
    from app.modules.tickets.models import TkTicket, TkTipo, TkUsuario, TkVersion

    try:
        db = SessionLocal()
        db.execute(text("SELECT 1 FROM tickets.tickets LIMIT 1"))
    except Exception as e:  # noqa: BLE001 - cualquier fallo de base es "no hay base"
        _sin_base(e)
        return

    def borrar() -> None:
        db.execute(text(
            "DELETE FROM tickets.tickets WHERE usuario_id IN "
            "(SELECT id FROM tickets.usuarios WHERE email LIKE :d)"
        ), {"d": f"%@{DOMINIO}"})
        db.execute(text("DELETE FROM tickets.usuarios WHERE email LIKE :d"), {"d": f"%@{DOMINIO}"})
        db.execute(text("DELETE FROM tickets.tipos WHERE slug = :s"), {"s": MARCA})
        db.commit()

    # Una corrida anterior interrumpida no puede hacer fallar esta por el
    # índice único del correo.
    borrar()

    try:
        tipo = TkTipo(
            slug=MARCA, nombre="[SELFCHECK] Tickets ajenos",
            descripcion="Tipo temporal del self-check. Se borra al terminar.",
            definicion={"pages": []}, dias_anticipacion=0, hora_limite=time(23, 59),
            activo=False, orden=0,
        )
        duenio = TkUsuario(email=f"duenio@{DOMINIO}", nombre="Dueño", estado="activo",
                           password_hash="x", activado_por=MARCA)
        intruso = TkUsuario(email=f"intruso@{DOMINIO}", nombre="Intruso", estado="activo",
                            password_hash="x", activado_por=MARCA)
        db.add_all([tipo, duenio, intruso])
        db.commit()

        manana = date.today() + timedelta(days=1)
        ticket = TkTicket(
            tipo_id=tipo.id, usuario_id=duenio.id, estado="pendiente", fecha_servicio=manana,
            hora_inicio=time(9, 0), hora_fin=time(11, 0),
            servicio_inicio=time(9, 30), servicio_fin=time(10, 0),
            reserva_id="reserva-selfcheck", reserva_asunto="Comité", reserva_sala="Sala 1",
            plazo=datetime.now(timezone.utc) + timedelta(days=1), version_actual=1,
        )
        db.add(ticket)
        db.commit()
        db.add(TkVersion(
            ticket_id=ticket.id, version=1, fecha_servicio=manana,
            hora_inicio=time(9, 0), hora_fin=time(11, 0),
            servicio_inicio=time(9, 30), servicio_fin=time(10, 0),
            reserva_id="reserva-selfcheck", datos={"algo": "privado"}, estado="vigente",
        ))
        db.commit()

        def da_404(fn, que: str) -> None:
            """La llamada tiene que rebotar con 404, no con otra cosa ni pasar."""
            try:
                fn()
            except HTTPException as e:
                assert e.status_code == 404, f"{que}: respondió {e.status_code}, se esperaba 404"
                return
            raise AssertionError(f"{que}: no rebotó, el intruso llegó a la solicitud ajena")

        # Control positivo. Sin esto, la batería pasaría igual con un ticket que
        # no existe o un fixture mal armado: todo daría 404 por la razón
        # equivocada y el test no probaría nada.
        propio = service.detalle_ticket(db, ticket.id, usuario_id=duenio.id)
        assert propio["id"] == ticket.id
        assert propio["datos"] == {"algo": "privado"}

        # === Los cuatro caminos del portal que reciben un id ===
        da_404(lambda: service.detalle_ticket(db, ticket.id, usuario_id=intruso.id), "ver el detalle")
        da_404(lambda: service.cancelar_ticket(db, intruso, ticket.id, None), "cancelar")
        # El dueño se compara antes de cualquier llamada a Graph, así que esto
        # no sale a la red.
        da_404(
            lambda: service.proponer_cambio(
                db, intruso, ticket.id, "reserva-selfcheck",
                time(9, 30), time(10, 0), {"algo": "otro"}, 1, "127.0.0.1",
            ),
            "proponer un cambio",
        )
        da_404(
            lambda: service.reservas_con_disponibilidad(db, intruso, excluir_ticket=ticket.id),
            "usar el ticket ajeno como excluir_ticket",
        )

        # El listado no filtra por id sino por dueño: el ajeno no aparece.
        mios = service.listar_tickets(db, usuario_id=intruso.id)
        assert ticket.id not in [t["id"] for t in mios], "el ticket ajeno salió en el listado"

        # Un ticket ajeno y uno inexistente responden igual. Si se distinguieran,
        # con ids correlativos se podría mapear cuántas solicitudes hay y de
        # quién, sin ver ninguna.
        inexistente = db.execute(text("SELECT COALESCE(MAX(id), 0) + 1000 FROM tickets.tickets")).scalar()
        da_404(lambda: service.detalle_ticket(db, inexistente, usuario_id=intruso.id), "ver uno inexistente")

        print("ok  nadie entra al ticket de otro")
    finally:
        borrar()
        db.close()


if __name__ == "__main__":
    test_nadie_entra_al_ticket_de_otro()
    print("todo ok")
