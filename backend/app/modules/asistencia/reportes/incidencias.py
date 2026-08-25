"""Etapa [2]: Atrasos (filas del reporte subido) y Olvido Marca (Buk auditoría).

Ambos contadores devuelven {rut_norm: {"p1": int, "p2": int}}. La bucketización
por periodo usa la fecha del registro contra los cortes de quincena:
    P1 = [q1_inicio, q2_inicio)   P2 = [q2_inicio, q2_fin]

El archivo de atrasos se parsea en el frontend (SheetJS) y llega como list[dict];
así soportamos xls/xlsx/csv/html sin que el backend lea binarios.

ponytail: los nombres de columna (reporte y auditoría Buk) están como constantes
arriba — ajústalos si difieren. rut se normaliza para poder cruzar entre fuentes.
"""
from datetime import date, datetime, timedelta

# --- Atrasos: cabeceras esperadas en el reporte subido ---
XLS_COL_RUT = "RUT"
XLS_COL_DIA = "Día"
XLS_COL_ATRASO = "Atraso con Holgura"

# --- Olvido Marca: campos de cada fila CRUDA de Auditoría de Marca (Buk) ---
# La API devuelve fecha partida en dia/mes/ano y dispositivo en minúscula
# (la tabla UI muestra "Fecha"/"Dispositivo", pero eso es render, no la fila cruda).
AUD_COL_RUT = "DNI"
AUD_COL_DISPOSITIVO = "dispositivo"
AUD_COL_ANO, AUD_COL_MES, AUD_COL_DIA = "ano", "mes", "dia"
# Valor real observado en Buk. El match es tolerante (_es_olvido) porque el string
# ha aparecido con guiones y con espacios indistintamente.
AUD_DISPOSITIVO_OLVIDO = "API-Olvido de marca"


def _es_olvido(r: dict) -> bool:
    """Match tolerante del dispositivo: ignora casing, espacios, guiones y underscores.
    'API-Olvido-de-marca' == 'api olvido de marca' == 'API_Olvido_De_Marca'."""
    v = str(r.get(AUD_COL_DISPOSITIVO, ""))
    limpiar = lambda s: "".join(c for c in s.casefold() if c.isalnum())
    return limpiar(v) == limpiar(AUD_DISPOSITIVO_OLVIDO)


def _aud_fecha(r: dict) -> date | None:
    """Fecha de una fila de auditoría: de dia/mes/ano, o de un campo 'fecha' si existe."""
    try:
        return date(int(r[AUD_COL_ANO]), int(r[AUD_COL_MES]), int(r[AUD_COL_DIA]))
    except (KeyError, TypeError, ValueError):
        return _to_date(r.get("fecha"))


def norm_rut(v: object) -> str:
    """Normaliza rut para cruzar entre fuentes: sin puntos/espacios, sin DV,
    sin ceros a la izquierda.

    Dos formatos conviven: base Postgres con guión ('18.082.178-3') y archivo de
    atrasos con cuerpo+DV pegado sin guión ('261318555' = 26.131.855-5). En ambos
    casos el DV es el último caracter -> se elimina para dejar solo el cuerpo.
    '18.082.178-3' -> '18082178' · '261318555' -> '26131855'.
    """
    s = str(v or "").strip().replace(".", "").replace(" ", "").upper()
    s = s.split("-")[0] if "-" in s else s[:-1]  # dropea DV con o sin guión
    return s.lstrip("0")


def _dv(cuerpo: str) -> str:
    """Dígito verificador (módulo 11) del cuerpo de un rut."""
    suma, mult = 0, 2
    for d in reversed(cuerpo):
        suma += int(d) * mult
        mult = 2 if mult == 7 else mult + 1
    return {11: "0", 10: "K"}.get(11 - suma % 11, str(11 - suma % 11))


def _puntos(cuerpo: str) -> str:
    return f"{int(cuerpo):,}".replace(",", ".")


