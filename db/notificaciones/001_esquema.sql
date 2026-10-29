-- notificaciones_db: Notificaciones
CREATE TABLE IF NOT EXISTS notificaciones (
  id           SERIAL PRIMARY KEY,
  usuario_id   INTEGER NOT NULL,                    -- referencia lógica a usuarios_db
  tipo         VARCHAR(15) NOT NULL CHECK (tipo IN ('confirmacion','recordatorio','retraso')),
  mensaje      VARCHAR(500) NOT NULL,
  leida        BOOLEAN NOT NULL DEFAULT false,
  estado_envio VARCHAR(10) NOT NULL DEFAULT 'pendiente' CHECK (estado_envio IN ('pendiente','enviada','fallida')),
  creada_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_usuario ON notificaciones(usuario_id, leida);
