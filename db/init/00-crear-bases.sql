-- Lo ejecuta la imagen de PostgreSQL solo la primera vez que crea el volumen.
-- Una sola instancia, una base por servicio (cada servicio solo accede a la suya).
CREATE DATABASE usuarios_db;
CREATE DATABASE inventario_db;
CREATE DATABASE reservas_db;
CREATE DATABASE notificaciones_db;
