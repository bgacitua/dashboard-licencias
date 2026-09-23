-- Esquemas que usan los modelos del backend. Las tablas las crea create_all
-- al arrancar, en UNA transacción: si falta un esquema cualquiera no se crea
-- ninguna tabla, tampoco las de tickets.*, que es lo que se prueba.
-- Las tablas sin esquema van a `rh` por el search_path de la conexión.
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS rh;
CREATE SCHEMA IF NOT EXISTS calculadora;
CREATE SCHEMA IF NOT EXISTS tickets;
