-- Instalación desde cero con psql (sin Node ni Docker). Se puede ejecutar desde cualquier carpeta (usa rutas relativas al script):
--     cd db   (opcional)
--     psql -U <usuario_con_permiso_para_crear_bases> -h localhost -d postgres -f instalar.sql
-- Crea las 4 bases, las tablas, índices y restricciones, y carga los datos de prueba.
-- Si las bases ya existen, primero ejecuta:  psql ... -d postgres -f reiniciar.sql
\set ON_ERROR_STOP on

CREATE DATABASE usuarios_db;
CREATE DATABASE inventario_db;
CREATE DATABASE reservas_db;
CREATE DATABASE notificaciones_db;

\c usuarios_db
\ir usuarios/001_esquema.sql
\ir usuarios/002_datos_prueba.sql

\c inventario_db
\ir inventario/001_esquema.sql
\ir inventario/002_datos_prueba.sql

\c reservas_db
\ir reservas/001_esquema.sql
\ir reservas/002_datos_prueba.sql

\c notificaciones_db
\ir notificaciones/001_esquema.sql
\ir notificaciones/002_datos_prueba.sql

\c postgres
\echo 'PrestaLab: las 4 bases se crearon y se cargaron los datos de prueba.'
