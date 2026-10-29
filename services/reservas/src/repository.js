// Acceso a datos de Reservas y Préstamos (SQL parametrizado). Las funciones que reciben `db`
// aceptan el pool o un cliente de transacción.
const { crearPool } = require('../../../shared/db');
const config = require('../../../shared/config');

const pool = crearPool(config.bd.nombres.reservas);

const aReserva = (r) => r && ({
  id: r.id, usuarioId: r.usuario_id, recursoId: r.recurso_id, inicio: r.inicio, fin: r.fin,
  estado: r.estado, creadaEn: r.creada_en, laboratorioId: r.laboratorio_id, encargadoId: r.encargado_id,
});
// Lo que se publica de una reserva (sin datos internos)
const publicaReserva = (r) => r && ({ id: r.id, usuarioId: r.usuarioId, recursoId: r.recursoId, inicio: r.inicio, fin: r.fin, estado: r.estado, creadaEn: r.creadaEn });
const aPrestamo = (r) => r && ({
  id: r.id, reservaId: r.reserva_id, entregadoPor: r.entregado_por, fechaEntrega: r.fecha_entrega,
  recibidoPor: r.recibido_por, fechaDevolucion: r.fecha_devolucion, estadoDevolucion: r.estado_devolucion, observaciones: r.observaciones,
});
const aIncidencia = (r) => r && ({
  id: r.id, prestamoId: r.prestamo_id, recursoId: r.recurso_id, tipo: r.tipo, descripcion: r.descripcion, estado: r.estado, creadaEn: r.creada_en,
});

