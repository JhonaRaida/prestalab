const { crearPool } = require('../../../shared/db');
const config = require('../../../shared/config');

const pool = crearPool(config.bd.nombres.notificaciones);
const aNotif = (r) => r && ({ id: r.id, usuarioId: r.usuario_id, tipo: r.tipo, mensaje: r.mensaje, leida: r.leida, estadoEnvio: r.estado_envio, creadaEn: r.creada_en });

async function crear({ usuarioId, tipo, mensaje, estadoEnvio }) {
  const r = await pool.query('INSERT INTO notificaciones (usuario_id, tipo, mensaje, estado_envio) VALUES ($1,$2,$3,$4) RETURNING *', [usuarioId, tipo, mensaje, estadoEnvio]);
  return aNotif(r.rows[0]);
}
async function listarDeUsuario(usuarioId, { leida, limit, offset }) {
  const val = [usuarioId]; let extra = '';
  if (leida !== undefined) { val.push(leida); extra = ' AND leida = $2'; }
  const total = (await pool.query(`SELECT count(*)::int n FROM notificaciones WHERE usuario_id = $1${extra}`, val)).rows[0].n;
  const f = await pool.query(`SELECT * FROM notificaciones WHERE usuario_id = $1${extra} ORDER BY creada_en DESC, id DESC LIMIT ${limit} OFFSET ${offset}`, val);
  return { filas: f.rows.map(aNotif), total };
}
const porId = async (id) => aNotif((await pool.query('SELECT * FROM notificaciones WHERE id = $1', [id])).rows[0]);
async function marcarLeida(id, leida) {
  return aNotif((await pool.query('UPDATE notificaciones SET leida = $1 WHERE id = $2 RETURNING *', [leida, id])).rows[0]);
}
module.exports = { pool, crear, listarDeUsuario, porId, marcarLeida };
