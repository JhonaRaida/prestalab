// Rutas de Usuarios y Autenticación.
const express = require('express');
const c = require('./controller');
const { exigirRol, autenticado } = require('../../../shared/auth');

const publico = express.Router();   // /api/v1
publico.post('/sesiones', c.iniciarSesion);
publico.post('/usuarios', c.registrar);
publico.get('/usuarios', exigirRol('administrador'), c.listar);
publico.get('/usuarios/:usuarioId', autenticado, c.obtener);
publico.patch('/usuarios/:usuarioId', autenticado, c.actualizar);
publico.get('/usuarios/:usuarioId/sanciones', autenticado, c.sanciones);

const interno = express.Router();   // /internal/v1
interno.get('/usuarios/:usuarioId/estado', c.estadoInterno);
interno.post('/sanciones', c.crearSancionInterna);

module.exports = { publico, interno };
