const config = require('../../shared/config');
const { arrancarServicio } = require('../../shared/app');

function arrancar() { return arrancarServicio({ nombre: 'gateway', puerto: config.puertos.gateway, app: require('./app').crearGateway() }); }
module.exports = { arrancar };
if (require.main === module) arrancar().catch((e) => { console.error(e); process.exit(1); });
