// Acceso a PostgreSQL: pool por servicio, esperar a la BD, ejecutar esquema y transacciones.
const fs = require('fs');
const { Pool } = require('pg');
const config = require('./config');

function crearPool(nombreBd) {
  const pool = new Pool({ ...config.bd, database: nombreBd, max: 10 });
  pool.on('error', (e) => console.error('[bd] error en conexión inactiva:', e.message));
  return pool;
}

async function esperarBd(pool, intentos = 30) {
  for (let i = 1; i <= intentos; i++) {
    try { await pool.query('SELECT 1'); return; }
    catch (e) {
      if (i === intentos) throw e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function ejecutarArchivo(pool, archivo) {
  await pool.query(fs.readFileSync(archivo, 'utf8'));
}

async function transaccion(pool, fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await fn(cliente);
    await cliente.query('COMMIT');
    return r;
  } catch (e) {
    try { await cliente.query('ROLLBACK'); } catch (_) { /* ignorar */ }
    throw e;
  } finally {
    cliente.release();
  }
}

// Carga un archivo SQL de datos de prueba solo si la tabla indicada está vacía (idempotente).
// Se puede desactivar con DATOS_PRUEBA=off (por ejemplo, en un despliegue real).
async function sembrarSiVacia(pool, tabla, archivo) {
  if (process.env.DATOS_PRUEBA === 'off') return false;
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${tabla}`);
  if (rows[0].n > 0) return false;
  await transaccion(pool, (c) => c.query(fs.readFileSync(archivo, 'utf8')));
  return true;
}

module.exports = { crearPool, esperarBd, ejecutarArchivo, transaccion, sembrarSiVacia };
