"""Piezas comunes de los correos HTML (alertas de contratos + horas extras).

Todo va con estilos **inline**: Gmail elimina el `<head>`, así que un `<style>`
con clases se pierde. El contenedor es una tabla porque Outlook de escritorio
(motor de Word) ignora `max-width` en un `div`.

Uso:

    from app.services.email_templates import email_shell, button, TD, TH, C

    email_shell("Alertas de contratos", f"<p style='{P}'>Hola…</p>")
"""

import re


# --------------------------------------------------------------- paleta
class C:
    """Colores. Base #2563eb sobre la escala gray de Tailwind."""
    PRIMARY = "#2563eb"
    PRIMARY_DARK = "#1d4ed8"
    OK = "#16a34a"
    DANGER = "#dc2626"
    DANGER_BG = "#fef2f2"
    DANGER_BORDER = "#fecaca"
    DANGER_TEXT = "#991b1b"
    INFO_BG = "#eef2ff"
    INFO_BORDER = "#c7d2fe"
    INFO_TEXT = "#3730a3"
    TEXT = "#111827"      # gray-900
    MUTED = "#6b7280"     # gray-500
    FAINT = "#9ca3af"     # gray-400
    BORDER = "#e5e7eb"    # gray-200
    BORDER_SOFT = "#f3f4f6"
    SURFACE = "#f9fafb"   # gray-50
    PAGE = "#f3f4f6"
    WHITE = "#ffffff"


FONT = "'Segoe UI', -apple-system, system-ui, Tahoma, Arial, sans-serif"

# Word (Outlook escritorio) NO hereda font-family a través de tablas anidadas: el
# elemento que no la declara cae a Times New Roman. Por eso `_F` va en TODOS los
# tokens de texto, no solo en el body.
# `mso-line-height-rule:exactly` hace que Word respete el line-height en px; sin
# esto lo recalcula y el interlineado queda apretado.
_F = f"font-family:{FONT};mso-line-height-rule:exactly"

# ---------------------------------------------------- estilos inline sueltos
# Interlineado generoso y tamaños fijos (14/24, 18/28, 24/32): el correo se lee
# de corrido, no se escanea como una app.
P = f"{_F};margin:0 0 16px;font-size:14px;line-height:24px;color:{C.TEXT}"
MUTED = f"{_F};margin:0 0 16px;font-size:14px;line-height:24px;color:{C.MUTED}"
H2 = f"{_F};margin:0 0 8px;font-size:18px;line-height:28px;font-weight:600;color:{C.TEXT}"

TH = (f"{_F};padding:12px 14px;text-align:left;font-size:12px;font-weight:600;"
      f"text-transform:uppercase;letter-spacing:.04em;color:{C.MUTED};"
      f"border-bottom:1px solid {C.BORDER}")
TD = (f"{_F};padding:14px;font-size:14px;line-height:24px;color:{C.TEXT};"
      f"border-bottom:1px solid {C.BORDER_SOFT}")

TABLE = (f"width:100%;border-collapse:collapse;font-family:{FONT};"
         f"margin:12px 0 36px")

def panel(html: str) -> str:
    """Bloque gris de datos. Tabla por el mismo motivo que `callout`."""
    return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            f'border="0" style="width:100%;margin:0 0 24px"><tr>'
            f'<td bgcolor="{C.SURFACE}" style="{_F};background:{C.SURFACE};'
            f'border-radius:8px;padding:20px">{html}</td></tr></table>')


def button(href: str, label: str, bg: str = None, small: bool = False) -> str:
    """Botón como tabla, no como `<a>` con padding.

    Outlook de escritorio (motor de Word) no aplica padding a un `<a>` inline: el
    botón queda como texto pegado al borde del color. El padding va en el `<td>`,
    que Word sí respeta.
    """
    bg = bg or C.PRIMARY
    pad = "6px 12px" if small else "12px 28px"
    size = "12px" if small else "14px"
    lh = "16px" if small else "20px"
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" '
        f'style="display:inline-block;margin:2px"><tr>'
        f'<td bgcolor="{bg}" align="center" '
        f'style="background:{bg};border-radius:6px;padding:{pad}">'
        f'<a href="{href}" style="color:{C.WHITE};text-decoration:none;font-weight:600;'
        f'font-size:{size};line-height:{lh};font-family:{FONT};display:inline-block">'
        f"{label}</a></td></tr></table>"
    )

CHIP = (f"{_F};display:inline-block;background:{C.INFO_BG};color:{C.INFO_TEXT};"
        f"border:1px solid {C.INFO_BORDER};border-radius:999px;"
        f"padding:4px 12px;font-size:12px;line-height:16px;margin:0 4px 4px 0")


def callout(html: str, kind: str = "info") -> str:
    """Caja de aviso. kind: 'info' | 'warn'.

    Tabla y no div: Word aplica el `background` de un div pero no su `padding`,
    así que el texto quedaría pegado al borde de la caja.
    """
    if kind == "warn":
        bg, border, color = C.DANGER_BG, C.DANGER_BORDER, C.DANGER_TEXT
    else:
        bg, border, color = C.INFO_BG, C.INFO_BORDER, C.INFO_TEXT
    return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            f'border="0" style="width:100%;margin:0 0 24px"><tr>'
            f'<td bgcolor="{bg}" style="{_F};background:{bg};border:1px solid {border};'
            f'border-radius:8px;padding:14px 16px;color:{color};font-size:14px;'
            f'line-height:24px">{html}</td></tr></table>')


