const express = require('express');
const c = require('./controller');
const { exigirRol, autenticado } = require('../../../shared/auth');

const publico = express.Router();
publico.get('/laboratorios', autenticado, c.listarLabs);
publico.post('/laboratorios', exigirRol('administrador'), c.crearLab);
publico.get('/laboratorios/:laboratorioId', autenticado, c.obtenerLab);
publico.put('/laboratorios/:laboratorioId', exigirRol('administrador'), c.reemplazarLab);
publico.get('/categorias', autenticado, c.listarCats);
publico.post('/categorias', exigirRol('administrador'), c.crearCat);
publico.get('/recursos', autenticado, c.listarRecursos);
publico.post('/recursos', exigirRol('encargado', 'administrador'), c.crearRecurso);
publico.get('/recursos/:recursoId', autenticado, c.obtenerRecurso);
publico.put('/recursos/:recursoId', exigirRol('encargado', 'administrador'), c.reemplazarRecurso);
publico.patch('/recursos/:recursoId', exigirRol('encargado', 'administrador'), c.cambiarEstado);
publico.delete('/recursos/:recursoId', exigirRol('encargado', 'administrador'), c.darDeBaja);

const interno = express.Router();
interno.patch('/recursos/:recursoId', c.estadoInterno);
interno.get('/catalogo', c.catalogo);   // lectura para Reportes

module.exports = { publico, interno };
