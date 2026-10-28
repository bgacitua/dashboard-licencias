# Plan — Compensaciones: niveles HAY internos

Fecha: 2026-10-19 · Rama: `modulo_compensaciones` · Fuente: `Calculadora.xlsx` (hoja `niveles` + tablas ocultas)

## Alcance

Llevar la calculadora HAY del Excel al módulo. Cada cargo de la empresa (`compensaciones.cargo_empresa.id`) se evalúa con
11 factores y obtiene puntos y grado HAY (8–27). El grado se ve junto a la homologación Mercer en la lista de cargos.

**Fuera de alcance:** sugerir el nivel Mercer a partir del grado (los datos muestran correlación, queda para después) y
editar las tablas de referencia desde la UI.

## Decisiones (2026-10-19)

1. **El cálculo vive en Python** (`service.py`), con las tablas de referencia en BD. La evaluación guarda las entradas y un
   **snapshot** de los resultados: si se edita una tabla, el historial no cambia.
2. **Historial:** la vigente es la última por `cargo_empresa_id`, el mismo patrón que la homologación.
3. **Carga inicial con ID:** Gabriel agrega al Excel las columnas `pais` e `id_buk` (= `cargo_empresa.id_origen`) en
   `niveles` y en `Calculadora HAY - Perú`. El script resuelve `cargo_empresa.id` por `(pais, id_origen)`, sin cruzar por nombre.
4. **La fila H+ de Responsabilidad se carga corregida** según la progresión HAY:

   | Clave | Excel | Se carga |
   |---|---|---|
   | H+·N·IV | 400 | 460 |
   | H+·1·S | 400 | 460 |
   | H+·1·P | 528 | 608 |

5. **Solo `admin` guarda evaluaciones** (igual que la homologación). Calcular no escribe.
6. **Prefijo `hay_`** para no chocar con `compensaciones.nivel` (niveles Mercer).

## Cómo calcula el Excel (verificado: las 244 filas de `niveles` cuadran)

1. **Know-How:** técnica (A–H) + signo, gestión (T, I–IV) + signo y RRHH (1–3) → `hay_know_how` → `puntos_kh`.
2. **Solución de problemas:** marco (A–H) + complejidad (1–5) + signo → `hay_sp_porcentaje` → % ;
   (%, `puntos_kh`) → `hay_sp_puntos` → `puntos_sp`.
3. **Responsabilidad:** libertad (A–H) + signo, magnitud (N, 1–4) e impacto (I–VI si magnitud = N; R/C/S/P si no) →
   `hay_responsabilidad` → `puntos_resp`.
4. **Total** = kh + sp + resp → `hay_grado` (rango min–max) → `grado`. Si el total queda fuera de 98–3.020: sin grado (error).

Una combinación que no está en la tabla es inválida y el error indica el factor ("Know-How: combinación no válida").
En KH hay 464 combinaciones válidas de 1.080: A–C solo T/I, D–E hasta II y F–H sin T.

## Migración `035_compensaciones_hay.sql` (idempotente)

Signo = `text NOT NULL DEFAULT ''` (`'-'`, `''`, `'+'`), para que pueda ir en la PK.

```sql
hay_know_how       (tecnica, signo_tecnica, gestion, signo_gestion, rrhh smallint, puntos int)  PK 5 cols   -- 464
hay_sp_porcentaje  (marco, complejidad smallint, signo, porcentaje smallint)                    PK 3 cols   -- 80
hay_sp_puntos      (porcentaje smallint, puntos_kh int, puntos int)                             PK 2 cols   -- 432
hay_responsabilidad(libertad, signo, magnitud, impacto, puntos int)                             PK 4 cols   -- 528
hay_grado          (grado smallint PK, puntos_min int, puntos_max int)                                      -- 20

hay_evaluacion (
  id serial PK, cargo_empresa_id int NOT NULL REFERENCES compensaciones.cargo_empresa,
  tecnica, signo_tecnica, gestion, signo_gestion, rrhh,
  marco, complejidad, signo_complejidad,
  libertad, signo_libertad, magnitud, impacto,
  puntos_kh, porcentaje_sp, puntos_sp, puntos_resp, puntos_total, grado,   -- snapshot
  comentario text, origen text NOT NULL DEFAULT 'ui',                       -- 'excel' | 'ui'
  creado_por text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
)
INDEX (cargo_empresa_id, created_at DESC)

VIEW v_hay_vigente: DISTINCT ON (cargo_empresa_id) ... ORDER BY cargo_empresa_id, created_at DESC, id DESC
```

