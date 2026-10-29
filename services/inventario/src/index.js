const path = require('path');
const config = require('../../../shared/config');
const { arrancarServicio } = require('../../../shared/app');

function arrancar() {
  return arrancarServicio({
    nombre: 'inventario', puerto: config.puertos.inventario, app: require('./app'),
    pool: require('./repository').pool, esquema: path.join(__dirname, '../../../db/inventario/001_esquema.sql'),
    datosPrueba: { tabla: 'laboratorios', archivo: path.join(__dirname, '../../../db/inventario/002_datos_prueba.sql') },
  });
}
module.exports = { arrancar };
if (require.main === module) arrancar().catch((e) => { console.error(e); process.exit(1); });
