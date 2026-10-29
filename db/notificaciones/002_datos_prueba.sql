-- Datos de prueba de notificaciones_db (usuario_id referencia lógica a usuarios_db).
INSERT INTO notificaciones (usuario_id, tipo, mensaje, leida, estado_envio, creada_en) VALUES
 (4, 'confirmacion', 'Tu reserva #5 de "Laptop Dell 02" quedó confirmada.',                           false, 'enviada', now() - interval '1 hour'),     -- 1
 (3, 'confirmacion', 'Tu reserva #7 de "Aula de Redes" quedó confirmada.',                            true,  'enviada', now() - interval '3 hours'),    -- 2
 (5, 'retraso',      'Devolviste con 95 minutos de retraso. Tu cuenta quedó bloqueada 3 días.',       true,  'enviada', now() - interval '9 days'),     -- 3
 (7, 'retraso',      'Devolviste con 140 minutos de retraso. Tu cuenta queda bloqueada 3 días.',      false, 'enviada', now() - interval '1 day'),      -- 4
 (4, 'recordatorio', 'Recordatorio: tu reserva #5 empieza mañana a las 10:00.',                       false, 'pendiente', now() - interval '10 minutes'); -- 5
