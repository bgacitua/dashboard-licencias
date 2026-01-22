from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any, Tuple
from app.core.logging_config import logger
import traceback

class MarcasRepository:
    def __init__(self, db: Session):
        self.db = db
        logger.info("MarcasRepository inicializado")

    def get_marcas_hoy(self, limit: int = 100, offset: int = 0) -> Tuple[List[Dict[str, Any]], int]:
        """Obtiene las marcas del día actual con paginación"""
        logger.info(f"=== INICIO get_marcas_hoy (limit={limit}, offset={offset}) ===")
        
        # Query para contar el total
        count_query = text("""
            SELECT COUNT(*) as total
            FROM [dbo].[AccessLog] AS m
            INNER JOIN [dbo].[BiometricDevice] AS bd 
                ON m.[MORPHOACCESSID] = bd.[ID]
            INNER JOIN [dbo].[User_] AS u 
                ON m.[USERID] = u.[ID]
            WHERE CAST(m.[LOGDATETIME] AT TIME ZONE 'UTC' AT TIME ZONE 'Pacific SA Standard Time' AS DATE) = CAST(GETDATE() AS DATE)
        """)
        
        # Query con paginación (SQL Server usa OFFSET/FETCH)
        data_query = text("""
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
            WHERE CAST(m.[LOGDATETIME] AT TIME ZONE 'UTC' AT TIME ZONE 'Pacific SA Standard Time' AS DATE) = CAST(GETDATE() AS DATE)
            ORDER BY m.[LOGDATETIME] DESC
            OFFSET :offset ROWS
            FETCH NEXT :limit ROWS ONLY
        """)
        
        try:
            # Verificar conexión
            logger.info("Verificando conexión a BD de marcas...")
            logger.info(f"Sesión DB: {self.db}")
            logger.info(f"Bind: {self.db.get_bind()}")
            
            # Obtener total
            logger.info("Ejecutando count_query...")
            count_result = self.db.execute(count_query)
            total = count_result.scalar()
            logger.info(f"Total de marcas encontradas: {total}")
            
            # Obtener datos paginados
            logger.info("Ejecutando data_query...")
            result = self.db.execute(data_query, {"limit": limit, "offset": offset})
            marcas = []
            for row in result:
                marcas.append({
                    "nombre_reloj": row.nombre_reloj,
                    "nombre_completo": row.nombre_completo,
                    "rut": row.rut,
                    "fecha": str(row.fecha) if row.fecha else None,
                    "hora_marca": str(row.hora_marca) if row.hora_marca else None,
                    "tipo_marca": row.tipo_marca,
                    "tipo_marca_texto": row.tipo_marca_texto
                })
            logger.info(f"=== FIN get_marcas_hoy: {len(marcas)} de {total} marcas ===")
            return marcas, total
        except Exception as e:
            logger.error(f"=== ERROR en get_marcas_hoy ===")
            logger.error(f"Tipo de error: {type(e).__name__}")
            logger.error(f"Mensaje: {str(e)}")
            logger.error(f"Traceback completo:\n{traceback.format_exc()}")
            raise


