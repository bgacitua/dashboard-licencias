"""Rate limiting en memoria para los endpoints de autenticación.

Ventana deslizante por clave (IP, usuario, token). Suficiente para frenar
fuerza bruta contra login, OTP e invitaciones.

ponytail: el estado vive en el proceso, así que con varios workers el límite
efectivo se multiplica por la cantidad de workers. Si algún día eso importa,
mover el contador a Redis o a una tabla; la firma de check_rate_limit no cambia.
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.core.logging_config import logger

_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()

# Cada cuántas llamadas barrer claves viejas, para que el dict no crezca sin techo.
_CLEANUP_EVERY = 500
_calls = 0


def _purge(now: float) -> None:
    """Elimina claves cuyos intentos ya se salieron de cualquier ventana razonable."""
    for key in [k for k, v in _hits.items() if not v or now - v[-1] > 3600]:
        del _hits[key]


def check_rate_limit(key: str, max_attempts: int, window_seconds: int) -> None:
    """Registra un intento para `key`. Lanza 429 si supera el límite en la ventana.

    El intento se cuenta siempre, también el que dispara el bloqueo: reintentar
    en caliente extiende el castigo en vez de acortarlo.
    """
    global _calls
    now = time.time()

    with _lock:
        _calls += 1
        if _calls % _CLEANUP_EVERY == 0:
            _purge(now)

        hits = _hits[key]
        while hits and now - hits[0] > window_seconds:
            hits.popleft()

        hits.append(now)
        if len(hits) > max_attempts:
            retry_after = int(window_seconds - (now - hits[0])) + 1
            logger.warning(f"Rate limit alcanzado para {key} ({len(hits)} intentos)")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
                headers={"Retry-After": str(retry_after)},
            )


def client_ip(request: Request) -> str:
    """IP del cliente respetando el X-Forwarded-For que pone el proxy."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "desconocido"


def reset_rate_limit(key: str) -> None:
    """Limpia el contador de una clave. Se usa tras un login exitoso."""
    with _lock:
        _hits.pop(key, None)
