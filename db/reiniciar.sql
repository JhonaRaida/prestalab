-- BORRA las 4 bases de PrestaLab (y todos sus datos). Úsalo solo en desarrollo.
--     psql -U <usuario> -h localhost -d postgres -f reiniciar.sql
DROP DATABASE IF EXISTS usuarios_db WITH (FORCE);
DROP DATABASE IF EXISTS inventario_db WITH (FORCE);
DROP DATABASE IF EXISTS reservas_db WITH (FORCE);
DROP DATABASE IF EXISTS notificaciones_db WITH (FORCE);
