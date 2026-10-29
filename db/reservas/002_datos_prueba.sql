-- Datos de prueba de reservas_db (historial reciente + reservas futuras, fechas relativas a "hoy").
-- usuario_id referencia lógica a usuarios_db; recurso_id / laboratorio_id / encargado_id a inventario_db.
-- Las columnas de horario se calculan con date_trunc para que los datos siempre sean coherentes.
INSERT INTO reservas (usuario_id, recurso_id, laboratorio_id, encargado_id, inicio, fin, estado) VALUES
 (4, 1, 1, 2, date_trunc('day', now()) - interval '3 days' + interval '10 hours', date_trunc('day', now()) - interval '3 days' + interval '12 hours', 'finalizada'),  -- 1 devolución correcta
 (5, 4, 1, 2, date_trunc('day', now()) - interval '10 days' + interval '9 hours', date_trunc('day', now()) - interval '10 days' + interval '11 hours', 'finalizada'), -- 2 devolución tardía
 (3, 3, 1, 2, date_trunc('day', now()) - interval '2 days' + interval '14 hours', date_trunc('day', now()) - interval '2 days' + interval '16 hours', 'finalizada'),  -- 3 recurso dañado
 (7, 8, 2, 2, date_trunc('day', now()) - interval '1 day' + interval '8 hours',   date_trunc('day', now()) - interval '1 day' + interval '10 hours',  'finalizada'),  -- 4 devolución tardía (sanción vigente)
 (4, 2, 1, 2, date_trunc('day', now()) + interval '1 day' + interval '10 hours',  date_trunc('day', now()) + interval '1 day' + interval '11 hours',  'confirmada'),  -- 5 futura
 (5, 5, 1, 2, date_trunc('day', now()) + interval '2 days' + interval '12 hours', date_trunc('day', now()) + interval '2 days' + interval '14 hours', 'cancelada'),   -- 6 cancelada
 (3, 9, 2, 2, date_trunc('day', now()) + interval '3 days' + interval '9 hours',  date_trunc('day', now()) + interval '3 days' + interval '11 hours', 'confirmada');  -- 7 futura

INSERT INTO prestamos (reserva_id, entregado_por, fecha_entrega, recibido_por, fecha_devolucion, estado_devolucion, observaciones) VALUES
 (1, 2, date_trunc('day', now()) - interval '3 days' + interval '10 hours 2 minutes',  2, date_trunc('day', now()) - interval '3 days' + interval '11 hours 55 minutes',  'correcto',   'Entregada con cargador'),             -- 1
 (2, 2, date_trunc('day', now()) - interval '10 days' + interval '9 hours 5 minutes',  2, date_trunc('day', now()) - interval '10 days' + interval '12 hours 35 minutes', 'correcto',   'Devuelto 95 min después de la hora'), -- 2
 (3, 2, date_trunc('day', now()) - interval '2 days' + interval '14 hours 1 minute',   2, date_trunc('day', now()) - interval '2 days' + interval '15 hours 50 minutes',  'danado',     'Pantalla con rayones profundos'),     -- 3
 (4, 2, date_trunc('day', now()) - interval '1 day' + interval '8 hours 3 minutes',    2, date_trunc('day', now()) - interval '1 day' + interval '12 hours 20 minutes',   'incompleto', 'Faltó el cable de consola');          -- 4

INSERT INTO incidencias (prestamo_id, recurso_id, tipo, descripcion, estado) VALUES
 (2, 4, 'retraso',  'Devolución con 95 minutos de retraso.',      'cerrada'),   -- 1
 (3, 3, 'dano',     'Pantalla con rayones profundos',             'abierta'),   -- 2
 (4, 8, 'retraso',  'Devolución con 140 minutos de retraso.',     'abierta'),   -- 3
 (4, 8, 'faltante', 'Faltó el cable de consola',                  'abierta');   -- 4
