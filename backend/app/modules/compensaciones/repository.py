"""Acceso a datos del módulo: consultas de CONTEXTO_DATOS, todas con binds."""
from sqlalchemy import text
from sqlalchemy.orm import Session


def estudios(db: Session, paises: list[str] | None):
    """`paises=None` (admin) trae todos."""
    return db.execute(text("""
        SELECT id, vista, pais, anio, moneda, factor_mensual
        FROM compensaciones.estudio
        WHERE CAST(:paises AS text[]) IS NULL OR pais = ANY(CAST(:paises AS text[]))
        ORDER BY pais, anio DESC
    """), {"paises": paises}).mappings().all()


def acceso(db: Session, username: str):
    """{admin, paises} del usuario en el módulo; None si no tiene fila."""
    return db.execute(text(
        "SELECT admin, paises FROM compensaciones.acceso WHERE username = :username"
    ), {"username": username}).mappings().first()


def get_estudio(db: Session, estudio_id: int):
    return db.execute(text("""
        SELECT id, vista, pais, anio, moneda, factor_mensual
        FROM compensaciones.estudio WHERE id = :id
    """), {"id": estudio_id}).mappings().first()


def candidatos(db: Session, estudio_id: int, q: str, umbral: float, limite: int):
    """Consulta 1: top cargos por coseno. `q` es el embedding como '[v1,v2,...]'."""
    return db.execute(text("""
        SELECT * FROM (
          SELECT DISTINCT ON (p.cargo_codigo)
                 p.cargo_codigo, p.titulo, p.familia, p.subfamilia, p.titulo_tipico, p.descripcion,
                 1 - (v.embedding <=> CAST(:q AS vector)) AS similitud
          FROM compensaciones.puesto_vec v
          JOIN compensaciones.puesto p ON p.id = v.puesto_id
          WHERE p.estudio_id = :estudio_id
          ORDER BY p.cargo_codigo, v.embedding <=> CAST(:q AS vector)
        ) t
        WHERE similitud >= :umbral
        ORDER BY similitud DESC LIMIT :limite
    """), {"q": q, "estudio_id": estudio_id, "umbral": umbral, "limite": limite}).mappings().all()


def niveles(db: Session, estudio_id: int, cargos: list[str]):
    """Consulta 2: niveles comunes a todos los cargos, con COMP1.promedio."""
    return db.execute(text("""
        SELECT n.codigo, n.nombre
        FROM compensaciones.v_mercado m
        JOIN compensaciones.nivel n ON n.codigo = m.nivel_codigo
        WHERE m.estudio_id = :estudio_id AND m.cargo_codigo = ANY(:cargos)
          AND m.medida_codigo = 'COMP1' AND m.promedio IS NOT NULL
        GROUP BY n.codigo, n.nombre, n.altura
        HAVING count(DISTINCT m.cargo_codigo) = cardinality(CAST(:cargos AS text[]))
        ORDER BY n.altura, n.codigo
    """), {"estudio_id": estudio_id, "cargos": cargos}).mappings().all()


def detalle(db: Session, estudio_id: int, nivel: str, cargos: list[str]):
    """Consulta 3: cada cargo y su(s) subfamilia(s) en el nivel."""
    return db.execute(text("""
        SELECT CASE WHEN m.es_core THEN 'subfamilia' ELSE 'cargo' END AS tipo,
               m.cargo_codigo, m.titulo, m.medida_codigo, m.n_companias, m.n_observaciones,
               m.p25, m.mediana, m.promedio, m.p75
        FROM compensaciones.v_mercado m
        WHERE m.estudio_id = :estudio_id AND m.nivel_codigo = :nivel
          AND m.medida_codigo IN ('COMP1', 'COMP3_REAL')
          AND (m.cargo_codigo = ANY(:cargos)
               OR (m.es_core AND m.subfamilia_codigo IN (
                     SELECT subfamilia_codigo FROM compensaciones.puesto
                     WHERE estudio_id = :estudio_id AND cargo_codigo = ANY(:cargos))))
        ORDER BY m.es_core, m.titulo, m.medida_codigo
    """), {"estudio_id": estudio_id, "nivel": nivel, "cargos": cargos}).mappings().all()


