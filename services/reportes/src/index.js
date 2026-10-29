const config = require('../../../shared/config');
const { arrancarServicio } = require('../../../shared/app');

// Reportes no tiene base de datos propia: solo lee de otros servicios.
function arrancar() { return arrancarServicio({ nombre: 'reportes', puerto: config.puertos.reportes, app: require('./app') }); }
module.exports = { arrancar };
if (require.main === module) arrancar().catch((e) => { console.error(e); process.exit(1); });
