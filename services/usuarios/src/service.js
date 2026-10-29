// Lógica de negocio de Usuarios y Autenticación (RF-01, RF-02, RF-07 parte de sanciones).
const bcrypt = require('bcryptjs');
const repo = require('./repository');
const config = require('../../../shared/config');
const { Errores } = require('../../../shared/errors');
const { firmar } = require('../../../shared/auth');

// Hash falso para igualar el tiempo de respuesta cuando el correo no existe.
const HASH_FALSO = bcrypt.hashSync('no-existe', 4);

async function registrar(datos) {
  const hash = await bcrypt.hash(datos.contrasena, config.bcryptRondas);
  try {
    return await repo.crear({ ...datos, hash, rol: datos.rol || 'alumno' });
  } catch (e) {
    if (e.code === '23505') throw Errores.conflicto('CORREO_REPETIDO', 'Ya existe un usuario con ese correo.');
    throw e;
  }
}

async function iniciarSesion({ correo, contrasena }) {
  const u = await repo.porCorreoConHash(correo);
  const ok = await bcrypt.compare(contrasena, u ? u.hash : HASH_FALSO);
  if (!u || !ok) throw Errores.credenciales();
  return {
    tokenAcceso: firmar(u), tipo: 'Bearer', expiraEn: config.jwtExpiraSegundos,
    usuario: { id: u.id, nombre: u.nombre, rol: u.rol },
  };
}

const esAdmin = (a) => a.rol === 'administrador';

async function obtener(id, actor) {
  if (!esAdmin(actor) && actor.id !== id) throw Errores.permiso('Solo puedes consultar tu propio usuario.');
  const u = await repo.porId(id);
  if (!u) throw Errores.noEncontrado('El usuario');
  return u;
}

async function actualizar(id, cambios, actor) {
  if (!esAdmin(actor)) {
    if (actor.id !== id) throw Errores.permiso('Solo puedes modificar tu propio usuario.');
    if (cambios.rol !== undefined || cambios.estado !== undefined) throw Errores.permiso('Solo un administrador puede cambiar el rol o el estado.');
  }
  if (!(await repo.porId(id))) throw Errores.noEncontrado('El usuario');
  return repo.actualizar(id, cambios);
}

async function listarSanciones(id, actor, pag) {
  if (!esAdmin(actor) && actor.id !== id) throw Errores.permiso('Solo puedes consultar tus propias sanciones.');
  if (!(await repo.porId(id))) throw Errores.noEncontrado('El usuario');
  return repo.sanciones(id, pag);
}

// ---- internos (solo entre servicios) ----
async function estadoInterno(id) {
  const u = await repo.porId(id);
  if (!u) throw Errores.noEncontrado('El usuario');
  const s = await repo.sancionVigente(id);
  return { id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, estado: u.estado, sancionVigente: s ? { id: s.id, fin: s.fin } : null };
}

async function crearSancionInterna({ usuarioId, motivo, prestamoId, dias }) {
  if (!(await repo.porId(usuarioId))) throw Errores.noEncontrado('El usuario');
  return repo.crearSancion({ usuarioId, motivo, prestamoId, dias: dias || config.reglas.sancionDias });
}

module.exports = { registrar, iniciarSesion, obtener, actualizar, listarSanciones, estadoInterno, crearSancionInterna };
