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


def get_analisis(db: Session, analisis_id: int):
    return db.execute(
        text("SELECT id, estudio_id FROM compensaciones.analisis WHERE id = :id"),
        {"id": analisis_id},
    ).mappings().first()


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


def crear_analisis(db: Session, estudio_id: int, cargo_nombre: str, descriptor: str | None,
                   candidatos_json: str, usuario: str) -> int:
    """Consulta 5 (INSERT)."""
    id_ = db.execute(text("""
        INSERT INTO compensaciones.analisis (estudio_id, cargo_nombre, descriptor, candidatos, creado_por)
        VALUES (:estudio_id, :cargo_nombre, :descriptor, CAST(:candidatos AS jsonb), :usuario)
        RETURNING id
    """), {"estudio_id": estudio_id, "cargo_nombre": cargo_nombre, "descriptor": descriptor,
           "candidatos": candidatos_json, "usuario": usuario}).scalar()
    db.commit()
    return id_


def elegir(db: Session, analisis_id: int, cargos: list[str], nivel: str) -> None:
    """Consulta 5 (UPDATE)."""
    db.execute(text("""
        UPDATE compensaciones.analisis
        SET cargos_elegidos = :cargos, nivel_codigo = :nivel
        WHERE id = :analisis_id
    """), {"cargos": cargos, "nivel": nivel, "analisis_id": analisis_id})
    db.commit()