def fmt_rut(v: object) -> str:
    """Rut en cualquier formato de origen -> '16.072.644-K'.

    Las fuentes no son consistentes: con guión ('18.082.178-3'), con DV pegado
    ('16072644K') o derechamente sin DV ('16072644'). Sin guión desambigua el
    LARGO, no el mod 11: '26131855' valida como 2.613.185-5 y como 26.131.855-5,
    así que verificar el dígito no distingue nada.

        9 caracteres -> cuerpo de 8 + DV     ('261318555' -> 26.131.855-5)
        <=8, termina en K -> cuerpo + DV     ('16072644K' -> 16.072.644-K)
        <=8, todo dígitos -> cuerpo sin DV   ('16072644'  -> 16.072.644-K)

    ponytail: asume cuerpo de 8 dígitos, que es lo vigente. Un rut antiguo de
    cuerpo 7 CON el DV pegado ('1234567' + DV = 8 chars) se lee como cuerpo de 8
    y queda corrido. Se arregla de raíz cuando la fuente entregue el guión.
    """
    s = str(v or "").strip().replace(".", "").replace(" ", "").upper()
    if not s:
        return ""
    if "-" in s:  # guión explícito: el origen ya dice dónde corta, se respeta
        cuerpo, _, dv = s.partition("-")
        cuerpo = cuerpo.lstrip("0")
        return f"{_puntos(cuerpo)}-{dv}" if cuerpo.isdigit() else str(v)
    s = s.lstrip("0")
    if len(s) >= 9 or s.endswith("K"):
        cuerpo, dv = s[:-1], s[-1]
        return f"{_puntos(cuerpo)}-{dv}" if cuerpo.isdigit() else str(v)
    return f"{_puntos(s)}-{_dv(s)}" if s.isdigit() else str(v)


def _to_date(v: object) -> date | None:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        s = v.strip()[:10]
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
            try:
                return datetime.strptime(s, fmt).date()
            except ValueError:
                continue
    return None


def _periodo(d: date | None, q1_inicio: date, q2_inicio: date, q2_fin: date) -> int:
    """1, 2 o 0 (fuera de rango)."""
    if d is None:
        return 0
    if q1_inicio <= d < q2_inicio:
        return 1
    if q2_inicio <= d <= q2_fin:
        return 2
    return 0


def _atraso_cuenta(valor: object) -> bool:
    """True si la celda 'Atraso con Holgura' representa un atraso real (>0).

    ponytail: acepta número o duración 'H:M:S'; celda vacía/0 no cuenta.
    Confirmar la regla exacta (¿umbral de minutos?).
    """
    if valor is None or valor == "":
        return False
    if isinstance(valor, (int, float)):
        return valor > 0
    s = str(valor).strip()
    if not s or set(s) <= {"0", ":", " "}:
        return False
    return True


def contar_atrasos(
    rows: list[dict], q1_inicio: date, q2_inicio: date, q2_fin: date
) -> dict[str, dict[str, int]]:
    """Cuenta atrasos por rut/periodo desde las filas del reporte (ya parseado en
    el frontend). Cada fila con 'Atraso con Holgura' > 0 cuenta 1 en su periodo."""
    if rows and XLS_COL_RUT not in rows[0]:
        raise RuntimeError(
            f"Reporte de atrasos sin la columna '{XLS_COL_RUT}'. "
            f"Columnas: {list(rows[0].keys())}"
        )
    out: dict[str, dict[str, int]] = {}
    for r in rows:
        if XLS_COL_ATRASO in r and not _atraso_cuenta(r[XLS_COL_ATRASO]):
            continue
        per = _periodo(_to_date(r.get(XLS_COL_DIA)), q1_inicio, q2_inicio, q2_fin)
        if per == 0:
            continue
        rut = norm_rut(r.get(XLS_COL_RUT))
        if not rut:
            continue
        out.setdefault(rut, {"p1": 0, "p2": 0})[f"p{per}"] += 1
    return out


def detalle_atrasos(
    rows: list[dict], q1_inicio: date, q2_inicio: date, q2_fin: date
) -> list[dict]:
    """Filas de atrasos que cuentan, con rut normalizado y periodo (para hoja de auditoría)."""
    out: list[dict] = []
    for r in rows:
        if XLS_COL_ATRASO in r and not _atraso_cuenta(r[XLS_COL_ATRASO]):
            continue
        f = _to_date(r.get(XLS_COL_DIA))
        per = _periodo(f, q1_inicio, q2_inicio, q2_fin)
        if per == 0:
            continue
        out.append({
            "RUT": fmt_rut(r.get(XLS_COL_RUT)),
            "Día": f.isoformat() if f else str(r.get(XLS_COL_DIA, "")),
            "Atraso con Holgura": r.get(XLS_COL_ATRASO, ""),
            "Periodo": per,
        })
    return out


