// Arranca el Gateway y los 5 servicios en un solo proceso (modo "sin Docker" para desarrollo).
// Cada servicio sigue siendo independiente: se comunican por HTTP igual que en Docker Compose.
const servicios = ['usuarios', 'inventario', 'notificaciones', 'reservas', 'reportes'];
(async () => {
  for (const s of servicios) await require(`../services/${s}/src/index.js`).arrancar();
  await require('../gateway/src/index.js').arrancar();
  console.log('\nPrestaLab listo → http://localhost:' + require('../shared/config').puertos.gateway + '/docs');
})().catch((e) => { console.error(e); process.exit(1); });
