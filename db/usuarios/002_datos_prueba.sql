-- Datos de prueba de usuarios_db. Contraseña de TODAS las cuentas de demostración: Prestalab123
-- (se guarda el hash bcrypt, nunca la contraseña). NO usar estas cuentas en producción.
-- Los ids 1..7 se asignan en este orden; otros scripts de prueba los referencian.
INSERT INTO usuarios (nombre, correo, matricula, contrasena, rol, estado) VALUES
 ('Ana Administradora',            'admin@prestalab.mx',      'ADM001',  '$2b$10$IzanUfa7EnmHHO7MJG13z.1s18fi0uOx7fDkMprU/cPqRysUJCVCW', 'administrador', 'activo'),   -- 1
 ('Elena Encargada Cómputo',       'encargado1@prestalab.mx', 'ENC001',  '$2b$10$IzanUfa7EnmHHO7MJG13z.1s18fi0uOx7fDkMprU/cPqRysUJCVCW', 'encargado',     'activo'),   -- 2
 ('Daniel Docente',                'docente@prestalab.mx',    'DOC001',  '$2b$10$IzanUfa7EnmHHO7MJG13z.1s18fi0uOx7fDkMprU/cPqRysUJCVCW', 'docente',       'activo'),   -- 3
 ('Alberto Alumno',                'alumno1@prestalab.mx',    '0230001', '$2b$10$IzanUfa7EnmHHO7MJG13z.1s18fi0uOx7fDkMprU/cPqRysUJCVCW', 'alumno',        'activo'),   -- 4
 ('Alicia Alumna',                 'alumno2@prestalab.mx',    '0230002', '$2b$10$IzanUfa7EnmHHO7MJG13z.1s18fi0uOx7fDkMprU/cPqRysUJCVCW', 'alumno',        'activo'),   -- 5
 ('Eduardo Encargado Electrónica', 'encargado2@prestalab.mx', 'ENC002',  '$2b$10$IzanUfa7EnmHHO7MJG13z.1s18fi0uOx7fDkMprU/cPqRysUJCVCW', 'encargado',     'activo'),   -- 6
 ('Andrés Alumno Sancionado',      'alumno3@prestalab.mx',    '0230003', '$2b$10$IzanUfa7EnmHHO7MJG13z.1s18fi0uOx7fDkMprU/cPqRysUJCVCW', 'alumno',        'activo');   -- 7

-- Sanción vencida de la alumna 5 (retraso del préstamo 2) y sanción VIGENTE del alumno 7 (retraso del préstamo 4)
INSERT INTO sanciones (usuario_id, motivo, inicio, fin, prestamo_id) VALUES
 (5, 'Retraso de 95 minutos en la devolución del préstamo #2', now() - interval '9 days',  now() - interval '6 days', 2),
 (7, 'Retraso de 140 minutos en la devolución del préstamo #4', now() - interval '1 day',   now() + interval '2 days', 4);
