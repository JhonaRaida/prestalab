// Lee el catálogo REAL de PostgreSQL y escribe docs/modelo-datos.json (tablas, columnas, llaves, restricciones, índices).
// Sirve para generar el diccionario de datos sin copiar a mano. Uso: node scripts/extraer-modelo.js
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('../shared/config');

const SERVICIOS = { usuarios: 'Usuarios', inventario: 'Inventario', reservas: 'Reservas', notificaciones: 'Notificaciones' };

(async () => {
  const salida = {};
  for (const [clave, nombreBd] of Object.entries(config.bd.nombres)) {
    const pool = new Pool({ ...config.bd, database: nombreBd });
    const tablas = (await pool.query(
      `SELECT c.relname AS tabla, c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`)).rows;
    const bd = { servicio: SERVICIOS[clave], baseDatos: nombreBd, tablas: {} };
    for (const t of tablas) {
      const cols = (await pool.query(
        `SELECT a.attname AS nombre, format_type(a.atttypid, a.atttypmod) AS tipo, NOT a.attnotnull AS nulo,
                pg_get_expr(d.adbin, d.adrelid) AS defecto
           FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
          WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`, [t.oid])).rows;
      const cons = (await pool.query(
        `SELECT conname AS nombre, contype AS tipo, pg_get_constraintdef(oid) AS definicion, conkey, confrelid::regclass::text AS destino
           FROM pg_constraint WHERE conrelid = $1 ORDER BY contype, conname`, [t.oid])).rows;
      const idx = (await pool.query(`SELECT indexname AS nombre, indexdef AS definicion FROM pg_indexes WHERE schemaname='public' AND tablename=$1 ORDER BY indexname`, [t.tabla])).rows;
      const filas = (await pool.query(`SELECT count(*)::int AS n FROM "${t.tabla}"`)).rows[0].n;
      const attnums = (await pool.query(`SELECT attnum, attname FROM pg_attribute WHERE attrelid = $1 AND attnum > 0`, [t.oid])).rows;
      const nombreDe = Object.fromEntries(attnums.map((a) => [a.attnum, a.attname]));
      bd.tablas[t.tabla] = {
        columnas: cols,
        restricciones: cons.map((c) => ({ nombre: c.nombre, tipo: c.tipo, definicion: c.definicion, columnas: (c.conkey || []).map((k) => nombreDe[k]), destino: c.destino === '-' ? null : c.destino })),
        indices: idx, registros: filas,
      };
    }
    salida[clave] = bd;
    await pool.end();
  }
  fs.writeFileSync(path.join(__dirname, '../docs/modelo-datos.json'), JSON.stringify(salida, null, 2));
  const n = Object.values(salida).reduce((s, b) => s + Object.keys(b.tablas).length, 0);
  console.log(`Modelo extraído: ${Object.keys(salida).length} bases, ${n} tablas`);
})().catch((e) => { console.error(e.message); process.exit(1); });
