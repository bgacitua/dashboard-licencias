from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any, Tuple, Optional
from app.core.logging_config import logger
from datetime import date

class MarcasRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_relojes(self) -> List[str]:
        """Obtiene la lista de relojes/torniquetes disponibles"""
        query = text("""
            SELECT DISTINCT bd.[NAME_] as nombre_reloj
            FROM [dbo].[BiometricDevice] AS bd
            ORDER BY bd.[NAME_]
        """)
        try:
            result = self.db.execute(query)
            return [row.nombre_reloj for row in result if row.nombre_reloj]
        except Exception as e:
            logger.error(f"Error al obtener relojes: {type(e).__name__}: {str(e)}")
            raise

    def get_marcas(
        self, 
        limit: int = 100, 
        offset: int = 0,
        fecha_inicio: Optional[date] = None,
        fecha_fin: Optional[date] = None,
        nombre: Optional[str] = None,
        rut: Optional[str] = None,
        reloj: Optional[str] = None,
        tipo_marca: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Obtiene las marcas con paginación y filtros"""
        
        # Construir condiciones WHERE dinámicamente
        where_conditions = []
        params = {"limit": limit, "offset": offset}
        
        # Si hay nombre o RUT, NO aplicar filtro de fecha (buscar en todo el historial)
        aplicar_filtro_fecha = not (nombre or rut)
        
        # Filtro por rango de fechas
        if aplicar_filtro_fecha:
            if fecha_inicio and fecha_fin:
                where_conditions.append("""
                    CAST(m.[LOGDATETIME] AT TIME ZONE 'UTC' AT TIME ZONE 'Pacific SA Standard Time' AS DATE) 
                    BETWEEN :fecha_inicio AND :fecha_fin
                """)
                params["fecha_inicio"] = fecha_inicio.isoformat()
                params["fecha_fin"] = fecha_fin.isoformat()
            elif fecha_inicio:
                where_conditions.append("""
                    CAST(m.[LOGDATETIME] AT TIME ZONE 'UTC' AT TIME ZONE 'Pacific SA Standard Time' AS DATE) >= :fecha_inicio
                """)
                params["fecha_inicio"] = fecha_inicio.isoformat()
            elif fecha_fin:
                where_conditions.append("""
                    CAST(m.[LOGDATETIME] AT TIME ZONE 'UTC' AT TIME ZONE 'Pacific SA Standard Time' AS DATE) <= :fecha_fin
                """)
                params["fecha_fin"] = fecha_fin.isoformat()
            else:
                # Por defecto: hoy
                where_conditions.append("""
                    CAST(m.[LOGDATETIME] AT TIME ZONE 'UTC' AT TIME ZONE 'Pacific SA Standard Time' AS DATE) = CAST(GETDATE() AS DATE)
                """)
        
        # Filtro por nombre (búsqueda parcial con %% - case insensitive)
        # Busca cada palabra del input en FIRSTNAME o LASTNAME
        if nombre:
            # Dividir el nombre en palabras y buscar cada una
            palabras = nombre.strip().split()
            nombre_conditions = []
            for i, palabra in enumerate(palabras):
                param_name = f"nombre_{i}"
                nombre_conditions.append(f"""
                    (LOWER(u.[FIRSTNAME]) LIKE LOWER(:{param_name}) 
                    OR LOWER(u.[LASTNAME]) LIKE LOWER(:{param_name}))
                """)
                params[param_name] = f"%{palabra}%"
            
            # Todas las palabras deben coincidir (AND)
            if nombre_conditions:
                where_conditions.append("(" + " AND ".join(nombre_conditions) + ")")
        
        # Filtro por RUT (búsqueda parcial con %%)
        if rut:
            where_conditions.append("u.[EMPLOYEEID] LIKE :rut")
            params["rut"] = f"%{rut}%"
        
        # Filtro por reloj (exacto o parcial)
        if reloj:
            where_conditions.append("bd.[NAME_] LIKE :reloj")
            params["reloj"] = f"%{reloj}%"
        
        # Filtro por tipo de marca (IN o OUT)
        # FUNCTIONKEY: 0=No key, 6=Entrada (IN), 7=Salida (OUT)
        if tipo_marca:
            if tipo_marca.upper() == 'IN':
                where_conditions.append("m.[FUNCTIONKEY] = 6")  # 6 = Entrada
            elif tipo_marca.upper() == 'OUT':
                where_conditions.append("m.[FUNCTIONKEY] = 7")  # 7 = Salida
        
        # Si no hay condiciones, al menos filtrar por hoy
        if not where_conditions:
            where_conditions.append("""
                CAST(m.[LOGDATETIME] AT TIME ZONE 'UTC' AT TIME ZONE 'Pacific SA Standard Time' AS DATE) = CAST(GETDATE() AS DATE)
            """)
        
        where_clause = " AND ".join(where_conditions)
        
        # Query para contar el total
        count_sql = f"""
            SELECT COUNT(*) as total
            FROM [dbo].[AccessLog] AS m
            INNER JOIN [dbo].[BiometricDevice] AS bd 
                ON m.[MORPHOACCESSID] = bd.[ID]
            INNER JOIN [dbo].[User_] AS u 
                ON m.[USERID] = u.[ID]
            WHERE {where_clause}
        """
        
        # Query con paginación
        data_sql = f"""
            SELECT
                bd.[NAME_] as nombre_reloj,
                CONCAT(u.[FIRSTNAME], ' ', u.[LASTNAME]) AS nombre_completo,
                u.[EMPLOYEEID] as rut,
                CAST(m.[LOGDATETIME] AT TIME ZONE 'UTC' AT TIME ZONE 'Pacific SA Standard Time' AS DATE) AS fecha,
                CAST(m.[LOGDATETIME] AT TIME ZONE 'UTC' AT TIME ZONE 'Pacific SA Standard Time' AS TIME(0)) AS hora_marca,
                m.[FUNCTIONKEY] as tipo_marca,
                m.[FUNCTIONKEYTEXT] as tipo_marca_texto
            FROM [dbo].[AccessLog] AS m
            INNER JOIN [dbo].[BiometricDevice] AS bd 
                ON m.[MORPHOACCESSID] = bd.[ID]
            INNER JOIN [dbo].[User_] AS u 
                ON m.[USERID] = u.[ID]
            WHERE {where_clause}
            ORDER BY m.[LOGDATETIME] DESC
            OFFSET :offset ROWS
            FETCH NEXT :limit ROWS ONLY
        """
        
        try:
            # Obtener total
            count_result = self.db.execute(text(count_sql), params)
            total = count_result.scalar()
            
            # Obtener datos paginados
            result = self.db.execute(text(data_sql), params)
            marcas = []
            for row in result:
                marcas.append({
                    "nombre_reloj": row.nombre_reloj,
                    "nombre_completo": row.nombre_completo,
                    "rut": row.rut,
                    "fecha": str(row.fecha) if row.fecha else None,
                    "hora_marca": str(row.hora_marca) if row.hora_marca else None,
                    "tipo_marca": "IN" if row.tipo_marca == 6 else ("OUT" if row.tipo_marca == 7 else "No key"),
                    "tipo_marca_texto": row.tipo_marca_texto
                })
            logger.info(f"Marcas: {len(marcas)} de {total}")
            return marcas, total
        except Exception as e:
            logger.error(f"Error al obtener marcas: {type(e).__name__}: {str(e)}")
            raise
