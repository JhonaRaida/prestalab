-- Consultas básicas de verificación y pruebas de restricciones (Entrega 4).
-- Ejecutar DESPUÉS de instalar.sql:
--     psql -U <usuario> -h localhost -d postgres -f verificar.sql
-- Las pruebas de restricciones se ejecutan dentro de una transacción que se revierte (no dejan datos).
\set ON_ERROR_STOP off
\pset border 1
\pset null '(nulo)'

\echo
\echo '=================== A. CONTEO DE REGISTROS POR TABLA ==================='
\c usuarios_db
SELECT 'usuarios_db' AS base, 'roles' AS tabla, count(*) AS registros FROM roles
UNION ALL SELECT 'usuarios_db', 'usuarios', count(*) FROM usuarios
UNION ALL SELECT 'usuarios_db', 'sanciones', count(*) FROM sanciones;
\c inventario_db
SELECT 'inventario_db' AS base, 'laboratorios' AS tabla, count(*) AS registros FROM laboratorios
UNION ALL SELECT 'inventario_db', 'categorias', count(*) FROM categorias
UNION ALL SELECT 'inventario_db', 'recursos', count(*) FROM recursos;
\c reservas_db
SELECT 'reservas_db' AS base, 'reservas' AS tabla, count(*) AS registros FROM reservas
UNION ALL SELECT 'reservas_db', 'prestamos', count(*) FROM prestamos
UNION ALL SELECT 'reservas_db', 'incidencias', count(*) FROM incidencias;
\c notificaciones_db
SELECT 'notificaciones_db' AS base, 'notificaciones' AS tabla, count(*) AS registros FROM notificaciones;

\echo
\echo '=================== B. CONSULTAS BÁSICAS (JOIN dentro de cada base) ==================='
\echo '--- B1. Usuarios por rol (usuarios_db: usuarios + roles)'
\c usuarios_db
SELECT r.codigo AS rol, count(u.id) AS usuarios FROM roles r LEFT JOIN usuarios u ON u.rol = r.codigo GROUP BY r.codigo ORDER BY r.codigo;
\echo '--- B2. Sanciones vigentes (usuarios_db: sanciones + usuarios)'
SELECT u.id AS usuario, u.correo, left(s.motivo, 40) AS motivo, to_char(s.fin, 'YYYY-MM-DD HH24:MI') AS fin FROM sanciones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.fin > now();
\echo '--- B3. Recursos con su laboratorio y categoría (inventario_db)'
\c inventario_db
SELECT r.id, r.codigo_inventario AS codigo, r.nombre, c.nombre AS categoria, l.nombre AS laboratorio, r.estado
  FROM recursos r JOIN categorias c ON c.id = r.categoria_id JOIN laboratorios l ON l.id = r.laboratorio_id ORDER BY r.id;
\echo '--- B4. Préstamos con su reserva, minutos de retraso e incidencias (reservas_db)'
\c reservas_db
SELECT p.id AS prestamo, r.id AS reserva, r.recurso_id AS recurso, r.estado AS estado_res, p.estado_devolucion AS devolucion,
       GREATEST(0, round(extract(epoch FROM (p.fecha_devolucion - r.fin)) / 60))::int AS min_retraso,
       (SELECT count(*) FROM incidencias i WHERE i.prestamo_id = p.id) AS incidencias
  FROM prestamos p JOIN reservas r ON r.id = p.reserva_id ORDER BY p.id;
\echo '--- B5. Recursos ocupados mañana de 10:00 a 11:00 (consulta que usa /disponibilidad)'
SELECT DISTINCT recurso_id FROM reservas
 WHERE estado IN ('confirmada','en_curso')
   AND inicio < date_trunc('day', now()) + interval '1 day 11 hours' AND fin > date_trunc('day', now()) + interval '1 day 10 hours';
\echo '--- B6. Notificaciones no leídas por usuario (notificaciones_db)'
\c notificaciones_db
SELECT usuario_id, count(*) AS sin_leer FROM notificaciones WHERE NOT leida GROUP BY usuario_id ORDER BY usuario_id;

