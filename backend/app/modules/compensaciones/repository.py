"""Acceso a datos del módulo: consultas de CONTEXTO_DATOS, todas con binds."""
from sqlalchemy import text
from sqlalchemy.orm import Session


def estudios(db: Session):
    return db.execute(text("""
        SELECT id, vista, pais, anio, moneda, factor_mensual
        FROM compensaciones.estudio ORDER BY pais, anio DESC
    """)).mappings().all()


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
                 WHERE p.estudio_id = e.id AND p.cargo_codigo = ANY(h.cargos_elegidos)) AS titulos
        FROM compensaciones.estudio e
        JOIN compensaciones.cargo_empresa ce ON ce.pais = e.pais
        LEFT JOIN LATERAL (
          SELECT a.* FROM compensaciones.analisis a
          WHERE a.estudio_id = e.id AND a.cargo_empresa_id = ce.id
          ORDER BY a.created_at DESC, a.id DESC LIMIT 1) h ON true
        LEFT JOIN compensaciones.nivel n ON n.codigo = h.nivel_codigo
        LEFT JOIN compensaciones.cbo cbo ON ce.pais = 'BR'
          AND cbo.codigo = lpad(regexp_replace(ce.code, '[^0-9]', '', 'g'), 6, '0')
        WHERE e.id = :estudio_id
        ORDER BY ce.name
    """), {"estudio_id": estudio_id}).mappings().all()
