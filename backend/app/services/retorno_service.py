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
from app.services import email_templates as T


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

    def fila(e: dict, estado: str, color: str) -> str:
        # `width` en el td además del style: Word ignora el ancho por CSS en celdas.
        return (
            "<tr>"
            f'<td width="16%" style="{T.TD};width:16%">{e["rut"]}</td>'
            f'<td width="32%" style="{T.TD};width:32%">{e["nombre"]}</td>'
            f'<td width="17%" style="{T.TD};width:17%">{e["fecha_fin_licencia"]}</td>'
            f'<td width="17%" style="{T.TD};width:17%">{e["fecha_retorno_esperada"]}</td>'
            f'<td width="18%" style="{T.TD};width:18%;color:{color};font-weight:600">{estado}</td>'
            "</tr>"
        )

    def tabla(filas: str, bg: str) -> str:
        th = f"{T.TH};background:{bg}"
        return (
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            f'border="0" style="{T.TABLE}">'
            f'<thead><tr>'
            f'<th width="16%" style="{th};width:16%">RUT</th>'
            f'<th width="32%" style="{th};width:32%">Trabajador</th>'
            f'<th width="17%" style="{th};width:17%">Fin licencia</th>'
            f'<th width="17%" style="{th};width:17%">Retorno esperado</th>'
            f'<th width="18%" style="{th};width:18%">Estado</th>'
            f"</tr></thead><tbody>{filas}</tbody></table>"
        )

    sin_table = (
        tabla("".join(
            fila(e, f'{e.get("dias_sin_marcar", 0)} día(s)', T.C.DANGER)
            for e in sin_retorno
        ), "#fef3c7")
        if sin_retorno
        else f'<p style="{T.MUTED}">Todos los trabajadores han registrado retorno.</p>'
    )

    con_table = (
        tabla("".join(fila(e, "Retornó", T.C.OK) for e in con_retorno), "#f0fdf4")
        if con_retorno
        else f'<p style="{T.MUTED}">Ningún trabajador ha registrado marcajes aún.</p>'
    )

    body = (
        f'<p style="{T.MUTED}">Generado el {hoy}</p>'
        f'<h2 style="{T.H2};color:{T.C.DANGER}">Sin registro de marcajes ({len(sin_retorno)})</h2>'
        f"{sin_table}"
        f'<h2 style="{T.H2};color:{T.C.OK}">Con registro de retorno ({len(con_retorno)})</h2>'
        f"{con_table}"
    )
    # 760px y no los 600 por defecto: son cinco columnas y con el ancho normal
    # los nombres se parten en tres líneas.
    return T.email_shell(
        "Seguimiento de retorno — licencias vencidas",
        body,
        width=760,
        preview=f"{len(sin_retorno)} trabajador(es) sin registro de marcajes",
    )
