"""
Servicio de alertas de contratos.
Gestiona la lógica de negocio: obtención de alertas, agrupación por jefe,
generación de HTML para emails y envío vía Outlook COM.
Incluye calendario dinámico de cierres mensual.
"""

from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, date, timedelta
import calendar
from app.repositories.contract_alerts_repository import ContractAlertsRepository
from app.core.logging_config import logger


class ContractAlertsService:
    def __init__(self, db: Session):
        self.repository = ContractAlertsRepository(db)

    # ================================================================
    # Cálculo de rango dinámico
    # ================================================================

    def _calculate_search_range(self) -> Tuple[date, date, str, Optional[date], Optional[int]]:
        """
        Calcula el rango de búsqueda dinámico basado en el calendario de cierres.
        
        Lógica:
        - Normal: hoy → hoy + 9 días
        - Cerca del cierre (≤7 días antes): hoy → último día del mes
        
        Returns: (fecha_inicio, fecha_fin, modo, fecha_cierre, dias_al_cierre)
        """
        hoy = date.today()
        mes_actual = hoy.month
        anio_actual = hoy.year

        # Buscar cierre del mes actual
        cierre = self.repository.get_cierre_by_month(anio_actual, mes_actual)

        if cierre:
            fecha_cierre = cierre["fecha_cierre"]
            if isinstance(fecha_cierre, str):
                fecha_cierre = datetime.strptime(fecha_cierre, "%Y-%m-%d").date()
            
            dias_al_cierre = (fecha_cierre - hoy).days

            if dias_al_cierre <= 7:
                # Modo cierre: buscar hasta fin de mes
                ultimo_dia = calendar.monthrange(anio_actual, mes_actual)[1]
                fecha_fin = date(anio_actual, mes_actual, ultimo_dia)
                logger.info(f"Modo CIERRE: {dias_al_cierre} días al cierre ({fecha_cierre}). Rango: {hoy} → {fecha_fin}")
                return hoy, fecha_fin, "cierre", fecha_cierre, dias_al_cierre
            else:
                # Modo normal: buscar 9 días adelante
                fecha_fin = hoy + timedelta(days=9)
                logger.info(f"Modo NORMAL: {dias_al_cierre} días al cierre ({fecha_cierre}). Rango: {hoy} → {fecha_fin}")
                return hoy, fecha_fin, "normal", fecha_cierre, dias_al_cierre
        else:
            # Sin cierre configurado: usar 9 días por defecto
            fecha_fin = hoy + timedelta(days=9)
            logger.info(f"Sin cierre configurado para {mes_actual}/{anio_actual}. Rango: {hoy} → {fecha_fin}")
            return hoy, fecha_fin, "normal", None, None

    # ================================================================
    # Alertas
    # ================================================================

    def _get_end_date(self, days_override: Optional[int] = None) -> date:
        """Calcula la fecha fin: usa override manual si existe, sino el rango dinámico."""
        if days_override and days_override > 0:
            end = date.today() + timedelta(days=days_override)
            logger.info(f"Override manual: buscando {days_override} días adelante (hasta {end})")
            return end
        _, fecha_fin, _, _, _ = self._calculate_search_range()
        return fecha_fin

    def get_alerts(self, days_override: Optional[int] = None) -> List[Dict[str, Any]]:
        """Obtiene alertas pendientes. days_override sobreescribe el rango automático."""
        fecha_fin = self._get_end_date(days_override)
        logger.info(f"Obteniendo alertas (hasta: {fecha_fin})")
        return self.repository.get_pending_alerts(end_date=fecha_fin)

    def get_alerts_grouped_by_boss(self, days_override: Optional[int] = None) -> List[Dict[str, Any]]:
        """Obtiene alertas agrupadas por jefe con conteo de empleados"""
        fecha_fin = self._get_end_date(days_override)
        alerts = self.repository.get_pending_alerts(end_date=fecha_fin)

        if not alerts:
            return []

        # Agrupar por jefe
        groups = {}
        for alert in alerts:
            key = (alert["boss_name"], alert["boss_email"], alert.get("boss_of_boss_email", ""))
            if key not in groups:
                groups[key] = {
                    "boss_name": alert["boss_name"],
                    "boss_email": alert["boss_email"],
                    "boss_of_boss_email": alert.get("boss_of_boss_email", ""),
                    "employee_count": 0,
                    "employees": []
                }
            groups[key]["employee_count"] += 1
            groups[key]["employees"].append(alert)

        return list(groups.values())

    def get_schedule_info(self) -> Dict[str, Any]:
        """Retorna información del rango de búsqueda actual"""
        fecha_inicio, fecha_fin, modo, fecha_cierre, dias_al_cierre = self._calculate_search_range()
        return {
            "fecha_inicio": fecha_inicio.strftime("%d-%m-%Y"),
            "fecha_fin": fecha_fin.strftime("%d-%m-%Y"),
            "dias_rango": (fecha_fin - fecha_inicio).days,
            "fecha_cierre_mes": fecha_cierre.strftime("%d-%m-%Y") if fecha_cierre else None,
            "dias_al_cierre": dias_al_cierre,
            "modo": modo,
        }

    def get_stats(self, days_override: Optional[int] = None) -> Dict[str, Any]:
        """Obtiene métricas resumen de las alertas pendientes"""
        fecha_fin = self._get_end_date(days_override)
        alerts = self.repository.get_pending_alerts(end_date=fecha_fin)

        segundo_plazo = sum(1 for a in alerts if a.get("alert_type") == "SEGUNDO_PLAZO")
        indefinido = sum(1 for a in alerts if a.get("alert_type") == "INDEFINIDO")
        bosses = len(set(a.get("boss_name", "") for a in alerts))

        return {
            "total_alerts": len(alerts),
            "segundo_plazo_count": segundo_plazo,
            "indefinido_count": indefinido,
            "bosses_to_notify": bosses,
        }

    def send_alerts_by_boss(self, bosses_filter: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        Envía alertas agrupadas por jefe vía Outlook COM.
        bosses_filter: [{"boss_name": "...", "boss_email": "..."}]
        """
        _, fecha_fin, _, _, _ = self._calculate_search_range()
        alerts = self.repository.get_pending_alerts(end_date=fecha_fin)
        incidencias = self.repository.get_all_incidencias()

        if not alerts:
            return {
                "bosses_successful": 0,
                "bosses_failed": 0,
                "alerts_sent": 0,
                "alerts_failed": 0,
                "message": "No hay alertas pendientes para enviar.",
            }

        # Filtrar alertas pendientes verificando en BD
        alertas_pendientes = []
        for alert in alerts:
            rut = alert["employee_rut"]
            tipo_alerta = self.repository.get_alert_type(rut)
            if tipo_alerta and not self.repository.check_alert_processed(rut, tipo_alerta):
                alertas_pendientes.append(alert)

        if not alertas_pendientes:
            return {
                "bosses_successful": 0,
                "bosses_failed": 0,
                "alerts_sent": 0,
                "alerts_failed": 0,
                "message": "Todas las alertas ya han sido procesadas.",
            }

        # Aplicar filtro de jefes seleccionados
        if bosses_filter:
            bosses_tuple = [(d["boss_name"], d["boss_email"]) for d in bosses_filter]
            alertas_pendientes = [
                a for a in alertas_pendientes
                if (a["boss_name"], a["boss_email"]) in bosses_tuple
            ]

        if not alertas_pendientes:
            return {
                "bosses_successful": 0,
                "bosses_failed": 0,
                "alerts_sent": 0,
                "alerts_failed": 0,
                "message": "Los jefes seleccionados no tienen alertas pendientes.",
            }

        # Agrupar por jefe
        alertas_por_jefe = {}
        for alert in alertas_pendientes:
            key = (alert["boss_name"], alert["boss_email"], alert.get("boss_of_boss_email", ""))
            if key not in alertas_por_jefe:
                alertas_por_jefe[key] = []
            alertas_por_jefe[key].append(alert)

        # Contadores
        jefes_exitosos = 0
        jefes_con_error = 0
        alertas_enviadas = 0
        alertas_con_error = 0

        # Procesar cada jefe
        for (nombre_jefe, email_jefe, email_jefe_jefe), empleados_list in alertas_por_jefe.items():
            logger.info(f"Procesando jefe: {nombre_jefe} ({email_jefe})")

            # Preparar datos de empleados para el template
            empleados_jefe = []
            ruts_procesados = []

            for emp in empleados_list:
                rut = emp["employee_rut"]
                tipo_alerta = self.repository.get_alert_type(rut)
                if tipo_alerta:
                    empleados_jefe.append({
                        "empleado": emp["employee_name"],
                        "rut": rut,
                        "cargo": emp.get("employee_role", "N/A"),
                        "email": emp.get("email", "N/A"),
                        "fecha_alerta": emp.get("alert_date", "N/A"),
                        "motivo": emp.get("alert_reason", "N/A"),
                        "tipo_alerta": tipo_alerta,
                    })
                    ruts_procesados.append((rut, tipo_alerta))

            # Ordenar por fecha
            empleados_jefe_ordenados = sorted(
                empleados_jefe,
                key=lambda e: _parse_date_safe(e["fecha_alerta"]),
                reverse=False,
            )

            # Generar HTML
            html = _generate_email_html(nombre_jefe, empleados_jefe_ordenados, incidencias)

            # Lista de CC
            lista_copia = [
                "DMISRAJI@cramer.cl", "bgacitua@cramer.cl", "gpavez@cramer.cl",
                "navalos@cramer.cl", "ccisternas@cramer.cl", "jguinez@cramer.cl",
                "lgarcia@cramer.cl", "eleon@cramer.cl", "nconstanzo@cramer.cl",
                "ABB@cramer.cl"
            ]
            copia_final = lista_copia.copy()

            # Remover al jefe y jefe del jefe de la lista de copia
            if email_jefe in copia_final:
                copia_final.remove(email_jefe)
            if email_jefe_jefe and email_jefe_jefe in copia_final:
                copia_final.remove(email_jefe_jefe)

            cc_str = f"{email_jefe_jefe}; {'; '.join(copia_final)}" if email_jefe_jefe else "; ".join(copia_final)

            subject = f"Alertas de contratos - {len(empleados_jefe)} empleado(s) requieren atención"

            # Enviar email
            email_enviado = _send_email_outlook(email_jefe, cc_str, subject, html)

            # Marcar como procesadas si el envío fue exitoso
            if email_enviado:
                alertas_marcadas = 0
                for rut, tipo_alerta in ruts_procesados:
                    if self.repository.mark_as_processed(rut, tipo_alerta):
                        alertas_marcadas += 1

                jefes_exitosos += 1
                alertas_enviadas += len(empleados_jefe)
                logger.info(f"Correo enviado a {nombre_jefe} con {len(empleados_jefe)} alerta(s)")
            else:
                jefes_con_error += 1
                alertas_con_error += len(empleados_jefe)

        return {
            "bosses_successful": jefes_exitosos,
            "bosses_failed": jefes_con_error,
            "alerts_sent": alertas_enviadas,
            "alerts_failed": alertas_con_error,
            "message": f"Envío completado: {jefes_exitosos} jefe(s) notificados, {jefes_con_error} error(es).",
        }

    # ================================================================
    # Calendario de Cierres
    # ================================================================

    def get_calendario(self, anio: int) -> Dict[str, Any]:
        """Obtiene los cierres de un año"""
        cierres = self.repository.get_cierres_by_year(anio)
        return {"anio": anio, "cierres": cierres}

    def save_cierre(self, anio: int, mes: int, fecha_cierre) -> bool:
        """Crea o actualiza un cierre"""
        return self.repository.upsert_cierre(anio, mes, fecha_cierre)

    def delete_cierre(self, cierre_id: int) -> bool:
        """Elimina un cierre"""
        return self.repository.delete_cierre(cierre_id)


# ============================================================================
# Funciones auxiliares (fuera de la clase)
# ============================================================================

def _parse_date_safe(date_str: str) -> datetime:
    """Parsea una fecha dd-MM-yyyy de forma segura"""
    try:
        return datetime.strptime(date_str, "%d-%m-%Y")
    except (ValueError, TypeError):
        return datetime.max


def _send_email_outlook(to: str, cc: str, subject: str, html_body: str) -> bool:
    """Envía un email usando Outlook COM (Windows + Outlook requerido)"""
    try:
        import pythoncom
        import win32com.client as win32

        pythoncom.CoInitialize()
        outlook = win32.Dispatch("outlook.application")
        mail = outlook.CreateItem(0)
        mail.To = to
        mail.CC = cc
        mail.Subject = subject
        mail.HTMLBody = html_body
        mail.Send()
        pythoncom.CoUninitialize()

        logger.info(f"Email enviado exitosamente a {to}")
        return True
    except Exception as e:
        logger.error(f"Error enviando email a {to}: {e}")
        return False


def _generate_incidencias_html(rut: str, incidencias: List[Dict[str, Any]]) -> str:
    """Genera HTML de tabla de incidencias para un RUT específico"""
    inc_empleado = [i for i in incidencias if i.get("rut_empleado") == rut]

    if not inc_empleado:
        return "<p style='margin-left: 20px; color: #6c757d; font-style: italic; font-size: 13px; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; padding-top: 5px; padding-bottom: 5px;'>Este colaborador/a no registra ausencias, permisos o licencias activas.</p>"

    html = """
    <div style='margin-left: 20px; margin-top: 10px; margin-bottom: 20px;'>
        <h4 style='color: #2c3e50; border-left: 4px solid #f39c12; padding-left: 10px; font-size: 14px; margin-bottom: 10px;'>
            Permisos y Licencias Encontradas:
        </h4>
        <table style='width: 95%; border-collapse: collapse; margin-top: 5px; font-size: 12px; border: 1px solid #e0e0e0;'>
            <thead>
                <tr style='background-color: #34495e;'>
                    <th style='padding: 8px 12px; border: 1px solid #ccc; color: #333; text-align: left;'>Tipo de Permiso</th>
                    <th style='padding: 8px 12px; border: 1px solid #ccc; color: #333; text-align: left;'>Fecha Inicio</th>
                    <th style='padding: 8px 12px; border: 1px solid #ccc; color: #333; text-align: left;'>Fecha Fin</th>
                </tr>
            </thead>
            <tbody>
    """

    for i, row in enumerate(inc_empleado):
        row_style = "background-color: #f9f9f9;" if i % 2 == 0 else "background-color: white;"
        html += f"""
                <tr style='{row_style}'>
                    <td style='padding: 8px 12px; border: 1px solid #e0e0e0;'>{row.get('tipo_permiso', '')}</td>
                    <td style='padding: 8px 12px; border: 1px solid #e0e0e0;'>{row.get('fecha_inicio_formato', '')}</td>
                    <td style='padding: 8px 12px; border: 1px solid #e0e0e0;'>{row.get('fecha_fin_formato', '')}</td>
                </tr>
        """

    html += """
            </tbody>
        </table>
    </div>
    """
    return html


def _generate_email_html(nombre_jefe: str, empleados_data: List[Dict], incidencias: List[Dict[str, Any]]) -> str:
    """
    Genera el HTML completo del email de alertas para un jefe.
    Portado desde template_mails.py -> ReporteManager._generar_html_reporte_por_jefe
    """
    # Agrupar empleados por motivo
    empleados_por_motivo = {}
    for emp in empleados_data:
        motivo = emp["motivo"]
        if motivo not in empleados_por_motivo:
            empleados_por_motivo[motivo] = []
        empleados_por_motivo[motivo].append(emp)

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Alertas de Contratos</title>
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                margin: 0;
                padding: 20px;
                background-color: #f8f9fa;
            }}
            .container {{
                max-width: 800px;
                margin: 0 auto;
                background: white;
                padding: 30px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }}
            .group-title {{
                background: #2e43ff;
                width: fit-content;
                color: white; 
                font-weight: bold;
                font-size: 1.1em;
                border: 2px solid #adb5bd;
                margin-top: 30px;
                padding: 15px 0;
                text-align: center;
            }}
            .alerta-tabla {{
                width: fit-content;
                border-collapse: collapse;
                margin-top: 5px; 
                margin-bottom: 10px; 
                border: 1px solid #ccc;
            }}
            .alerta-tabla th, .alerta-tabla td {{
                padding: 6px 25px;
                text-align: left;
                border: 1px solid #ddd;
            }}
            .alerta-tabla th {{
                background-color: transparent;
                color: #333;
                font-weight: bold;
            }}
            .alerta-tabla tr:nth-child(odd) {{
                background-color: #ffffff;
            }}
            .alerta-tabla tr:nth-child(even) {{
                background-color: #f8f9fa;
            }}
            .urgente {{
                background-color: #f7f7f7 !important;
            }}
            .incidencia-row td {{
                padding: 0;
                border: none;
                background-color: #f8f9fa; 
            }}
            .header {{ text-align: center; border-bottom: 3px solid #007bff; padding-bottom: 20px; margin-bottom: 30px; }}
            .header h1 {{ color: #2e43ff; margin: 0; font-size: 28px; }}
            .jefe-info {{ background: #f7f8f8; padding: 15px; border-radius: 6px; margin-bottom: 25px; }}
            .jefe-info h2 {{ margin: 0; color: #2e43ff; }}
            .footer {{ margin-top: 30px; padding-top: 20px; border-top: 2px solid #dee2e6; text-align: center; color: #6c757d; font-size: 14px; }}
        </style>
    </head>
    <body>
            <div class="jefe-info">
                <p>Buenos días {nombre_jefe}:</p>
                <p>Junto con saludar, notificamos los siguientes vencimientos de contrato:</p>
                <p>(*) Rellenar la columna <strong>"Renovar"</strong> con su respuesta <strong>(Si/No)</strong></p>
                <p>Por favor contestar a la brevedad, por motivos de cierre de mes.</p>
            </div>
    """

    for motivo in sorted(empleados_por_motivo.keys()):
        grupo_empleados = empleados_por_motivo[motivo]

        html += f"""
            <h3 class="group-title">{motivo}</h3>
            <table class="alerta-tabla">
                <thead>
                    <tr>
                        <th style="width: 40%;">Empleado</th>
                        <th style="width: 30%;">Cargo</th>
                        <th style="width: 20%;">Fecha Vencimiento</th>
                        <th style="width: 10%;">Renovar (*)</th>
                    </tr>
                </thead>
                <tbody>
        """

        for emp in grupo_empleados:
            rut_empleado = emp.get("rut", "")
            clase_fila = "urgente" if emp["tipo_alerta"] == "INDEFINIDO" else ""

            html += f"""
                <tr class="{clase_fila}">
                    <td style="width: 40%;"><strong>{emp['empleado']}</strong></td>
                    <td style="width: 30%;">{emp['cargo']}</td>
                    <td style="width: 20%;">{emp['fecha_alerta']}</td>
                    <td style="width: 10%; background-color: #FFDDC1;"></td>
                </tr>
            """

            # Subtabla de incidencias
            tabla_incidencias_html = _generate_incidencias_html(rut_empleado, incidencias)
            html += f"""
                <tr class="incidencia-row">
                    <td colspan="4" style="padding: 0; border: none;"> 
                        {tabla_incidencias_html}
                    </td>
                </tr>
            """

        html += """
                </tbody>
            </table>
        """

    html += """
            <div class="footer">
                <p>Correo generado por el Sistema de Alertas de Contratos</p>
                <hr>
                <small>Para consultas, contacte al área de Recursos Humanos o responda este correo.</small>
            </div>
        </div>
    </body>
    </html>
    """
    return html
