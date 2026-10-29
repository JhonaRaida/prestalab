-- usuarios_db: Usuarios y Autenticación
-- Catálogo de roles (entidad Rol de la Entrega 2). Los cuatro roles son fijos.
CREATE TABLE IF NOT EXISTS roles (
  codigo       VARCHAR(15) PRIMARY KEY,
  descripcion  VARCHAR(160) NOT NULL
);
INSERT INTO roles (codigo, descripcion) VALUES
  ('alumno',        'Estudiante que reserva equipo y espacios (máximo 2 reservas vigentes)'),
  ('docente',       'Profesor que reserva equipo y espacios (máximo 5 reservas vigentes)'),
  ('encargado',     'Responsable de uno o más laboratorios: entrega, recibe y reporta incidencias'),
  ('administrador', 'Gestiona usuarios, roles, laboratorios y categorías')
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS usuarios (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(120) NOT NULL,
  correo      VARCHAR(160) NOT NULL UNIQUE,
  matricula   VARCHAR(20),
  contrasena  VARCHAR(100) NOT NULL,               -- hash bcrypt, nunca texto plano
  rol         VARCHAR(15)  NOT NULL DEFAULT 'alumno' REFERENCES roles(codigo),
  estado      VARCHAR(10)  NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','bloqueado')),
  creado_en   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(rol);

CREATE TABLE IF NOT EXISTS sanciones (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  motivo      VARCHAR(255) NOT NULL,
  inicio      TIMESTAMPTZ NOT NULL DEFAULT now(),
  fin         TIMESTAMPTZ NOT NULL,
  prestamo_id INTEGER,                              -- referencia lógica a reservas_db (sin FK entre bases)
  CONSTRAINT sanciones_fin_posterior_inicio CHECK (fin > inicio)
);
CREATE INDEX IF NOT EXISTS idx_sanciones_usuario ON sanciones(usuario_id, fin);
