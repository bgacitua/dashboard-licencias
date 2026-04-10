Recomendaciones adicionales (sin implementar)
La arquitectura de la BD pronto cambiará de SQL Server -> MySQL o Postgree SQL. 
Realizar optimizaciones en ese punto

´´´
main.py – arranque
´´´
Base.metadata.create_all(bind=engine) en cada arranque puede ser lento si hay muchas tablas. Si el esquema ya está en la BD, puedes ejecutarlo solo en entornos de desarrollo o detrás de un flag.

Queries pesadas (marcas, finiquitos)
´´´
En marcas_repository.get_marcas y en los CTE de finiquitos_repository (p. ej. get_item_by_rut / get_descuentos_by_rut), si las tablas crecen, conviene:
´´´
Índices en columnas de filtro y JOIN (fechas, rut, LOGDATETIME, etc.).
Revisar en SQL Server que los planes no hagan full scan en tablas grandes.

´´´
Llamadas a BUK
´´´
En finiquitos_service, get_vacaciones_disponibles, get_sueldo_base, get_descuentos_by_rut_finiquito y sobre todo get_salary_history (varias páginas) pueden dominar el tiempo de respuesta. Valorar:

´´´
Timeouts algo más bajos donde sea aceptable.
´´´
Cache de corta duración (p. ej. por RUT) para datos que cambien poco.
get_all_incidencias() en envío de alertas
Se cargan todas las incidencias para armar los correos. Si la tabla crece, podría limitarse a los RUTs de las alertas del envío (una query con WHERE rut_empleado IN (...)).

´´´
Nivel de log en producción
´´´
En logging_config.py el nivel está en INFO. En producción suele ser mejor WARNING o ERROR para reducir ruido y coste de I/O.

Si quieres, puedo proponerte los cambios concretos (parches o código) para los tres bugs de licencias y finiquitos (implementar get_all, get_licencia y get_items_cinco_meses o eliminar los endpoints).