# ------------------------------------------------------------------ shell
_FOOTER_DEFAULT = (
    "Correo automático - Si considera existe un error en la información, "
    'contactar a <a href="mailto:bgacitua@cramer.cl" '
    f'style="color:{C.MUTED}">bgacitua@cramer.cl</a>'
)


def email_shell(title: str, body: str, footer: str = _FOOTER_DEFAULT,
                width: int = 600, preview: str = "") -> str:
    """Envuelve `body` en el contenedor común: título centrado arriba, footer discreto.

    Sin barras de color ni sombras — la jerarquía la da el espacio en blanco.
    `preview` es el texto que los clientes muestran junto al asunto en la bandeja.

    `body` ya viene con sus estilos inline; acá solo se le pone el marco.
    """
    oculto = ""
    if preview:
        oculto = (f'<div style="display:none;overflow:hidden;line-height:1px;opacity:0;'
                  f'max-height:0;max-width:0">{preview}</div>')
    # Word ignora `max-width`, así que con `width:100%` la tarjeta se estiraría a todo
    # el panel de lectura. El comentario condicional le da una tabla de ancho fijo que
    # solo él ve; el resto de los clientes usan max-width y siguen siendo responsive.
    mso_open = (f'<!--[if mso]><table role="presentation" width="{width}" align="center" '
                f'cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->')
    mso_close = "<!--[if mso]></td></tr></table><![endif]-->"
    return f"""<!doctype html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings></xml><![endif]-->
<title>{title}</title></head>
<body style="margin:0;padding:0;background:{C.PAGE};font-family:{FONT};color:{C.TEXT}">
{oculto}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:{C.PAGE};padding:32px 12px">
  <tr><td align="center">
    {mso_open}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="width:100%;max-width:{width}px;background:{C.WHITE};border-radius:8px">
      <tr><td bgcolor="{C.WHITE}" style="background:{C.WHITE};padding:40px 24px 24px">
        <h1 style="{_F};margin:0 0 42px;font-size:24px;line-height:32px;
                   font-weight:600;color:{C.TEXT};text-align:center">{title}</h1>
        {body}
      </td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="width:100%;max-width:{width}px">
      <tr><td style="padding:20px 24px 0;text-align:center">
        <p style="{_F};margin:0;font-size:12px;line-height:20px;
                  color:{C.FAINT}">{footer}</p>
      </td></tr>
    </table>
    {mso_close}
  </td></tr>
</table>
</body></html>"""


def check_outlook_safe(html: str) -> None:
    """Reglas que el motor de Word (Outlook escritorio) no perdona.

    No valida el HTML entero: solo lo que ya nos rompió antes.
    """
    assert "<style" not in html, "Gmail borra el <head>: los estilos van inline"
    assert "max-width" not in html or "[if mso]" in html, \
        "Word ignora max-width: falta el wrapper condicional de ancho fijo"
    # Un <a> con padding es un botón que en Word queda sin aire. Los botones
    # deben venir de button(), que pone el padding en el <td>.
    for a in re.findall(r"<a\b[^>]*>", html):
        assert "padding" not in a, f"padding en <a> (usar button()): {a[:80]}"
    # Un div con fondo necesita padding que Word no aplica: eso va en tabla.
    for d in re.findall(r"<div\b[^>]*>", html):
        assert not ("background" in d and "padding" in d), \
            f"div con background+padding (usar callout()): {d[:80]}"
    assert html.count("<table") == html.count("</table>"), "tablas descuadradas"
    assert html.count("<!--[if mso]>") == html.count("<![endif]-->"), \
        "comentarios condicionales descuadrados"
    # Word no hereda fuentes a través de tablas: todo elemento con texto debe
    # declarar font-family o cae a Times New Roman.
    for tag in re.findall(r"<(?:td|p|h1|h2|div|span|a)\b[^>]*style=[^>]*>", html):
        if "display:none" in tag:  # preview de bandeja: no se ve, no importa la fuente
            continue
        if "font-size" in tag or "line-height" in tag:
            assert "font-family" in tag, f"texto sin font-family (Times en Word): {tag[:90]}"


if __name__ == "__main__":
    cuerpo = (f"<p style='{P}'>Hola</p>" + callout("aviso", "warn")
              + button("https://x", "Ir") + button("https://x", "Sí", C.OK, small=True))
    html = email_shell("Prueba", cuerpo, preview="resumen")
    assert "max-width:600px" in html, "ancho del contenedor"
    assert "max-height:0" in html and "resumen" in html, "preview oculto"
    assert C.DANGER_BG in callout("x", "warn") and C.INFO_BG in callout("x")
    assert 'bgcolor="#16a34a"' in html, "el botón lleva bgcolor además de background"
    check_outlook_safe(html)
    print("ok")
