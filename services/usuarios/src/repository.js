// Acceso a datos de Usuarios (SQL parametrizado, sin ORM).
const { crearPool } = require('../../../shared/db');
const config = require('../../../shared/config');

const pool = crearPool(config.bd.nombres.usuarios);

const COLS = 'id, nombre, correo, matricula, rol, estado, creado_en';

const aUsuario = (r) => r && ({ id: r.id, nombre: r.nombre, correo: r.correo, matricula: r.matricula, rol: r.rol, estado: r.estado, creadoEn: r.creado_en });
const aSancion = (r) => ({ id: r.id, usuarioId: r.usuario_id, motivo: r.motivo, inicio: r.inicio, fin: r.fin, prestamoId: r.prestamo_id });

async function crear({ nombre, correo, matricula, hash, rol }) {
  const r = await pool.query(
    `INSERT INTO usuarios (nombre, correo, matricula, contrasena, rol) VALUES ($1,$2,$3,$4,$5) RETURNING ${COLS}`,
    [nombre, correo.toLowerCase(), matricula, hash, rol]);
  return aUsuario(r.rows[0]);
}

async function porCorreoConHash(correo) {
  const r = await pool.query(`SELECT ${COLS}, contrasena FROM usuarios WHERE correo = $1`, [correo.toLowerCase()]);
  return r.rows[0] ? { ...aUsuario(r.rows[0]), hash: r.rows[0].contrasena } : null;
}

async function porId(id) {
  const r = await pool.query(`SELECT ${COLS} FROM usuarios WHERE id = $1`, [id]);
  return aUsuario(r.rows[0]);
}

async function listar({ rol, estado, q, limit, offset }) {
  const cond = []; const val = [];
  if (rol) { val.push(rol); cond.push(`rol = $${val.length}`); }
  if (estado) { val.push(estado); cond.push(`estado = $${val.length}`); }
  if (q) { val.push(`%${q}%`); cond.push(`(nombre ILIKE $${val.length} OR correo ILIKE $${val.length})`); }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const total = await pool.query(`SELECT count(*)::int AS n FROM usuarios ${where}`, val);
  const filas = await pool.query(`SELECT ${COLS} FROM usuarios ${where} ORDER BY id LIMIT ${limit} OFFSET ${offset}`, val);
  return { filas: filas.rows.map(aUsuario), total: total.rows[0].n };
}

async function actualizar(id, campos) {
  const sets = []; const val = [];
  for (const [k, v] of Object.entries(campos)) { val.push(v); sets.push(`${k} = $${val.length}`); }
  val.push(id);
  const r = await pool.query(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = $${val.length} RETURNING ${COLS}`, val);
  return aUsuario(r.rows[0]);
}

async function sancionVigente(usuarioId) {
  const r = await pool.query('SELECT * FROM sanciones WHERE usuario_id = $1 AND fin > now() ORDER BY fin DESC LIMIT 1', [usuarioId]);
  return r.rows[0] ? aSancion(r.rows[0]) : null;
}

async function sanciones(usuarioId, { limit, offset }) {
  const total = await pool.query('SELECT count(*)::int AS n FROM sanciones WHERE usuario_id = $1', [usuarioId]);
  const filas = await pool.query('SELECT * FROM sanciones WHERE usuario_id = $1 ORDER BY inicio DESC LIMIT $2 OFFSET $3', [usuarioId, limit, offset]);
  return { filas: filas.rows.map(aSancion), total: total.rows[0].n };
}

async function crearSancion({ usuarioId, motivo, prestamoId, dias }) {
  const r = await pool.query(
    `INSERT INTO sanciones (usuario_id, motivo, inicio, fin, prestamo_id)
     VALUES ($1, $2, now(), now() + make_interval(days => $3), $4) RETURNING *`,
    [usuarioId, motivo, dias, prestamoId || null]);
  return aSancion(r.rows[0]);
}

async function contar() { return (await pool.query('SELECT count(*)::int AS n FROM usuarios')).rows[0].n; }

module.exports = { pool, crear, porCorreoConHash, porId, listar, actualizar, sancionVigente, sanciones, crearSancion, contar };
