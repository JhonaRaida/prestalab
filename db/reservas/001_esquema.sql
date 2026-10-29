-- reservas_db: Reservas y Préstamos
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS reservas (
  id                   SERIAL PRIMARY KEY,
  usuario_id           INTEGER NOT NULL,            -- referencia lógica a usuarios_db
  recurso_id           INTEGER NOT NULL,            -- referencia lógica a inventario_db
  laboratorio_id       INTEGER NOT NULL,
  encargado_id         INTEGER,                     -- encargado del laboratorio al momento de reservar
  inicio               TIMESTAMPTZ NOT NULL,
  fin                  TIMESTAMPTZ NOT NULL,
  estado               VARCHAR(12) NOT NULL DEFAULT 'confirmada'
                       CHECK (estado IN ('confirmada','cancelada','en_curso','finalizada')),
  creada_en            TIMESTAMPTZ NOT NULL DEFAULT now(),
  recordatorio_enviado BOOLEAN NOT NULL DEFAULT false,
  retraso_avisado      BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT reservas_fin_posterior_inicio CHECK (fin > inicio),
  -- RNF integridad: la propia BD impide dos reservas vigentes del mismo recurso que se traslapen
  CONSTRAINT reservas_sin_traslape
    EXCLUDE USING gist (recurso_id WITH =, tstzrange(inicio, fin) WITH &&)
    WHERE (estado IN ('confirmada','en_curso'))
);
CREATE INDEX IF NOT EXISTS idx_reservas_usuario ON reservas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_reservas_lab ON reservas(laboratorio_id, inicio);

CREATE TABLE IF NOT EXISTS prestamos (
  id                SERIAL PRIMARY KEY,
  reserva_id        INTEGER NOT NULL UNIQUE REFERENCES reservas(id),
  entregado_por     INTEGER NOT NULL,
  fecha_entrega     TIMESTAMPTZ NOT NULL DEFAULT now(),
  recibido_por      INTEGER,
  fecha_devolucion  TIMESTAMPTZ,
  estado_devolucion VARCHAR(12) CHECK (estado_devolucion IN ('correcto','danado','incompleto')),
  observaciones     VARCHAR(500)
);

CREATE TABLE IF NOT EXISTS incidencias (
  id          SERIAL PRIMARY KEY,
  prestamo_id INTEGER NOT NULL REFERENCES prestamos(id),
  recurso_id  INTEGER NOT NULL,
  tipo        VARCHAR(10) NOT NULL CHECK (tipo IN ('dano','faltante','retraso')),
  descripcion VARCHAR(500) NOT NULL,
  estado      VARCHAR(10) NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada')),
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incidencias_prestamo ON incidencias(prestamo_id);
