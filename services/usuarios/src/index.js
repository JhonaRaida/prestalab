const path = require('path');
const config = require('../../../shared/config');
const { arrancarServicio } = require('../../../shared/app');

function arrancar() {
  return arrancarServicio({
    nombre: 'usuarios', puerto: config.puertos.usuarios, app: require('./app'),
    pool: require('./repository').pool, esquema: path.join(__dirname, '../../../db/usuarios/001_esquema.sql'),
    datosPrueba: { tabla: 'usuarios', archivo: path.join(__dirname, '../../../db/usuarios/002_datos_prueba.sql') },
  });
}
module.exports = { arrancar };
if (require.main === module) arrancar().catch((e) => { console.error(e); process.exit(1); });