La migración trae solo el DDL (= `schema_hay.sql` de la carpeta de carga). Las 5 tablas de referencia las llena
`carga_hay.py referencias` desde el Excel: solo el bloque I:N de `KH_Tabla` (el bloque A:G es antiguo y no lo usa ninguna fórmula).
**Mismos grados y tablas para CL, PE y BR** (confirmado 2026-10-19): las tablas no tienen país.

## Backend

| Archivo | Cambio |
|---|---|
| `repository.py` | `hay_tablas()` (las 5 tablas), `guardar_hay()`, `hay_historial(cargo_empresa_id)`; `cargos_empresa()` suma `grado`/`puntos_total` de `v_hay_vigente` |
| `service.py` | `calcular_hay(entradas, tablas)`: función pura (testeable sin BD), con un error por factor. Las tablas se cachean en memoria |
| `schemas.py` | `HayEntradas`, `HayResultado` (puntos por factor, %, total, grado), `HayEvaluacion` |
| `router.py` | `GET /hay/opciones` (combinaciones válidas para los selectores) · `POST /hay/calcular` (no escribe) · `POST /hay/evaluacion` (admin; recalcula en el servidor, no confía en el cliente) · `GET /hay/evaluacion?cargo_empresa_id=` (historial) |
| `tests/test_compensaciones.py` | Casos del Excel: Evaluador Sensorial Creativo = 208 / 12 · Subgerente de Ventas = 480 / 17 · Gerente General (hoja 2) = 1.358 / 23 · combinación inválida · total fuera de rango |

## Frontend

- `CargosEmpresa.jsx`: columna "Grado HAY" (con los puntos en el tooltip).
- `components/EvaluacionHay.jsx` (nuevo): 3 bloques de factores con selectores en cascada filtrados por `/hay/opciones`,
  recálculo en vivo con `/hay/calcular`, `Guía_Referencia` como ayuda y botón "Guardar evaluación" solo para admin.
  Muestra el historial del cargo.

## Carga inicial (`carga_hay.py` en `modulo compensaciones - up`, como `carga_compensaciones.py`)

Comandos: `schema` · `probar` (sin BD, recalcula `niveles` contra el Excel) · `referencias` · `evaluaciones [--aplicar]`.

1. Lee `niveles` (solo Chile por ahora; columnas `id_buk` = `cargo_empresa.id_origen` y `pais`). La hoja Perú no se carga.
2. Resuelve `cargo_empresa.id` por `(pais, id_origen)` y exige que el nombre del Excel sea el del cargo BUK (sin tildes ni
   mayúsculas); si no, la fila no se carga y el reporte sugiere el id por nombre. Sin `--aplicar` solo deja `reporte_carga_hay.csv`.
3. Para los IDs repetidos en el Excel (hoy hay nombres repetidos), si todas las filas tienen los mismos factores carga una
   sola. Si los factores difieren, lo informa y no carga ninguna: hoy son *Coordinador Comercial Exportaciones*,
   *Líder Aplicaciones Sabores* y *Encargado De Evaluación Sensorial*.
4. Recalcula con `calcular_hay` (no copia los puntos del Excel) e inserta con `origen='excel'`, `creado_por='carga_excel'`.
   Informa las filas donde el resultado no coincide con el Excel (las que usan los valores H+ corregidos).
5. Columna T (código Mercer): solo se reporta. No se crean homologaciones automáticas.

## Pendientes

- Corregir la fórmula de `id_buk` en `niveles` (hoy es circular: `VLOOKUP(A2, …)` sobre su propia columna).
- Hoja Perú: "SB PROM" = 10× "SB MIN" (error de digitación; no se carga, es solo referencia).
- Fase siguiente: tabla `hay_grado_nivel` (grado → nivel Mercer sugerido) para preseleccionar el nivel en el match.
