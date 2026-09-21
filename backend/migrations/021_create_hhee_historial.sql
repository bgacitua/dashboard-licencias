-- =============================================================
-- Migración 021: historial de aprobación de HHEE persistido
--
-- El reporte de "HHEE Aprobadas" salía a Buk en vivo, con un request por
-- registro del listado, en cada consulta. Ahora el scraper (repo
-- hhee-scrapping-buk) persiste acá lo que baja y solo vuelve a pedirle a Buk
-- el detalle de los registros que cambiaron; la plataforma lee esta tabla.
--
-- El scraper crea estas mismas tablas al arrancar (CREATE TABLE IF NOT EXISTS
-- en hhee/historial_db.py), igual que con app.hhee_alertas. Esta migración
-- existe para poder crearlas ANTES del deploy: la plataforma las lee, y si el
-- scraper nuevo todavía no arrancó, el reporte falla por tabla inexistente.
-- Correr las dos veces es inocuo.
--
-- Aplicar: psql -d rh_cramer -f backend/migrations/021_create_hhee_historial.sql
-- =============================================================

-- Una fila por cambio de estado. En Buk el historial es append-only, así que la
-- clave no colisiona salvo con la misma fila; la meta que viene del listado
-- (estado actual, horas aprobadas) sí se refresca en el upsert.
CREATE TABLE IF NOT EXISTS app.hhee_historial (
    registro_tiempo_id     TEXT NOT NULL,
    version                TEXT NOT NULL,
    fecha                  TEXT NOT NULL,
    estado_registro_tiempo TEXT NOT NULL,
    recinto                TEXT NOT NULL,
    usuario                TEXT,
    origen                 TEXT,
    rut                    TEXT,
    nombre_trab            TEXT,
    nombre_estado          TEXT,
    inicio_periodo         TEXT,          -- dd/mm/yyyy, tal cual lo da ctrlit
    fin_periodo            TEXT,
    dia                    DATE,          -- inicio_periodo parseado: por acá se filtra
    nombre_hhee            TEXT,
    hora                   TEXT,
    hhee_aprobadas         TEXT,          -- 'HH:MM:SS'
    hhee_aprobadas_num     NUMERIC(8,3),  -- lo mismo en horas decimales
    valor                  TEXT,
    tipo_registro_tiempo   TEXT,
    visto_en               TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (registro_tiempo_id, version, fecha, estado_registro_tiempo)
);

-- El filtro de la pantalla es siempre (recinto, rango de días).
CREATE INDEX IF NOT EXISTS hhee_historial_dia_idx ON app.hhee_historial (recinto, dia);
CREATE INDEX IF NOT EXISTS hhee_historial_rut_idx ON app.hhee_historial (rut);

-- Una fila por registro, con la huella de su meta en el listado. Es la señal de
-- "este registro no cambió desde la última corrida": el listado es barato, así
-- que comparar huellas cuesta una sola consulta paginada en vez de un request
-- por registro. La plataforma no la lee; la usa solo el scraper.
CREATE TABLE IF NOT EXISTS app.hhee_registro_visto (
    registro_tiempo_id TEXT PRIMARY KEY,
    recinto            TEXT NOT NULL,
    huella             TEXT NOT NULL,
    dia                DATE,
    actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hhee_registro_visto_dia_idx ON app.hhee_registro_visto (recinto, dia);