def contar_olvidos(
    aud_rows: list[dict], q1_inicio: date, q2_inicio: date, q2_fin: date
) -> dict[str, dict[str, int]]:
    """Cuenta filas de Auditoría con Dispositivo == API-Olvido-de-marca, por rut/periodo."""
    out: dict[str, dict[str, int]] = {}
    for r in aud_rows:
        if not _es_olvido(r):
            continue
        per = _periodo(_aud_fecha(r), q1_inicio, q2_inicio, q2_fin)
        if per == 0:
            continue
        rut = norm_rut(r.get(AUD_COL_RUT))
        if not rut:
            continue
        out.setdefault(rut, {"p1": 0, "p2": 0})[f"p{per}"] += 1
    return out


def detalle_olvidos(
    aud_rows: list[dict], q1_inicio: date, q2_inicio: date, q2_fin: date
) -> list[dict]:
    """Filas de olvido de marca en rango, con rut/fecha/periodo (para hoja de auditoría)."""
    out: list[dict] = []
    for r in aud_rows:
        if not _es_olvido(r):
            continue
        f = _aud_fecha(r)
        per = _periodo(f, q1_inicio, q2_inicio, q2_fin)
        if per == 0:
            continue
        rut = norm_rut(r.get(AUD_COL_RUT))
        if not rut:
            continue
        out.append({
            "RUT": fmt_rut(rut),
            "Fecha": f.isoformat() if f else "",
            "Obra": r.get("obra_id", ""),
            "Periodo": per,
        })
    return out


CRUCE_COLS = ["RUT", "Nombre", "Cargo", "Día", "Atraso con Holgura", "Periodo",
              "Permiso Inicio", "Permiso Fin", "day_percent"]


def cruce_atrasos_permiso_horas(
    atrasos_rows: list[dict], permisos_rows: list[dict],
    q1_inicio: date, q2_inicio: date, q2_fin: date,
) -> list[dict]:
    """Atrasos que caen el mismo día que un permiso_por_horas del mismo trabajador.

    Solo auditoría: no toca el cálculo del bono. Un permiso multi-día se expande
    a todos sus días para el match.
    ponytail: cruce en Python porque los atrasos vienen de un xls subido, no de la
    BD. Cuando los atrasos estén en la BD, esto es un JOIN y este módulo se borra.
    """
    por_dia: dict[tuple[str, date], dict] = {}
    for p in permisos_rows:
        ini, fin = _to_date(p.get("start_date")), _to_date(p.get("end_date"))
        if ini is None or fin is None or fin < ini:
            continue
        rut = norm_rut(p.get("rut"))
        for n in range((fin - ini).days + 1):
            por_dia.setdefault((rut, ini + timedelta(days=n)), p)

    out: list[dict] = []
    for a in detalle_atrasos(atrasos_rows, q1_inicio, q2_inicio, q2_fin):
        # detalle_atrasos ya emite el RUT formateado; norm_rut lo revierte para el match.
        p = por_dia.get((norm_rut(a["RUT"]), _to_date(a["Día"])))
        if p is None:
            continue
        out.append({
            "RUT": a["RUT"], "Nombre": p.get("full_name", ""), "Cargo": p.get("name_role", ""),
            "Día": a["Día"], "Atraso con Holgura": a["Atraso con Holgura"], "Periodo": a["Periodo"],
            "Permiso Inicio": str(p.get("start_date", ""))[:10],
            "Permiso Fin": str(p.get("end_date", ""))[:10],
            "day_percent": p.get("day_percent", ""),
        })
    return out


