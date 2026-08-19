# Diseño: evolución jerárquica de headcount Chile

## Objetivo

Entregar una consulta Snowflake que, para un RUT raíz, calcule la dotación que depende de esa persona de manera directa e indirecta y muestre la evolución anual de 2020 a 2026. El resultado debe conservar los totales de cada gerencia y el desglose de sus subgerencias.

## Fuente y alcance

La única fuente del resultado será `CURATED.API_BUK_CHILE.HEADCOUNT`. Sus filas son snapshots por período y aportan el RUT, nombre completo, nombre del jefe, gerencia y subgerencia. Las tablas de landing se usaron solamente para comprender el origen de `BOSS_NAME`; no participarán en el cálculo.

## Diseño de datos

1. Se selecciona el último snapshot disponible de cada año entre 2020 y 2026. Así cada año representa la dotación de cierre disponible y no suma personas repetidas entre meses.
2. Dentro de cada snapshot se normalizan `FULL_NAME` y `BOSS_NAME` (mayúsculas, espacios reducidos y valores nulos tratados explícitamente).
3. Se crea un mapa de jefe por nombre solamente cuando ese nombre identifica un único RUT en el snapshot. Los nombres duplicados se excluyen del enlace para impedir una asignación errónea.
4. Un CTE recursivo parte en el RUT solicitado y encuentra subordinados cuyo `RUT_BOSS` derivado coincide con el RUT ya descubierto. Un arreglo de RUT recorridos evita ciclos de datos.
5. Se agregan los integrantes encontrados por año, gerencia y subgerencia. La salida incluye nivel de detalle, total por subgerencia, total por gerencia y total general bajo el RUT raíz.

## Consideraciones y límites

- El RUT raíz se incluye como nivel 0, pero no se contabiliza en la dotación dependiente. Si se desea incluirlo, se puede cambiar el filtro final.
- La asociación por nombre solo es confiable si no hay homónimos. La consulta expondrá una sección de validación para revisar los jefes ambiguos; estos no participan en la recursión.
- Si se incorpora `RUT_BOSS` histórico en la capa curada, deberá reemplazarse el mapa por nombre. La parte recursiva y las agregaciones se mantienen.
- Para un año sin snapshots el resultado no tendrá fila; la versión SQL generará el calendario 2020–2026 para devolver cero cuando corresponda.

## Validación

- Ejecutar la sección de ambigüedades y revisar que no afecte a jefaturas esperadas.
- Probar con un RUT cuyo equipo sea conocido y contrastar el total directo con BUK.
- Revisar una muestra de subordinados indirectos y confirmar que cada relación corresponde al mismo `PERIODO_FIN`.
- Verificar que cada persona se cuente una vez por año, aun cuando pertenezca a una subgerencia.
