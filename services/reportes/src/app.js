const express = require('express');
const { crearApp, cerrarApp } = require('../../../shared/app');
const { exigirServicio, exigirRol } = require('../../../shared/auth');
const c = require('./controller');

const app = crearApp('reportes');
app.use(exigirServicio);
const r = express.Router();
r.get('/reportes/uso', exigirRol('encargado', 'administrador'), c.uso);
r.get('/reportes/ocupacion', exigirRol('encargado', 'administrador'), c.ocupacion);
r.get('/reportes/retrasos', exigirRol('encargado', 'administrador'), c.retrasos);
app.use('/api/v1', r);
module.exports = cerrarApp(app);