if __name__ == "__main__":
    q1, q2, qf = date(2026, 6, 14), date(2026, 6, 29), date(2026, 7, 14)

    assert norm_rut("12.345.678-9") == "12345678"
    assert _periodo(date(2026, 6, 28), q1, q2, qf) == 1
    assert _periodo(date(2026, 6, 29), q1, q2, qf) == 2
    assert _periodo(date(2026, 8, 1), q1, q2, qf) == 0
    assert _atraso_cuenta("0:00:00") is False
    assert _atraso_cuenta("0:05:00") is True
    assert _atraso_cuenta(3) is True and _atraso_cuenta(0) is False

    # norm_rut cruza dashed (base) y cuerpo+DV pegado (archivo atrasos).
    assert norm_rut("18.082.178-3") == "18082178"
    assert norm_rut("261318555") == "26131855"          # 26.131.855-5 sin guión
    assert norm_rut("18.082.178-3") == norm_rut("180821783")  # misma persona, ambos formatos

    # fmt_rut: reconstruye puntos + guión + DV desde cualquier formato de origen.
    assert fmt_rut("16.072.644-K") == "16.072.644-K"   # ya formateado
    assert fmt_rut("16072644K") == "16.072.644-K"      # DV pegado
    assert fmt_rut("16072644") == "16.072.644-K"       # SIN DV -> mod 11 lo detecta
    assert fmt_rut("261318555") == "26.131.855-5"
    assert fmt_rut("26131855") == "26.131.855-5"
    assert fmt_rut("18.082.178-3") == "18.082.178-3"
    assert fmt_rut("180821783") == "18.082.178-3"
    assert fmt_rut("18082178") == "18.082.178-3"
    assert fmt_rut("01234567-8") == "1.234.567-8"      # ceros a la izquierda
    assert fmt_rut("019117548") == "19.117.548-4"       # 0 a la izquierda, cuerpo sin DV
    assert fmt_rut("") == "" and fmt_rut(None) == ""
    # Con guión el origen manda, aunque el DV no valide (ruts de prueba).
    assert fmt_rut("12.345.678-9") == "12.345.678-9"

    olv = contar_olvidos([
        {"DNI": "12.345.678-9", "ano": 2026, "mes": 6, "dia": 20, "dispositivo": "API-Olvido de marca"},
        {"DNI": "12.345.678-9", "ano": 2026, "mes": 7, "dia": 1, "dispositivo": "API-Olvido de marca"},
        {"DNI": "12.345.678-9", "ano": 2026, "mes": 7, "dia": 2, "dispositivo": "Reloj"},  # no cuenta
    ], q1, q2, qf)
    assert olv["12345678"] == {"p1": 1, "p2": 1}, olv

    # Dispositivo con casing/separadores distintos igual cuenta (el string de Buk varía).
    variantes = contar_olvidos([
        {"DNI": "12.345.678-9", "ano": 2026, "mes": 6, "dia": 20, "dispositivo": "api olvido de marca"},
        {"DNI": "12.345.678-9", "ano": 2026, "mes": 6, "dia": 21, "dispositivo": "API_Olvido_De_Marca"},
        {"DNI": "12.345.678-9", "ano": 2026, "mes": 6, "dia": 22, "dispositivo": "API-Olvido-de-marca"},
        {"DNI": "12.345.678-9", "ano": 2026, "mes": 6, "dia": 23, "dispositivo": "Olvido"},  # no cuenta
    ], q1, q2, qf)
    assert variantes["12345678"] == {"p1": 3, "p2": 0}, variantes

    atr = contar_atrasos([
        {"RUT": "9.999.999-9", "Día": "2026-06-20", "Atraso con Holgura": "0:10:00"},
        {"RUT": "9.999.999-9", "Día": "2026-07-01", "Atraso con Holgura": "0:05:00"},
        {"RUT": "9.999.999-9", "Día": "2026-07-02", "Atraso con Holgura": "0:00:00"},  # no cuenta
    ], q1, q2, qf)
    assert atr["9999999"] == {"p1": 1, "p2": 1}, atr

    # Cruce atraso × permiso_por_horas: match solo si mismo rut Y día dentro del permiso.
    cruce = cruce_atrasos_permiso_horas(
        [
            {"RUT": "9.999.999-9", "Día": "2026-06-20", "Atraso con Holgura": "0:10:00"},  # match
            {"RUT": "9.999.999-9", "Día": "2026-06-25", "Atraso con Holgura": "0:10:00"},  # sin permiso
            {"RUT": "1.111.111-1", "Día": "2026-06-20", "Atraso con Holgura": "0:10:00"},  # otro rut
            {"RUT": "9.999.999-9", "Día": "2026-06-21", "Atraso con Holgura": "0:00:00"},  # atraso 0
        ],
        [{"rut": "9.999.999-9", "full_name": "Ana", "name_role": "Operario",
          "start_date": date(2026, 6, 20), "end_date": date(2026, 6, 21), "day_percent": "0.5"}],
        q1, q2, qf,
    )
    assert len(cruce) == 1, cruce
    assert cruce[0]["RUT"] == "9.999.999-9" and cruce[0]["Día"] == "2026-06-20"
    assert cruce[0]["Nombre"] == "Ana" and cruce[0]["Periodo"] == 1
    assert list(cruce[0].keys()) == CRUCE_COLS
    print("incidencias demo OK")
