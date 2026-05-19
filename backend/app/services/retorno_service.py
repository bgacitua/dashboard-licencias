"""
Servicio de seguimiento de retorno post-licencia.
Verifica si empleados cuya licencia venció han registrado marcajes desde su fecha de retorno esperada.
"""

from sqlalchemy.orm import Session
from datetime import date, timedelta
from typing import List, Dict, Any

from app.repositories.licencias_repository import LicenciasRepository
from app.repositories.marcas_repository import MarcasRepository
from app.core.logging_config import logger


def _limpiar_rut(rut: str) -> str:
    """Extrae dígitos del RUT sin DV ni puntos ni guión (ej: '12.345.678-9' -> '12345678')"""
    if not rut:
        return ""
    return rut.replace(".", "").replace(" ", "").split("-")[0]


class RetornoService:
    def __init__(self, db: Session, marcas_db: Session):
        self.licencias_repo = LicenciasRepository(db)
        self.marcas_repo = MarcasRepository(marcas_db)

    def get_seguimiento(self, dias_atras: int = 7) -> List[Dict[str, Any]]:
        """
        Retorna empleados cuya licencia venció en los últimos N días,
        excluyendo quienes tienen licencia activa hoy.
        Para cada uno verifica si tiene marcajes desde su fecha de retorno esperada.
        """
        hoy = date.today()

        vencidas = self.licencias_repo.get_vencidas_recientes(dias=dias_atras)
        vigentes = self.licencias_repo.get_vigentes()

        ruts_con_licencia_activa = {
            _limpiar_rut(lic["rut_empleado"]) for lic in vigentes
        }

        resultado = []

        for lic in vencidas:
            rut_original = lic["rut_empleado"]
            rut_limpio = _limpiar_rut(rut_original)

            if rut_limpio in ruts_con_licencia_activa:
                continue

            fecha_fin = lic["fecha_fin"]
            if hasattr(fecha_fin, "date"):
                fecha_fin = fecha_fin.date()

            fecha_retorno_esperada = fecha_fin + timedelta(days=1)

            try:
                tiene_marcas = self.marcas_repo.check_marcas_rut_en_rango(
                    rut=rut_limpio,
                    fecha_inicio=fecha_retorno_esperada,
                    fecha_fin=hoy,
                )
                retorno_registrado = tiene_marcas
            except Exception as e:
                logger.error(f"Error verificando marcas para RUT {rut_limpio}: {e}")
                retorno_registrado = None

            dias_sin_marcar = 0
            if retorno_registrado is False:
                dias_sin_marcar = max(0, (hoy - fecha_retorno_esperada).days + 1)

            resultado.append({
                "rut": rut_original,
                "rut_limpio": rut_limpio,
                "nombre": lic["nombre_completo"],
                "fecha_inicio_licencia": str(lic.get("fecha_inicio", "")),
                "fecha_fin_licencia": str(fecha_fin),
                "fecha_retorno_esperada": str(fecha_retorno_esperada),
                "tiene_licencia_activa": False,
                "retorno_registrado": retorno_registrado,
                "dias_sin_marcar": dias_sin_marcar,
            })

        return resultado

    def enviar_alerta_retorno(self, recipient_email: str, dias_atras: int = 7) -> Dict[str, Any]:
        """Envía email de seguimiento de retornos vía Microsoft Graph API."""
        from app.services.contract_alerts_service import _send_email_graph
        from app.services.email_token_service import AuthRequiredError

        seguimiento = self.get_seguimiento(dias_atras=dias_atras)

        if not seguimiento:
            return {
                "sent": False,
                "message": "No hay empleados con licencias vencidas para seguimiento.",
                "total_sin_retorno": 0,
                "total_con_retorno": 0,
            }

        sin_retorno = [e for e in seguimiento if e["retorno_registrado"] is False]
        con_retorno = [e for e in seguimiento if e["retorno_registrado"] is True]

        html = _generate_retorno_html(sin_retorno, con_retorno)
        subject = f"Seguimiento de retorno de licencias — {len(sin_retorno)} pendiente(s)"

        try:
            ok = _send_email_graph(recipient_email, "", subject, html)
            return {
                "sent": ok,
                "message": "Alerta enviada exitosamente." if ok else "Error al enviar la alerta.",
                "total_sin_retorno": len(sin_retorno),
                "total_con_retorno": len(con_retorno),
            }
        except AuthRequiredError:
            return {
                "sent": False,
                "auth_required": True,
                "message": "Token de Microsoft expirado. Se requiere re-autenticación.",
                "total_sin_retorno": len(sin_retorno),
                "total_con_retorno": len(con_retorno),
            }


def _generate_retorno_html(sin_retorno: list, con_retorno: list) -> str:
    hoy = date.today().strftime("%d-%m-%Y")

    def fila_sin_retorno(e: dict) -> str:
        dias = e.get("dias_sin_marcar", 0)
        return f"""
        <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #eee">{e['rut']}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee">{e['nombre']}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee">{e['fecha_fin_licencia']}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee">{e['fecha_retorno_esperada']}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#ef4444;font-weight:600">{dias} día(s)</td>
        </tr>"""

    def fila_con_retorno(e: dict) -> str:
        return f"""
        <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #eee">{e['rut']}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee">{e['nombre']}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee">{e['fecha_fin_licencia']}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee">{e['fecha_retorno_esperada']}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#22c55e;font-weight:600">✓ Retornó</td>
        </tr>"""

    th_style = "padding:10px 12px;text-align:left;font-weight:600;color:#555;border-bottom:2px solid #eee"
    thead = f"""<tr>
        <th style="{th_style}">RUT</th>
        <th style="{th_style}">Trabajador</th>
        <th style="{th_style}">Fin Licencia</th>
        <th style="{th_style}">Retorno Esperado</th>
        <th style="{th_style}">Estado</th>
    </tr>"""

    sin_table = (
        f'<table style="width:100%;border-collapse:collapse">'
        f'<thead style="background:#fef3c7">{thead}</thead><tbody>'
        + "".join(fila_sin_retorno(e) for e in sin_retorno)
        + "</tbody></table>"
        if sin_retorno
        else '<p style="color:#999;padding:10px 0">Todos los trabajadores han registrado retorno.</p>'
    )

    con_table = (
        f'<table style="width:100%;border-collapse:collapse">'
        f'<thead style="background:#f0fdf4">{thead}</thead><tbody>'
        + "".join(fila_con_retorno(e) for e in con_retorno)
        + "</tbody></table>"
        if con_retorno
        else '<p style="color:#999;padding:10px 0">Ningún trabajador ha registrado marcajes aún.</p>'
    )

    return f"""
    <html><body style="font-family:'Segoe UI',Arial,sans-serif;color:#333;max-width:860px;margin:0 auto;padding:20px">
      <div style="background:#f59e0b;color:white;padding:20px 30px;border-radius:10px 10px 0 0">
        <h1 style="margin:0;font-size:1.3rem;font-weight:700">Seguimiento de Retorno — Licencias Vencidas</h1>
        <p style="margin:6px 0 0;opacity:.85;font-size:.9rem">Generado el {hoy}</p>
      </div>
      <div style="padding:24px 30px;background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px">
        <h2 style="color:#ef4444;font-size:1rem;margin:0 0 12px">⚠️ Sin registro de marcajes ({len(sin_retorno)})</h2>
        {sin_table}
        <h2 style="color:#22c55e;font-size:1rem;margin:28px 0 12px">✅ Con registro de retorno ({len(con_retorno)})</h2>
        {con_table}
      </div>
    </body></html>
    """
