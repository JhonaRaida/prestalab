const { crearApp, cerrarApp } = require('../../../shared/app');
const { exigirServicio } = require('../../../shared/auth');
const { publico, interno } = require('./routes');

const app = crearApp('notificaciones');
app.use(exigirServicio);
app.use('/api/v1', publico);
app.use('/internal/v1', interno);
module.exports = cerrarApp(app);
