// Crea (o reinicia con --reiniciar) las 4 bases de datos en un PostgreSQL local.
// Con Docker Compose NO hace falta: db/init/00-crear-bases.sql lo hace automáticamente.
const { Client } = require('pg');
const config = require('../shared/config');

(async () => {
  const reiniciar = process.argv.includes('--reiniciar');
  const admin = new Client({
    host: config.bd.host, port: config.bd.port, database: 'postgres',
    user: process.env.DB_ADMIN_USER || config.bd.user, password: process.env.DB_ADMIN_PASSWORD || config.bd.password,
  });
  await admin.connect();
  for (const nombre of Object.values(config.bd.nombres)) {
    const existe = (await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombre])).rowCount > 0;
    if (existe && reiniciar) { await admin.query(`DROP DATABASE "${nombre}" WITH (FORCE)`); }
    if (!existe || reiniciar) { await admin.query(`CREATE DATABASE "${nombre}"`); console.log(`Base creada: ${nombre}`); }
    else console.log(`Base ya existe: ${nombre}`);
  }
  await admin.end();
})().catch((e) => { console.error('No se pudo conectar o crear las bases:', e.message); process.exit(1); });
