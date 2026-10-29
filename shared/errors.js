// Errores de aplicación y formato de error único (E3): { error: { codigo, mensaje, detalles, ruta, fecha, idPeticion } }
class AppError extends Error {
  constructor(status, codigo, mensaje, detalles) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

const Errores = {
  validacion: (detalles) => new AppError(400, 'VALIDACION_FALLIDA', 'Los datos enviados no son válidos.', detalles),
  tokenInvalido: () => new AppError(401, 'TOKEN_INVALIDO', 'Falta el token de acceso o no es válido.'),
  credenciales: () => new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos.'),
  permiso: (m = 'Tu rol no permite realizar esta operación.') => new AppError(403, 'PERMISO_INSUFICIENTE', m),
  noEncontrado: (que = 'El recurso solicitado') => new AppError(404, 'NO_ENCONTRADO', `${que} no existe.`),
  conflicto: (codigo, mensaje) => new AppError(409, codigo, mensaje),
  regla: (codigo, mensaje) => new AppError(422, codigo, mensaje),
  servicioCaido: (nombre) => new AppError(503, 'SERVICIO_NO_DISPONIBLE', `El servicio de ${nombre} no está disponible. Intenta de nuevo en unos momentos.`),
};

function cuerpoError(req, status, codigo, mensaje, detalles) {
  const error = {
    codigo,
    mensaje,
    ruta: (req.originalUrl || req.url || '').split('?')[0],
    fecha: new Date().toISOString(),
    idPeticion: (req.headers && req.headers['x-request-id']) || null,
  };
  if (detalles && detalles.length) error.detalles = detalles;
  return { error };
}

function enviarError(req, res, status, codigo, mensaje, detalles) {
  res.status(status).json(cuerpoError(req, status, codigo, mensaje, detalles));
}

// Ruta inexistente
function rutaNoEncontrada(req, res) {
  enviarError(req, res, 404, 'NO_ENCONTRADO', 'La ruta solicitada no existe.');
}

// Manejador final: nunca revela detalles internos en los 500.
// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, next) {
  if (err instanceof AppError) return enviarError(req, res, err.status, err.codigo, err.message, err.detalles);
  if (err && err.type === 'entity.parse.failed') {
    return enviarError(req, res, 400, 'JSON_INVALIDO', 'El cuerpo de la petición no es JSON válido.');
  }
  if (err && err.type === 'entity.too.large') {
    return enviarError(req, res, 400, 'VALIDACION_FALLIDA', 'El cuerpo de la petición es demasiado grande.');
  }
  console.error(`[error] ${req.method} ${req.originalUrl} id=${req.headers['x-request-id']}:`, err);
  return enviarError(req, res, 500, 'ERROR_INTERNO', 'Ocurrió un error inesperado. Intenta de nuevo más tarde.');
}

module.exports = { AppError, Errores, enviarError, rutaNoEncontrada, manejadorErrores };
