-- Datos de prueba de inventario_db.
-- encargado_id referencia lógica a usuarios_db: 2 = Cómputo y Redes, 6 = Electrónica.
INSERT INTO laboratorios (nombre, ubicacion, encargado_id) VALUES
 ('Laboratorio de Cómputo',    'Edificio A, planta baja', 2),   -- 1
 ('Laboratorio de Redes',      'Edificio A, planta alta', 2),   -- 2
 ('Laboratorio de Electrónica','Edificio B, planta baja', 6);   -- 3

INSERT INTO categorias (nombre, tipo) VALUES
 ('Laptops',               'equipo'),    -- 1
 ('Proyectores',           'equipo'),    -- 2
 ('Switches y routers',    'equipo'),    -- 3
 ('Osciloscopios',         'equipo'),    -- 4
 ('Aulas de práctica',     'espacio'),   -- 5
 ('Cubículos de estudio',  'espacio');   -- 6

INSERT INTO recursos (nombre, codigo_inventario, categoria_id, laboratorio_id, descripcion, estado) VALUES
 ('Laptop Dell 01',            'LAP-001', 1, 1, 'Laptop con 16 GB de RAM',                   'activo'),         -- 1
 ('Laptop Dell 02',            'LAP-002', 1, 1, 'Laptop con 16 GB de RAM',                   'activo'),         -- 2
 ('Laptop HP 03',              'LAP-003', 1, 1, 'Laptop con 8 GB de RAM (pantalla dañada)',  'mantenimiento'),  -- 3
 ('Proyector Epson 01',        'PRO-001', 2, 1, 'Proyector portátil 3500 lúmenes',           'activo'),         -- 4
 ('Aula de Cómputo 1',         'AUL-001', 5, 1, 'Aula con 25 equipos',                       'activo'),         -- 5
 ('Cubículo de estudio 1',     'CUB-001', 6, 1, 'Cubículo para 4 personas',                  'activo'),         -- 6
 ('Switch Cisco 2960',         'SWI-001', 3, 2, 'Switch administrable 24 puertos',           'activo'),         -- 7
 ('Router Cisco 1941',         'ROU-001', 3, 2, 'Router para prácticas de enrutamiento',     'activo'),         -- 8
 ('Aula de Redes',             'AUL-002', 5, 2, 'Aula con racks y estaciones',               'activo'),         -- 9
 ('Osciloscopio Tektronix 01', 'OSC-001', 4, 3, 'Osciloscopio de 100 MHz',                   'activo'),         -- 10
 ('Osciloscopio Tektronix 02', 'OSC-002', 4, 3, 'Osciloscopio de 100 MHz',                   'activo'),         -- 11
 ('Aula de Electrónica',       'AUL-003', 5, 3, 'Aula con 12 mesas de trabajo',              'activo');         -- 12
