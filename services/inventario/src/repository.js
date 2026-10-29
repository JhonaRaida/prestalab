// Acceso a datos de Inventario (SQL parametrizado).
const { crearPool } = require('../../../shared/db');
const config = require('../../../shared/config');

const pool = crearPool(config.bd.nombres.inventario);

const aLab = (r) => r && ({ id: r.id, nombre: r.nombre, ubicacion: r.ubicacion, encargadoId: r.encargado_id });
const aCat = (r) => r && ({ id: r.id, nombre: r.nombre, tipo: r.tipo });
const SEL_REC = `SELECT r.*, c.tipo, l.encargado_id FROM recursos r
                 JOIN categorias c ON c.id = r.categoria_id JOIN laboratorios l ON l.id = r.laboratorio_id`;
// tipo y encargadoId son datos informativos que Reservas necesita para sus reglas
const aRec = (r) => r && ({
  id: r.id, nombre: r.nombre, codigoInventario: r.codigo_inventario, categoriaId: r.categoria_id,
  laboratorioId: r.laboratorio_id, descripcion: r.descripcion, estado: r.estado, tipo: r.tipo, encargadoId: r.encargado_id,
});

// ---- laboratorios ----
async function listarLabs({ limit, offset }) {
  const total = (await pool.query('SELECT count(*)::int n FROM laboratorios')).rows[0].n;
  const f = await pool.query('SELECT * FROM laboratorios ORDER BY id LIMIT $1 OFFSET $2', [limit, offset]);
  return { filas: f.rows.map(aLab), total };
}
const labPorId = async (id) => aLab((await pool.query('SELECT * FROM laboratorios WHERE id = $1', [id])).rows[0]);
async function crearLab({ nombre, ubicacion, encargadoId }) {
  const r = await pool.query('INSERT INTO laboratorios (nombre, ubicacion, encargado_id) VALUES ($1,$2,$3) RETURNING *', [nombre, ubicacion, encargadoId || null]);
  return aLab(r.rows[0]);
}
async function reemplazarLab(id, { nombre, ubicacion, encargadoId }) {
  const r = await pool.query('UPDATE laboratorios SET nombre=$1, ubicacion=$2, encargado_id=$3 WHERE id=$4 RETURNING *', [nombre, ubicacion, encargadoId || null, id]);
  return aLab(r.rows[0]);
}

// ---- categorías ----
async function listarCats({ tipo, limit, offset }) {
  const val = []; let where = '';
  if (tipo) { val.push(tipo); where = 'WHERE tipo = $1'; }
  const total = (await pool.query(`SELECT count(*)::int n FROM categorias ${where}`, val)).rows[0].n;
  const f = await pool.query(`SELECT * FROM categorias ${where} ORDER BY id LIMIT ${limit} OFFSET ${offset}`, val);
  return { filas: f.rows.map(aCat), total };
}
const catPorId = async (id) => aCat((await pool.query('SELECT * FROM categorias WHERE id = $1', [id])).rows[0]);
async function crearCat({ nombre, tipo }) {
  return aCat((await pool.query('INSERT INTO categorias (nombre, tipo) VALUES ($1,$2) RETURNING *', [nombre, tipo])).rows[0]);
}

// ---- recursos ----
async function listarRecursos({ laboratorioId, categoriaId, tipo, estado, q, limit, offset }) {
  const cond = []; const val = [];
  const add = (sql, v) => { val.push(v); cond.push(sql.replace('?', '$' + val.length)); };
  if (laboratorioId) add('r.laboratorio_id = ?', laboratorioId);
  if (categoriaId) add('r.categoria_id = ?', categoriaId);
  if (tipo) add('c.tipo = ?', tipo);
  if (estado) add('r.estado = ?', estado);
  if (q) add('r.nombre ILIKE ?', `%${q}%`);
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const total = (await pool.query(
    `SELECT count(*)::int n FROM recursos r JOIN categorias c ON c.id = r.categoria_id ${where}`, val)).rows[0].n;
  const f = await pool.query(`${SEL_REC} ${where} ORDER BY r.id LIMIT ${limit} OFFSET ${offset}`, val);
  return { filas: f.rows.map(aRec), total };
}
const recursoPorId = async (id) => aRec((await pool.query(`${SEL_REC} WHERE r.id = $1`, [id])).rows[0]);
async function crearRecurso(d) {
  const r = await pool.query(
    `INSERT INTO recursos (nombre, codigo_inventario, categoria_id, laboratorio_id, descripcion)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`, [d.nombre, d.codigoInventario, d.categoriaId, d.laboratorioId, d.descripcion || null]);
  return recursoPorId(r.rows[0].id);
}
async function reemplazarRecurso(id, d) {
  await pool.query(
    `UPDATE recursos SET nombre=$1, codigo_inventario=$2, categoria_id=$3, laboratorio_id=$4, descripcion=$5 WHERE id=$6`,
    [d.nombre, d.codigoInventario, d.categoriaId, d.laboratorioId, d.descripcion || null, id]);
  return recursoPorId(id);
}
async function cambiarEstado(id, estado) {
  await pool.query('UPDATE recursos SET estado = $1 WHERE id = $2', [estado, id]);
  return recursoPorId(id);
}
async function catalogo() {
  const labs = (await pool.query('SELECT * FROM laboratorios ORDER BY id')).rows.map(aLab);
  const recs = (await pool.query(`${SEL_REC} ORDER BY r.id`)).rows.map(aRec);
  return { laboratorios: labs, recursos: recs };
}
const contarLabs = async () => (await pool.query('SELECT count(*)::int n FROM laboratorios')).rows[0].n;

module.exports = {
  pool, listarLabs, labPorId, crearLab, reemplazarLab, listarCats, catPorId, crearCat,
  listarRecursos, recursoPorId, crearRecurso, reemplazarRecurso, cambiarEstado, catalogo, contarLabs,
};