def hibrido(db: Session, estudio_id: int, nivel: str, cargos: list[str]):
    """Consulta 4: promedio simple de los cargos elegidos."""
    return db.execute(text("""
        SELECT m.medida_codigo,
               CASE WHEN count(m.p25)      = count(*) THEN avg(m.p25)      END AS p25,
               CASE WHEN count(m.mediana)  = count(*) THEN avg(m.mediana)  END AS mediana,
               CASE WHEN count(m.promedio) = count(*) THEN avg(m.promedio) END AS promedio,
               CASE WHEN count(m.p75)      = count(*) THEN avg(m.p75)      END AS p75
        FROM compensaciones.v_mercado m
        WHERE m.estudio_id = :estudio_id AND m.nivel_codigo = :nivel
          AND m.cargo_codigo = ANY(:cargos) AND NOT m.es_core
          AND m.medida_codigo IN ('COMP1', 'COMP3_REAL')
        GROUP BY m.medida_codigo
    """), {"estudio_id": estudio_id, "nivel": nivel, "cargos": cargos}).mappings().all()


def guardar_analisis(db: Session, a: dict, usuario: str) -> int:
    """Consulta 5: guarda el análisis completo (solo cuando el usuario lo pide)."""
    id_ = db.execute(text("""
        INSERT INTO compensaciones.analisis
          (estudio_id, cargo_nombre, descriptor, candidatos, cargos_elegidos, nivel_codigo, creado_por, cargo_empresa_id)
        VALUES (:estudio_id, :cargo_nombre, :descriptor, CAST(:candidatos AS jsonb), :cargos, :nivel, :usuario, :cargo_empresa_id)
        RETURNING id
    """), {**a, "usuario": usuario}).scalar()
    db.commit()
    return id_


def historial(db: Session, estudio_id: int, usuario: str | None):
    """Análisis guardados del estudio, del más reciente; `usuario=None` trae todos."""
    return db.execute(text("""
        SELECT a.id, a.estudio_id, a.cargo_nombre, a.descriptor, a.candidatos,
               a.cargos_elegidos AS cargos, a.nivel_codigo AS nivel, n.nombre AS nivel_nombre,
               a.creado_por, a.created_at
        FROM compensaciones.analisis a
        JOIN compensaciones.nivel n ON n.codigo = a.nivel_codigo
        WHERE a.estudio_id = :estudio_id
          AND (CAST(:usuario AS text) IS NULL OR a.creado_por = :usuario)
        ORDER BY a.created_at DESC LIMIT 200
    """), {"estudio_id": estudio_id, "usuario": usuario}).mappings().all()


def borrar_analisis(db: Session, id_: int, usuario: str | None) -> bool:
    """Borra un análisis; `usuario=None` (admin) borra cualquiera, si no solo los propios."""
    borrado = db.execute(text("""
        DELETE FROM compensaciones.analisis
        WHERE id = :id AND (CAST(:usuario AS text) IS NULL OR creado_por = :usuario)
        RETURNING id
    """), {"id": id_, "usuario": usuario}).scalar()
    db.commit()
    return borrado is not None


def cargo_del_pais_del_estudio(db: Session, cargo_empresa_id: int, estudio_id: int) -> bool:
    """True si el cargo de la empresa existe y es del mismo país que el estudio."""
    return db.execute(text("""
        SELECT 1 FROM compensaciones.cargo_empresa ce
        JOIN compensaciones.estudio e ON e.pais = ce.pais
        WHERE ce.id = :cargo_empresa_id AND e.id = :estudio_id
    """), {"cargo_empresa_id": cargo_empresa_id, "estudio_id": estudio_id}).first() is not None


