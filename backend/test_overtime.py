"""Self-check de la lógica de semana/cierre de horas extras.

Ejecutar dentro del contenedor backend (necesita .env para cargar settings):
    python test_overtime.py
"""

from datetime import datetime, timedelta

from pytz import timezone

from app.core.config import settings
from app.services.overtime_service import week_window, _summary_email_html


def _at(y, m, d, hh, mm=0):
    return timezone(settings.ALERTS_SCHEDULER_TIMEZONE).localize(datetime(y, m, d, hh, mm))


def demo():
    settings.OVERTIME_DEADLINE_DAY = "fri"
    settings.OVERTIME_DEADLINE_HOUR = 15
    settings.OVERTIME_DEADLINE_MINUTE = 0

    # Jueves 2026-07-30 09:00 → semana del lunes 27, cierre viernes 31 a las 15:00
    w = week_window(_at(2026, 7, 30, 9))
    assert str(w["week_start"]) == "2026-07-27", w["week_start"]
    assert w["deadline"] == _at(2026, 7, 31, 15), w["deadline"]
    assert str(w["sabado"]) == "2026-08-01" and str(w["domingo"]) == "2026-08-02"

    # Lunes temprano: misma semana, el cierre aún no pasa
    assert str(week_window(_at(2026, 7, 27, 6))["week_start"]) == "2026-07-27"

    # Justo en el deadline y después → avanza a la semana siguiente
    assert str(week_window(_at(2026, 7, 31, 15))["week_start"]) == "2026-08-03"
    assert str(week_window(_at(2026, 8, 1, 10))["week_start"]) == "2026-08-03"

    # El cierre siempre queda en el futuro respecto de "ahora"
    now = _at(2026, 7, 30, 9)
    assert week_window(now)["deadline"] > now

    # Consolidado: cuenta por día y detecta jefaturas sin responder
    rows = [
        {"boss_rut": "1-9", "boss_name": "Ana", "boss_email": "a@x.cl", "responded_at": "31-07-2026 10:00",
         "employee_rut": "2-7", "employee_name": "Juan", "cargo": "Op", "area": "Planta",
         "sabado": True, "domingo": False},
        {"boss_rut": "1-9", "boss_name": "Ana", "boss_email": "a@x.cl", "responded_at": "31-07-2026 10:00",
         "employee_rut": "3-5", "employee_name": "Eva", "cargo": "Op", "area": "Planta",
         "sabado": True, "domingo": True},
        {"boss_rut": "4-3", "boss_name": "Luis", "boss_email": "l@x.cl", "responded_at": None,
         "employee_rut": None, "employee_name": None, "cargo": None, "area": None,
         "sabado": None, "domingo": None},
    ]
    html = _summary_email_html(w["week_start"], rows)
    assert "Sábado:</strong> 2" in html, html[:400]
    assert "Domingo:</strong> 1" in html
    assert "Jefaturas sin responder:</strong> Luis" in html
    assert "Juan" in html and "Eva" in html

    print("OK — week_window y consolidado correctos")


if __name__ == "__main__":
    demo()
