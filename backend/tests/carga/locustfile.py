"""Carga del portal de tickets: trabajadores pidiendo en la hora punta.

Se corre desde un equipo con locust instalado (no va en requirements):

    pip install locust
    TK_TOKENS=tokens.json locust -f backend/tests/carga/locustfile.py --host https://personas.cramer.cl

y se abre http://localhost:8089 para elegir usuarios y ritmo de subida.

Cada usuario simulado hace lo que haría una persona 5 minutos antes del
cierre: mira el portal, pide una o dos cosas, corrige, comenta. Los topes por
usuario (3 tickets, 5 comentarios) mantienen el ritmo realista y por debajo
del rate limit por usuario del backend; un 429 cuenta como falla, porque
significa que la simulación dejó de parecerse al uso real.
"""
import json
import os
import random
from datetime import date, timedelta
from itertools import cycle

from locust import HttpUser, between, task

BASE = "/api/v1/tickets/portal"
_credenciales = cycle(json.load(open(os.environ.get("TK_TOKENS", "tokens.json"))))
TIPO_PRUEBA = "[PRUEBA] Carga — no usar"
# Pausa entre acciones, en segundos. "2,8" es el ritmo de una persona; para
# buscar el punto de quiebre, TK_ESPERA=0,0.5 (unas 10 veces más rápido).
ESPERA = [float(x) for x in os.environ.get("TK_ESPERA", "2,8").split(",")]


def _datos() -> dict:
    return {
        "menu": random.choice(["Pollo", "Vegetariano", "Pescado"]),
        "cantidad": random.randint(1, 20),
        "notas": random.choice(["", "Sin sal", "Una porción extra", "Entregar en sala 3"]),
    }


class Trabajador(HttpUser):
    wait_time = between(*ESPERA)

    def on_start(self):
        self.client.headers["Authorization"] = f"Bearer {next(_credenciales)['token']}"
        tipos = self.client.get(f"{BASE}/tipos", name="tipos").json()
        self.tipo = next((t["id"] for t in tipos if t["nombre"] == TIPO_PRUEBA), None)
        if self.tipo is None:
            raise RuntimeError("No está el tipo de prueba: corre `preparar crear` antes.")
        self.mios: list[int] = []
        self.creados = self.comentarios = 0
        self.crear()  # nadie entra a la hora punta a no pedir nada

    @task(6)
    def inicio(self):
        self.client.get(f"{BASE}/me", name="me")
        self.client.get(f"{BASE}/tipos", name="tipos")
        r = self.client.get(f"{BASE}/tickets", name="mis tickets")
        if r.ok:
            self.mios = [t["id"] for t in r.json()][:20]

    @task(4)
    def ver(self):
        if self.mios:
            self.client.get(f"{BASE}/tickets/{random.choice(self.mios)}", name="ver ticket")

    @task(2)
    def crear(self):
        if self.creados >= 3:
            return
        r = self.client.post(f"{BASE}/tickets", name="crear", json={
            "tipo_id": self.tipo,
            "fecha_servicio": (date.today() + timedelta(days=random.randint(1, 20))).isoformat(),
            "datos": _datos(),
        })
        if r.ok:
            self.creados += 1
            self.mios.append(r.json()["id"])

    @task(3)
    def editar(self):
        if not self.mios:
            return
        tid = random.choice(self.mios)
        d = self.client.get(f"{BASE}/tickets/{tid}", name="ver ticket")
        if not d.ok or not d.json()["editable"]:
            return
        t = d.json()
        with self.client.put(f"{BASE}/tickets/{tid}", name="editar", catch_response=True, json={
            "fecha_servicio": t["fecha_servicio"], "datos": _datos(), "version": t["version_actual"],
        }) as r:
            # 409 = otra pestaña (u otro usuario simulado con el mismo token)
            # editó entre medio. Es el comportamiento correcto, no una falla.
            if r.status_code == 409:
                r.success()

    @task(1)
    def comentar(self):
        if self.mios and self.comentarios < 5:
            self.client.post(f"{BASE}/tickets/{random.choice(self.mios)}/comentarios",
                             name="comentar", json={"texto": "¿Se puede cambiar la hora de entrega?"})
            self.comentarios += 1