def cargos_empresa(db: Session, estudio_id: int):
    """Cargos del país del estudio + su homologación vigente (la última)."""
    return db.execute(text("""
        SELECT ce.id, ce.code, ce.name, ce.description, ce.requirements,
               -- descriptor del match: objetivos + los 10 primeros títulos CBO (solo BR)
               nullif(left(concat_ws(chr(10), nullif(ce.description, ''), 'Ocupación CBO: '
                 || array_to_string((string_to_array(cbo.titulos, ', '))[1:10], ', ')), 4000), '') AS descriptor,
               h.id AS analisis_id, h.cargos_elegidos AS cargos, h.nivel_codigo AS nivel,
               n.nombre AS nivel_nombre, h.creado_por, h.created_at,
               (SELECT array_agg(DISTINCT p.titulo) FROM compensaciones.puesto p
                 WHERE p.estudio_id = e.id AND p.cargo_codigo = ANY(h.cargos_elegidos)) AS titulos,
               hv.grado AS hay_grado, hv.puntos_total AS hay_puntos
        FROM compensaciones.estudio e
        JOIN compensaciones.cargo_empresa ce ON ce.pais = e.pais
        LEFT JOIN LATERAL (
          SELECT a.* FROM compensaciones.analisis a
          WHERE a.estudio_id = e.id AND a.cargo_empresa_id = ce.id
          ORDER BY a.created_at DESC, a.id DESC LIMIT 1) h ON true
        LEFT JOIN compensaciones.nivel n ON n.codigo = h.nivel_codigo
        LEFT JOIN compensaciones.v_hay_vigente hv ON hv.cargo_empresa_id = ce.id
        LEFT JOIN compensaciones.cbo cbo ON ce.pais = 'BR'
          AND cbo.codigo = lpad(regexp_replace(ce.code, '[^0-9]', '', 'g'), 6, '0')
        WHERE e.id = :estudio_id
        ORDER BY ce.name
    """), {"estudio_id": estudio_id}).mappings().all()


def dotacion(db: Session, estudio_id: int):
    """Personas activas del país del estudio + homologación, mercado mensual (COMP1 ÷ factor), HAY y último cambio de sueldo (CL)."""
    return db.execute(text("""
        SELECT d.employee_id, d.documento, d.nombre, d.cargo_buk, d.empresa, d.centro_costo, d.jefe,
               d.fecha_ingreso, d.url_picture, d.base_wage,
               ce.id AS cargo_empresa_id, ce.name AS cargo, h.cargos_elegidos AS cargos,
               h.nivel_codigo AS nivel, n.nombre AS nivel_nombre,
               hv.grado AS hay_grado, hv.puntos_total AS hay_puntos,
               m.p25 / e.factor_mensual AS p25, m.mediana / e.factor_mensual AS mediana,
               m.promedio / e.factor_mensual AS promedio, m.p75 / e.factor_mensual AS p75,
               ea.sueldo_base_anterior, ea.variacion_sueldo_pct, ea.fecha_cambio_sueldo
        FROM compensaciones.estudio e
        JOIN compensaciones.v_dotacion d ON d.pais = e.pais
        LEFT JOIN compensaciones.cargo_empresa ce ON ce.pais = d.pais AND ce.id_origen = d.role_id
        LEFT JOIN compensaciones.v_homologacion_vigente h ON h.estudio_id = e.id AND h.cargo_empresa_id = ce.id
        LEFT JOIN compensaciones.nivel n ON n.codigo = h.nivel_codigo
        -- híbrido: promedio simple; un estadístico solo si todos los cargos lo tienen (sin homologación: fila NULL)
        LEFT JOIN LATERAL (
          SELECT CASE WHEN count(v.p25)      = count(*) THEN avg(v.p25)      END AS p25,
                 CASE WHEN count(v.mediana)  = count(*) THEN avg(v.mediana)  END AS mediana,
                 CASE WHEN count(v.promedio) = count(*) THEN avg(v.promedio) END AS promedio,
                 CASE WHEN count(v.p75)      = count(*) THEN avg(v.p75)      END AS p75
          FROM compensaciones.v_mercado v
          WHERE v.estudio_id = e.id AND v.nivel_codigo = h.nivel_codigo
            AND v.cargo_codigo = ANY(h.cargos_elegidos) AND NOT v.es_core AND v.medida_codigo = 'COMP1'
        ) m ON true
        LEFT JOIN compensaciones.v_hay_vigente hv ON hv.cargo_empresa_id = ce.id
        -- historial: las vistas rh.* son de Chile; los id de Perú no deben cruzarse con ellas
        LEFT JOIN rh.vw_employees_anterior ea ON d.pais = 'CL' AND ea.employee_id = d.employee_id
        WHERE e.id = :estudio_id
        ORDER BY d.nombre
    """), {"estudio_id": estudio_id}).mappings().all()


