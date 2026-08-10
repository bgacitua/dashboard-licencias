"""Shell de las páginas web que abren los links de los correos.

Son páginas de navegador, no correo: acá el `<style>` con clases sí funciona
(y es lo correcto). La paleta es la misma de `email_templates` para que el
salto correo → navegador no se note.

    from app.services.web_pages import page, card

    page("Confirmar decisión", card("✓", "Confirmar decisión", cuerpo))
"""

from html import escape

from app.services.email_templates import C


_CSS = """
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin:0;
         background:%(page)s; color:%(text)s; -webkit-text-size-adjust:100%%; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 32px 16px 64px; }
  .wrap.narrow { max-width: 600px; }
  .card { background:#fff; border-radius:8px; padding:40px 24px 24px; }
  .card.center { text-align:center; }
  h1 { font-size:24px; line-height:32px; font-weight:600; margin:0 0 42px;
       text-align:center; }
  .card.center .icon + h1 { margin-top:16px; }
  .icon { font-size:44px; line-height:1 }
  .muted { color:%(muted)s; font-size:14px; line-height:24px; margin:0 0 16px; }
  .fine { color:%(faint)s; font-size:12px; line-height:20px; margin:16px 0 0; }
  .datos { background:%(surface)s; border-radius:8px; padding:20px; margin:24px 0;
           text-align:left; }
  .datos p { margin:6px 0; font-size:14px; line-height:24px; }
  table { width:100%%; border-collapse:collapse; font-size:14px; }
  th { color:%(muted)s; font-size:12px; text-transform:uppercase;
       letter-spacing:.04em; text-align:left; padding:12px;
       border-bottom:1px solid %(border)s; }
  td { padding:14px 12px; line-height:24px; border-bottom:1px solid %(soft)s;
       vertical-align:middle; }
  tbody tr:hover { background:%(surface)s; }
  tbody tr.on { background:%(infobg)s; }
  input[type=checkbox] { width:22px; height:22px; accent-color:%(primary)s; cursor:pointer; }
  input[type=checkbox]:disabled { cursor:default; opacity:.5; }
  .btn { display:inline-block; background:%(primary)s; color:#fff; border:none;
         padding:12px 28px; border-radius:9px; font-size:15px; font-weight:600;
         cursor:pointer; text-decoration:none; }
  .btn:hover { background:%(primaryDark)s; }
  .btn.danger { background:%(danger)s; }
  .btn.ghost { background:none; color:%(muted)s; border:1px solid #cbd5e1; }
  .btn.ghost:hover { background:%(surface)s; }
  .search { width:100%%; padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px;
            font-size:14px; margin-top:8px; }
  .search:focus { outline:2px solid %(infoborder)s; outline-offset:-1px; border-color:%(primary)s; }
  .bar { position:sticky; top:0; z-index:5; background:rgba(255,255,255,.94);
         backdrop-filter:blur(6px); color:%(text)s; border:1px solid %(border)s;
         border-radius:8px; padding:16px 20px; display:flex; gap:28px; align-items:center;
         flex-wrap:wrap; margin-bottom:16px; }
  .bar b { font-size:24px; display:block; line-height:1.1; color:%(primary)s; }
  .bar span { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:%(muted)s; }
  details { margin-top:10px; }
  summary { cursor:pointer; font-size:13px; color:%(primary)s; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
  .chip { background:%(infobg)s; color:%(infotext)s; border:1px solid %(infoborder)s;
          border-radius:999px; padding:3px 10px; font-size:12px; }
  .link-btn { background:none; border:none; color:#b91c1c; font-size:13px; cursor:pointer;
              padding:6px 10px; border-radius:7px; font-weight:500; }
  .link-btn:hover { background:%(dangerbg)s; }
  .link-btn:disabled { color:#cbd5e1; cursor:default; background:none; }
  .rocket { font-size:56px; display:inline-block; animation:breathe 2.6s ease-in-out infinite;
            transform-origin:center; }
  @keyframes breathe {
    0%%, 100%% { transform:scale(1) translateY(0); }
    50%%      { transform:scale(1.12) translateY(-6px); }
  }
  @media (prefers-reduced-motion:reduce) { .rocket { animation:none; } }
  .warn { background:%(dangerbg)s; color:%(dangertext)s; border:1px solid %(dangerborder)s;
          border-radius:8px; padding:12px 14px; font-size:14px; margin:14px 0; text-align:left; }
  .info { background:%(infobg)s; color:%(infotext)s; border:1px solid %(infoborder)s;
          border-radius:8px; padding:12px 14px; font-size:14px; margin:14px 0; text-align:left; }
  @media (max-width:560px) {
    .card { padding:28px 18px 18px; }
    h1 { margin-bottom:28px; }
    td, th { padding:12px 6px; }
  }
""" % {
    "page": C.PAGE, "text": C.TEXT, "border": C.BORDER, "soft": C.BORDER_SOFT,
    "muted": C.MUTED, "faint": C.FAINT, "surface": C.SURFACE, "primary": C.PRIMARY,
    "primaryDark": C.PRIMARY_DARK, "danger": C.DANGER, "dangerbg": C.DANGER_BG,
    "dangerborder": C.DANGER_BORDER, "dangertext": C.DANGER_TEXT,
    "infobg": C.INFO_BG, "infoborder": C.INFO_BORDER, "infotext": C.INFO_TEXT,
}


def page(title: str, body: str, narrow: bool = False) -> str:
    """Documento completo. `narrow` centra una tarjeta angosta (páginas de estado)."""
    return (f'<!doctype html><html lang="es"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{escape(title)}</title><style>{_CSS}</style></head>'
            f'<body><div class="wrap{" narrow" if narrow else ""}">{body}</div></body></html>')


def card(icon: str, title: str, body_html: str = "", color: str = None) -> str:
    """Tarjeta centrada de estado: ícono grande, título de color y contenido."""
    color = color or C.TEXT
    return (f'<div class="card center"><div class="icon">{icon}</div>'
            f'<h1 style="color:{color}">{escape(title)}</h1>{body_html}</div>')


def status_page(icon: str, title: str, body_html: str = "", color: str = None) -> str:
    """Atajo para las páginas de una sola tarjeta (error, ya respondido, ok…)."""
    return page(title, card(icon, title, body_html, color), narrow=True)


if __name__ == "__main__":
    p = status_page("✅", "Listo", '<p class="muted">Todo bien</p>', C.OK)
    assert "<style>" in p and 'class="wrap narrow"' in p
    assert p.count("<div") == p.count("</div>"), "divs descuadrados"
    assert "%(" not in p and "%%" not in p, "quedó interpolación sin resolver"
    assert "<title>Listo</title>" in p
    print("ok")
