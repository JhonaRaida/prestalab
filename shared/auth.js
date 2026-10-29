// JWT (lo emite Usuarios, lo valida el Gateway) e identidad que el Gateway reenvía a los servicios.
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('./config');
const { Errores } = require('./errors');

const firmar = (usuario) =>
  jwt.sign({ rol: usuario.rol }, config.jwtSecreto, { subject: String(usuario.id), expiresIn: config.jwtExpiraSegundos, algorithm: 'HS256' });

function verificar(token) {
  try {
    const p = jwt.verify(token, config.jwtSecreto, { algorithms: ['HS256'] });
    return { id: Number(p.sub), rol: p.rol };
  } catch (_) { throw Errores.tokenInvalido(); }
}

function igualesSeguro(a, b) {
  const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Solo el Gateway u otro servicio (con el token interno) pueden llamar a un servicio.
function exigirServicio(req, res, next) {
  if (!igualesSeguro(req.headers['x-service-token'], config.tokenServicio)) return next(Errores.tokenInvalido());
  next();
}

// Identidad que el Gateway puso en los encabezados (nunca se toma del cliente).
function identidad(req) {
  const id = Number(req.headers['x-user-id']);
  const rol = req.headers['x-user-rol'];
  if (!id || !rol) throw Errores.tokenInvalido();
  return { id, rol };
}

const exigirRol = (...roles) => (req, res, next) => {
  try {
    req.usuario = identidad(req);
    if (!roles.includes(req.usuario.rol)) throw Errores.permiso();
    next();
  } catch (e) { next(e); }
};

const autenticado = (req, res, next) => { try { req.usuario = identidad(req); next(); } catch (e) { next(e); } };

module.exports = { firmar, verificar, exigirServicio, identidad, exigirRol, autenticado };
