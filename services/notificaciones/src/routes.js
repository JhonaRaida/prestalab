const express = require('express');
const c = require('./controller');
const { autenticado } = require('../../../shared/auth');

const publico = express.Router();
publico.get('/notificaciones', autenticado, c.listar);
publico.patch('/notificaciones/:notificacionId', autenticado, c.marcar);
const interno = express.Router();
interno.post('/notificaciones', c.registrarInterna);
module.exports = { publico, interno };