// ---- reservas ----
async function bloquearUsuario(db, usuarioId) { await db.query('SELECT pg_advisory_xact_lock($1)', [usuarioId]); }
async function contarVigentes(db, usuarioId) {
  const r = await db.query(
    `SELECT count(*)::int n FROM reservas WHERE usuario_id = $1 AND estado IN ('confirmada','en_curso') AND fin > now()`, [usuarioId]);
  return r.rows[0].n;
}
async function crearReserva(db, d) {
  const r = await db.query(
    `INSERT INTO reservas (usuario_id, recurso_id, laboratorio_id, encargado_id, inicio, fin)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [d.usuarioId, d.recursoId, d.laboratorioId, d.encargadoId || null, d.inicio, d.fin]);
  return aReserva(r.rows[0]);
}
async function reservaPorId(db, id, bloquear = false) {
  return aReserva((await db.query(`SELECT * FROM reservas WHERE id = $1${bloquear ? ' FOR UPDATE' : ''}`, [id])).rows[0]);
}
async function listarReservas({ usuarioId, encargadoId, recursoId, estado, desde, hasta, limit, offset }) {
  const cond = []; const val = [];
  const add = (sql, v) => { val.push(v); cond.push(sql.replace('?', '$' + val.length)); };
  if (usuarioId) add('usuario_id = ?', usuarioId);
  if (encargadoId) add('encargado_id = ?', encargadoId);
  if (recursoId) add('recurso_id = ?', recursoId);
  if (estado) add('estado = ?', estado);
  if (desde) add('inicio >= ?', desde);
  if (hasta) add('inicio < ?', hasta);
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const total = (await pool.query(`SELECT count(*)::int n FROM reservas ${where}`, val)).rows[0].n;
  const f = await pool.query(`SELECT * FROM reservas ${where} ORDER BY inicio DESC, id DESC LIMIT ${limit} OFFSET ${offset}`, val);
  return { filas: f.rows.map(aReserva), total };
}
async function actualizarReserva(db, id, campos) {
  const sets = []; const val = [];
  for (const [k, v] of Object.entries(campos)) { val.push(v); sets.push(`${k} = $${val.length}`); }
  val.push(id);
  return aReserva((await db.query(`UPDATE reservas SET ${sets.join(', ')} WHERE id = $${val.length} RETURNING *`, val)).rows[0]);
}
async function recursosOcupados(inicio, fin) {
  const r = await pool.query(
    `SELECT DISTINCT recurso_id FROM reservas WHERE estado IN ('confirmada','en_curso') AND inicio < $2 AND fin > $1`, [inicio, fin]);
  return new Set(r.rows.map((x) => x.recurso_id));
}

// ---- préstamos ----
async function crearPrestamo(db, { reservaId, entregadoPor, observaciones }) {
  return aPrestamo((await db.query(
    'INSERT INTO prestamos (reserva_id, entregado_por, observaciones) VALUES ($1,$2,$3) RETURNING *', [reservaId, entregadoPor, observaciones || null])).rows[0]);
}
async function prestamoPorId(db, id, bloquear = false) {
  return aPrestamo((await db.query(`SELECT * FROM prestamos WHERE id = $1${bloquear ? ' FOR UPDATE' : ''}`, [id])).rows[0]);
}
async function prestamoDeReserva(db, reservaId) {
  return aPrestamo((await db.query('SELECT * FROM prestamos WHERE reserva_id = $1', [reservaId])).rows[0]);
}
async function registrarDevolucion(db, id, { recibidoPor, estadoDevolucion, observaciones }) {
  return aPrestamo((await db.query(
    `UPDATE prestamos SET recibido_por = $1, fecha_devolucion = now(), estado_devolucion = $2,
       observaciones = COALESCE($3, observaciones) WHERE id = $4 RETURNING *`, [recibidoPor, estadoDevolucion, observaciones || null, id])).rows[0]);
}

// ---- incidencias ----
async function crearIncidencia(db, { prestamoId, recursoId, tipo, descripcion }) {
  return aIncidencia((await db.query(
    'INSERT INTO incidencias (prestamo_id, recurso_id, tipo, descripcion) VALUES ($1,$2,$3,$4) RETURNING *', [prestamoId, recursoId, tipo, descripcion])).rows[0]);
}
async function listarIncidencias({ encargadoId, tipo, recursoId, estado, desde, hasta, limit, offset }) {
  const cond = []; const val = [];
  const add = (sql, v) => { val.push(v); cond.push(sql.replace('?', '$' + val.length)); };
  if (encargadoId) add('r.encargado_id = ?', encargadoId);
  if (tipo) add('i.tipo = ?', tipo);
  if (recursoId) add('i.recurso_id = ?', recursoId);
  if (estado) add('i.estado = ?', estado);
  if (desde) add('i.creada_en >= ?', desde);
  if (hasta) add('i.creada_en < ?', hasta);
  const from = 'FROM incidencias i JOIN prestamos p ON p.id = i.prestamo_id JOIN reservas r ON r.id = p.reserva_id';
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const total = (await pool.query(`SELECT count(*)::int n ${from} ${where}`, val)).rows[0].n;
  const f = await pool.query(`SELECT i.* ${from} ${where} ORDER BY i.creada_en DESC, i.id DESC LIMIT ${limit} OFFSET ${offset}`, val);
  return { filas: f.rows.map(aIncidencia), total };
}

// ---- tareas programadas ----
async function cancelarNoPresentados(tolerancia) {
  const r = await pool.query(
    `UPDATE reservas r SET estado = 'cancelada'
      WHERE estado = 'confirmada' AND inicio + make_interval(mins => $1) < now()
        AND NOT EXISTS (SELECT 1 FROM prestamos p WHERE p.reserva_id = r.id) RETURNING id`, [tolerancia]);
  return r.rowCount;
}
async function reservasParaRecordar(minutos) {
  const r = await pool.query(
    `UPDATE reservas SET recordatorio_enviado = true
      WHERE estado = 'confirmada' AND NOT recordatorio_enviado
        AND inicio > now() AND inicio <= now() + make_interval(mins => $1) RETURNING *`, [minutos]);
  return r.rows.map(aReserva);
}
async function reservasConRetraso(tolerancia) {
  const r = await pool.query(
    `UPDATE reservas SET retraso_avisado = true
      WHERE estado = 'en_curso' AND NOT retraso_avisado AND fin + make_interval(mins => $1) < now() RETURNING *`, [tolerancia]);
  return r.rows.map(aReserva);
}

// ---- datos para Reportes (lectura) ----
async function datosReportes({ desde, hasta, laboratorioIds }) {
  const val = [desde, hasta]; let filtroLab = '';
  if (laboratorioIds && laboratorioIds.length) { val.push(laboratorioIds); filtroLab = ' AND r.laboratorio_id = ANY($3)'; }
  const reservas = (await pool.query(
    `SELECT r.id, r.recurso_id, r.laboratorio_id, r.inicio, r.fin, r.estado FROM reservas r
      WHERE r.estado <> 'cancelada' AND r.inicio < $2 AND r.fin > $1${filtroLab}`, val)).rows;
  const prestamos = (await pool.query(
    `SELECT p.id, r.usuario_id, r.recurso_id, r.laboratorio_id, r.fin AS fin_reserva, p.fecha_entrega, p.fecha_devolucion
       FROM prestamos p JOIN reservas r ON r.id = p.reserva_id
      WHERE p.fecha_entrega >= $1 AND p.fecha_entrega < $2${filtroLab}`, val)).rows;
  const incidencias = (await pool.query(
    `SELECT i.id, i.tipo, i.prestamo_id FROM incidencias i JOIN prestamos p ON p.id = i.prestamo_id JOIN reservas r ON r.id = p.reserva_id
      WHERE i.creada_en >= $1 AND i.creada_en < $2${filtroLab}`, val)).rows;
  return {
    reservas: reservas.map((x) => ({ id: x.id, recursoId: x.recurso_id, laboratorioId: x.laboratorio_id, inicio: x.inicio, fin: x.fin, estado: x.estado })),
    prestamos: prestamos.map((x) => ({
      id: x.id, usuarioId: x.usuario_id, recursoId: x.recurso_id, laboratorioId: x.laboratorio_id,
      finReserva: x.fin_reserva, fechaEntrega: x.fecha_entrega, fechaDevolucion: x.fecha_devolucion })),
    incidencias: incidencias.map((x) => ({ id: x.id, tipo: x.tipo, prestamoId: x.prestamo_id })),
  };
}

module.exports = {
  pool, publicaReserva, bloquearUsuario, contarVigentes, crearReserva, reservaPorId, listarReservas, actualizarReserva,
  recursosOcupados, crearPrestamo, prestamoPorId, prestamoDeReserva, registrarDevolucion, crearIncidencia, listarIncidencias,
  cancelarNoPresentados, reservasParaRecordar, reservasConRetraso, datosReportes,
};
