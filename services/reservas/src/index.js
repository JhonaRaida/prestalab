const path = require('path');
const config = require('../../../shared/config');
const { arrancarServicio } = require('../../../shared/app');

let temporizador = null;
function arrancar() {
  const service = require('./service');
  return arrancarServicio({
    nombre: 'reservas', puerto: config.puertos.reservas, app: require('./app'),
    pool: require('./repository').pool, esquema: path.join(__dirname, '../../../db/reservas/001_esquema.sql'),
    datosPrueba: { tabla: 'reservas', archivo: path.join(__dirname, '../../../db/reservas/002_datos_prueba.sql') },
    // Tarea programada: cancela no presentados, envía recordatorios y avisos de retraso
    alIniciar: () => {
      if (!config.tareasActivas) return;
      temporizador = setInterval(() => service.ejecutarTareas().catch((e) => console.error('[reservas] tarea falló:', e.message)), config.intervaloTareasMs);
      temporizador.unref();
    },
  });
}
module.exports = { arrancar, detenerTareas: () => clearInterval(temporizador) };
if (require.main === module) arrancar().catch((e) => { console.error(e); process.exit(1); });
