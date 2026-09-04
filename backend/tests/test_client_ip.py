"""Self-check de client_ip: la clave del rate limit no la elige el cliente.

client_ip produce la clave con la que check_rate_limit cuenta intentos. Si el
que llama puede influir en ese valor, cambia de clave en cada request y el
limite deja de existir: fuerza bruta contra el login y barrido de RUTs contra
el gate de formularios.

Ejecutar dentro del contenedor backend:
    python -m tests.test_client_ip
"""

from starlette.requests import Request

from app.core.rate_limit import client_ip


def _request(headers: dict, peer: str | None = "10.0.0.9") -> Request:
    """Request minimo: solo cabeceras y socket, que es lo que mira client_ip."""
    return Request({
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (peer, 12345) if peer else None,
    })


def test_client_ip():
    # nginx pone X-Real-IP con $remote_addr y la sobrescribe siempre.
    assert client_ip(_request({"x-real-ip": "200.1.2.3"})) == "200.1.2.3"

    # Lo que importa: el X-Forwarded-For que llega desde afuera no manda. nginx
    # lo arma con $proxy_add_x_forwarded_for, o sea que el primer elemento es el
    # que escribio el cliente y la IP real queda al final.
    spoof = {"x-real-ip": "200.1.2.3", "x-forwarded-for": "1.2.3.4, 200.1.2.3"}
    assert client_ip(_request(spoof)) == "200.1.2.3"

    # Sin X-Real-IP tampoco se le hace caso al XFF: queda la IP del socket.
    assert client_ip(_request({"x-forwarded-for": "1.2.3.4"})) == "10.0.0.9"

    # Cabecera vacia o en blanco = como si no viniera.
    assert client_ip(_request({"x-real-ip": "   "})) == "10.0.0.9"

    # Sin cabecera y sin socket no se revienta: la clave queda constante, que
    # para un rate limit es el lado seguro (todos comparten cuota).
    assert client_ip(_request({}, peer=None)) == "desconocido"

    print("ok  client_ip no es influenciable desde afuera")


if __name__ == "__main__":
    test_client_ip()
    print("todo ok")
