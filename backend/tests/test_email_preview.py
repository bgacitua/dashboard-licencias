"""
Preview de los 3 pasos del flujo de alertas de contrato:
  1. preview_email.html        — correo que recibe la jefatura
  2. preview_confirm.html      — página de confirmación al hacer clic
  3. preview_confirm_mail.html — correo de confirmación post-respuesta

Ejecutar desde backend/:
    python -m tests.test_email_preview
"""
import uuid
from jose import jwt

JWT_SECRET = "preview-secret-key"
JWT_ALGO   = "HS256"
PUBLIC_URL = "http://personas.cramer.cl"

BOSS_NAME  = "Carolina Pérez"
BOSS_EMAIL = "carolina.perez@cramer.cl"

EMPLEADOS = [
    {
        "empleado": "Juan Muñoz Soto",
        "rut": "12.345.678-9",
        "employee_id": 1001,
        "cargo": "Analista de Operaciones",
        "fecha_alerta": "20-05-2026",
        "motivo": "Renovación a Indefinido",
        "tipo_alerta": "INDEFINIDO",
    },
    {
        "empleado": "Ana Torres Vidal",
        "rut": "9.876.543-2",
        "employee_id": 1002,
        "cargo": "Ejecutiva Comercial",
        "fecha_alerta": "25-05-2026",
        "motivo": "Segundo Plazo",
        "tipo_alerta": "SEGUNDO_PLAZO",
    },
]


def create_token(employee_id, rut, boss_email, alert_date):
    payload = {
        "token_type": "contract_response",
        "employee_id": employee_id,
        "rut": rut,
        "boss_email": boss_email,
        "alert_date": alert_date,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


# ── Generar tokens ───────────────────────────────────────────────────────────

TOKEN_MAP = {}
for emp in EMPLEADOS:
    token = create_token(emp["employee_id"], emp["rut"], BOSS_EMAIL, "2026-05-20")
    TOKEN_MAP[emp["rut"]] = token
    decoded = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO], options={"verify_exp": False})
    print(f"Token {emp['empleado']}: boss_email={decoded['boss_email']} employee_id={decoded['employee_id']}")


# ── 1. HTML del correo ───────────────────────────────────────────────────────