def historial_persona(db: Session, estudio_id: int, employee_id: int):
    """Cambios desde 2022-06 (antes: migración a BUK) de una persona activa del país del estudio; [] si no."""
    return db.execute(text("""
        SELECT c.fecha_cambio, c.tipo_cambio, c.valor_anterior, c.valor_nuevo, c.variacion_pct
        FROM compensaciones.estudio e
        JOIN compensaciones.v_dotacion d ON d.pais = e.pais AND d.employee_id = :employee_id
        JOIN rh.vw_job_history_cambios c ON d.pais = 'CL' AND c.employee_id = d.employee_id
        WHERE e.id = :estudio_id AND c.fecha_cambio >= DATE '2022-06-01'
        ORDER BY c.fecha_cambio DESC
    """), {"estudio_id": estudio_id, "employee_id": employee_id}).mappings().all()


# ---------------------------------------------------------------- HAY
def hay_tablas(db: Session) -> dict:
    """Las 5 tablas de referencia HAY como dicts {clave: puntos}; grados como [(grado, min, max)]."""
    def q(sql):
        return db.execute(text(sql)).all()
    return {
        "kh": {tuple(r[:5]): r[5] for r in q(
            "SELECT tecnica, signo_tecnica, gestion, signo_gestion, rrhh, puntos FROM compensaciones.hay_know_how")},
        "sp_pct": {tuple(r[:3]): r[3] for r in q(
            "SELECT marco, complejidad, signo, porcentaje FROM compensaciones.hay_sp_porcentaje")},
        "sp_pts": {tuple(r[:2]): r[2] for r in q(
            "SELECT porcentaje, puntos_kh, puntos FROM compensaciones.hay_sp_puntos")},
        "resp": {tuple(r[:4]): r[4] for r in q(
            "SELECT libertad, signo, magnitud, impacto, puntos FROM compensaciones.hay_responsabilidad")},
        "grados": [tuple(r) for r in q(
            "SELECT grado, puntos_min, puntos_max FROM compensaciones.hay_grado ORDER BY puntos_min")],
    }


def guardar_hay(db: Session, h: dict, usuario: str):
    """Inserta entradas + snapshot; None si el cargo no existe."""
    fila = db.execute(text("""
        INSERT INTO compensaciones.hay_evaluacion
          (cargo_empresa_id, tecnica, signo_tecnica, gestion, signo_gestion, rrhh, marco, complejidad,
           signo_complejidad, libertad, signo_libertad, magnitud, impacto, puntos_kh, porcentaje_sp,
           puntos_sp, puntos_resp, puntos_total, grado, comentario, creado_por)
        SELECT id, :tecnica, :signo_tecnica, :gestion, :signo_gestion, :rrhh, :marco, :complejidad,
               :signo_complejidad, :libertad, :signo_libertad, :magnitud, :impacto, :puntos_kh, :porcentaje_sp,
               :puntos_sp, :puntos_resp, :puntos_total, :grado, :comentario, :usuario
        FROM compensaciones.cargo_empresa WHERE id = :cargo_empresa_id
        RETURNING *
    """), {**h, "usuario": usuario}).mappings().first()
    db.commit()
    return fila


def hay_historial(db: Session, cargo_empresa_id: int, paises: list[str] | None):
    """Evaluaciones del cargo, de la más reciente (la vigente) a la más antigua; `paises=None` sin filtro."""
    return db.execute(text("""
        SELECT h.* FROM compensaciones.hay_evaluacion h
        JOIN compensaciones.cargo_empresa ce ON ce.id = h.cargo_empresa_id
        WHERE h.cargo_empresa_id = :cargo_empresa_id
          AND (CAST(:paises AS text[]) IS NULL OR ce.pais = ANY(CAST(:paises AS text[])))
        ORDER BY h.created_at DESC, h.id DESC
    """), {"cargo_empresa_id": cargo_empresa_id, "paises": paises}).mappings().all()