\echo
\echo '=================== C. PRUEBAS DE RESTRICCIONES (cada una debe ser RECHAZADA, salvo C2) ==================='
\c reservas_db
\echo '--- C1. EXCLUDE: reservar el recurso 2 traslapado con la reserva 5 (mañana 10:30-11:30) -> debe fallar'
BEGIN;
INSERT INTO reservas (usuario_id, recurso_id, laboratorio_id, encargado_id, inicio, fin)
VALUES (5, 2, 1, 2, date_trunc('day', now()) + interval '1 day 10 hours 30 minutes', date_trunc('day', now()) + interval '1 day 11 hours 30 minutes');
ROLLBACK;
\echo '--- C2. EXCLUDE: reservar el recurso 2 justo DESPUÉS (11:00-12:00) -> debe PERMITIRSE'
BEGIN;
INSERT INTO reservas (usuario_id, recurso_id, laboratorio_id, encargado_id, inicio, fin)
VALUES (5, 2, 1, 2, date_trunc('day', now()) + interval '1 day 11 hours', date_trunc('day', now()) + interval '1 day 12 hours');
ROLLBACK;
\echo '--- C3. FOREIGN KEY: préstamo de una reserva inexistente -> debe fallar'
BEGIN;
INSERT INTO prestamos (reserva_id, entregado_por) VALUES (9999, 2);
ROLLBACK;
\echo '--- C4. UNIQUE: segundo préstamo para la reserva 1 -> debe fallar'
BEGIN;
INSERT INTO prestamos (reserva_id, entregado_por) VALUES (1, 2);
ROLLBACK;
\echo '--- C5. CHECK: reserva con fin anterior al inicio -> debe fallar'
BEGIN;
INSERT INTO reservas (usuario_id, recurso_id, laboratorio_id, inicio, fin)
VALUES (4, 6, 1, now() + interval '5 days', now() + interval '4 days');
ROLLBACK;
\echo '--- C6. CHECK: tipo de incidencia inválido -> debe fallar'
BEGIN;
INSERT INTO incidencias (prestamo_id, recurso_id, tipo, descripcion) VALUES (1, 1, 'robo', 'x');
ROLLBACK;
\c usuarios_db
\echo '--- C7. UNIQUE: correo repetido -> debe fallar'
BEGIN;
INSERT INTO usuarios (nombre, correo, matricula, contrasena) VALUES ('Duplicado', 'admin@prestalab.mx', '1', 'x');
ROLLBACK;
\echo '--- C8. FOREIGN KEY: rol que no existe en el catálogo -> debe fallar'
BEGIN;
INSERT INTO usuarios (nombre, correo, matricula, contrasena, rol) VALUES ('Intruso', 'intruso@prestalab.mx', '1', 'x', 'superadmin');
ROLLBACK;
\echo '--- C9. NOT NULL: usuario sin nombre -> debe fallar'
BEGIN;
INSERT INTO usuarios (correo, matricula, contrasena) VALUES ('sinnombre@prestalab.mx', '1', 'x');
ROLLBACK;
\c inventario_db
\echo '--- C10. UNIQUE: código de inventario repetido -> debe fallar'
BEGIN;
INSERT INTO recursos (nombre, codigo_inventario, categoria_id, laboratorio_id) VALUES ('Clon', 'LAP-001', 1, 1);
ROLLBACK;
\echo '--- C11. CHECK: estado de recurso inválido -> debe fallar'
BEGIN;
UPDATE recursos SET estado = 'roto' WHERE id = 1;
ROLLBACK;
\echo '--- C12. FOREIGN KEY: recurso con categoría inexistente -> debe fallar'
BEGIN;
INSERT INTO recursos (nombre, codigo_inventario, categoria_id, laboratorio_id) VALUES ('Huérfano', 'HUE-001', 999, 1);
ROLLBACK;
\c postgres
\echo
\echo 'Verificación terminada: la BD quedó intacta (todas las pruebas se revirtieron).'
