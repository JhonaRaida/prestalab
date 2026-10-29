-- inventario_db: Inventario
CREATE TABLE IF NOT EXISTS laboratorios (
  id           SERIAL PRIMARY KEY,
  nombre       VARCHAR(120) NOT NULL UNIQUE,
  ubicacion    VARCHAR(160) NOT NULL,
  encargado_id INTEGER                              -- referencia lógica a usuarios_db
);

CREATE TABLE IF NOT EXISTS categorias (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(80) NOT NULL UNIQUE,
  tipo    VARCHAR(10) NOT NULL CHECK (tipo IN ('equipo','espacio'))
);

CREATE TABLE IF NOT EXISTS recursos (
  id                SERIAL PRIMARY KEY,
  nombre            VARCHAR(120) NOT NULL,
  codigo_inventario VARCHAR(40)  NOT NULL UNIQUE,
  categoria_id      INTEGER NOT NULL REFERENCES categorias(id),
  laboratorio_id    INTEGER NOT NULL REFERENCES laboratorios(id),
  descripcion       VARCHAR(500),
  estado            VARCHAR(15) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','mantenimiento','baja')),
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recursos_lab ON recursos(laboratorio_id);
CREATE INDEX IF NOT EXISTS idx_recursos_cat ON recursos(categoria_id);
