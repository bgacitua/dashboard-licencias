-- El formulario ya no captura domingo: las actividades de domingo se informan por correo.
-- IRREVERSIBLE: se pierden los domingos ya registrados. Respaldar antes si interesan:
--   CREATE TABLE app.overtime_selections_bkp AS SELECT * FROM app.overtime_selections;
--
-- Aplicar DESPUÉS de desplegar el código que dejó de usar la columna.

ALTER TABLE app.overtime_selections DROP COLUMN IF EXISTS domingo;