def email_html():
    empleados_por_motivo = {}
    for emp in EMPLEADOS:
        empleados_por_motivo.setdefault(emp["motivo"], []).append(emp)

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
        body {{ font-family: 'Segoe UI', sans-serif; padding: 20px; background: #f8f9fa; color: #333; }}
        .container {{ max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
        .group-title {{ background: #2e43ff; width: fit-content; color: white; font-weight: bold; font-size: 1.1em; border: 2px solid #adb5bd; margin-top: 30px; padding: 15px 0; text-align: center; }}
        .alerta-tabla {{ width: fit-content; border-collapse: collapse; margin-top: 5px; margin-bottom: 10px; border: 1px solid #ccc; }}
        .alerta-tabla th, .alerta-tabla td {{ padding: 6px 25px; text-align: left; border: 1px solid #ddd; }}
        .alerta-tabla th {{ font-weight: bold; }}
        .alerta-tabla tr:nth-child(odd) {{ background: #fff; }}
        .alerta-tabla tr:nth-child(even) {{ background: #f8f9fa; }}
        .jefe-info {{ background: #f7f8f8; padding: 15px; border-radius: 6px; margin-bottom: 25px; }}
        .footer {{ margin-top: 30px; padding-top: 20px; border-top: 2px solid #dee2e6; text-align: center; color: #6c757d; font-size: 14px; }}
    </style></head><body><div class="container">
    <div class="jefe-info">
        <p>Buenos días {BOSS_NAME}:</p>
        <p>Junto con saludar, notificamos los siguientes vencimientos de contrato:</p>
        <p>(*) Haga clic en el botón correspondiente para indicar su decisión de renovación.</p>
        <p>Por favor contestar a la brevedad, por motivos de cierre de mes.</p>
    </div>"""

    for motivo, grupo in sorted(empleados_por_motivo.items()):
        html += f"""
        <h3 class="group-title">{motivo}</h3>
        <table class="alerta-tabla">
            <thead><tr>
                <th style="width:35%">Empleado</th>
                <th style="width:25%">Cargo</th>
                <th style="width:15%">Fecha Vencimiento</th>
                <th style="width:25%">Renovar (*)</th>
            </tr></thead><tbody>"""

        for emp in grupo:
            token = TOKEN_MAP.get(emp["rut"], "")
            base = f"{PUBLIC_URL}/api/v1/contract-alerts/respond?token={token}&answer="
            renovar_answer = "indefinido" if emp["tipo_alerta"] == "INDEFINIDO" else "plazo_fijo"
            html += f"""
            <tr>
                <td><strong>{emp['empleado']}</strong></td>
                <td>{emp['cargo']}</td>
                <td>{emp['fecha_alerta']}</td>
                <td style="padding:4px 8px">
                    <a href="{base}{renovar_answer}" style="display:inline-block;margin:2px;padding:4px 8px;background:#16a34a;color:white;text-decoration:none;border-radius:4px;font-size:11px;font-weight:bold;">✓ Renovar</a>
                    <a href="{base}no_renovar" style="display:inline-block;margin:2px;padding:4px 8px;background:#dc2626;color:white;text-decoration:none;border-radius:4px;font-size:11px;font-weight:bold;">✗ No Renovar</a>
                </td>
            </tr>"""

        html += "</tbody></table>"

    html += """
    <div class="footer">
        <p>Correo generado por el Sistema de Alertas de Contratos</p>
        <hr><small>Para consultas, contacte al área de Recursos Humanos o responda este correo.</small>
    </div></div></body></html>"""
    return html


# ── 2. HTML página de confirmación ──────────────────────────────────────────

def confirm_html():
    token = TOKEN_MAP["12.345.678-9"]
    answer = "indefinido"
    answer_label = "Renovar - Contrato Indefinido"
    color = "#16a34a"
    confirm_url = f"{PUBLIC_URL}/api/v1/contract-alerts/respond/confirm?token={token}&answer={answer}"
    decoded = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO], options={"verify_exp": False})
    boss_email_from_token = decoded.get("boss_email", "")

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>Confirmar decisión</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;
             height:100vh;margin:0;background:#f8f9fa">
  <div style="text-align:center;padding:40px;background:white;border-radius:12px;
              box-shadow:0 2px 10px rgba(0,0,0,.1);max-width:440px;width:90%">
    <div style="font-size:48px">✓</div>
    <h2 style="color:#1e293b;margin:16px 0 8px">Confirmar decisión</h2>
    <p style="color:#475569;margin:8px 0">Hola <strong>{BOSS_NAME}</strong>,</p>
    <p style="color:#475569;margin:8px 0">Estás a punto de registrar la siguiente decisión:</p>
    <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:20px 0;text-align:left">
      <p style="margin:4px 0;color:#334155"><strong>Empleado:</strong> Juan Muñoz Soto</p>
      <p style="margin:4px 0;color:#334155"><strong>Vencimiento:</strong> 20-05-2026</p>
      <p style="margin:4px 0;color:{color};font-weight:bold"><strong>Decisión:</strong> {answer_label}</p>
    </div>
    <p style="color:#64748b;font-size:13px">Este link fue enviado a: <strong>{boss_email_from_token}</strong></p>
    <p style="color:#94a3b8;font-size:13px;margin-bottom:24px">Esta acción quedará registrada y no podrá modificarse. Recibirás un correo de confirmación.</p>
    <form method="post" action="{confirm_url}" style="display:inline">
      <button type="submit" style="background:{color};color:white;border:none;padding:10px 28px;
              border-radius:6px;font-size:15px;font-weight:bold;cursor:pointer;margin-right:8px">
        Confirmar
      </button>
    </form>
    <a href="javascript:void(0)" style="display:inline-block;padding:10px 28px;border:1px solid #cbd5e1;
            border-radius:6px;font-size:15px;color:#64748b;text-decoration:none">Cancelar</a>
  </div>
</body></html>"""


# ── 3. HTML correo de confirmación post-respuesta ────────────────────────────

def confirm_mail_html():
    color = "#16a34a"
    answer_label = "Renovar - Contrato Indefinido"
    responder_ip = "192.168.1.45"

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;padding:20px;background:#f8f9fa">
  <div style="max-width:480px;margin:0 auto;background:white;padding:32px;border-radius:10px;
              box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <h2 style="color:#1e293b;margin-top:0">Confirmación de decisión registrada</h2>
    <p style="color:#475569">Hola <strong>{BOSS_NAME}</strong>,</p>
    <p style="color:#475569">Se ha registrado la siguiente decisión en el sistema de alertas de contratos:</p>
    <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:20px 0">
      <p style="margin:4px 0;color:#334155"><strong>Empleado:</strong> Juan Muñoz Soto</p>
      <p style="margin:4px 0;color:#334155"><strong>Vencimiento:</strong> 20-05-2026</p>
      <p style="margin:4px 0;color:{color};font-weight:bold"><strong>Decisión:</strong> {answer_label}</p>
    </div>
    <p style="color:#ef4444;font-size:14px">
      Si <strong>no fuiste tú</strong> quien realizó esta acción, contacta inmediatamente al área de Recursos Humanos.
    </p>
    <p style="color:#94a3b8;font-size:12px">IP registrada: {responder_ip}</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
    <p style="color:#94a3b8;font-size:12px">Este es un correo automático del Sistema de Alertas de Contratos. No responder.</p>
  </div>
</body></html>"""


# ── Escribir archivos ────────────────────────────────────────────────────────

with open("preview_email.html", "w", encoding="utf-8") as f:
    f.write(email_html())
print("✓ preview_email.html")

with open("preview_confirm.html", "w", encoding="utf-8") as f:
    f.write(confirm_html())
print("✓ preview_confirm.html")

with open("preview_confirm_mail.html", "w", encoding="utf-8") as f:
    f.write(confirm_mail_html())
print("✓ preview_confirm_mail.html")

print("\nAbre en browser:")
print("  1. preview_email.html        — correo que recibe la jefatura")
print("  2. preview_confirm.html      — página al hacer clic en botón")
print("  3. preview_confirm_mail.html — correo de confirmación post-respuesta")
