const express = require('express');
const c = require('./controller');
const { exigirRol, autenticado } = require('../../../shared/auth');

const publico = express.Router();
publico.get('/disponibilidad', autenticado, c.disponibilidad);
publico.post('/reservas', exigirRol('alumno', 'docente', 'encargado'), c.crearReserva);
publico.get('/reservas', autenticado, c.listarReservas);
publico.get('/reservas/:reservaId', autenticado, c.obtenerReserva);
publico.patch('/reservas/:reservaId', autenticado, c.modificarReserva);
publico.post('/prestamos', exigirRol('encargado', 'administrador'), c.entregar);
publico.get('/prestamos/:prestamoId', autenticado, c.obtenerPrestamo);
publico.patch('/prestamos/:prestamoId', exigirRol('encargado', 'administrador'), c.devolver);
publico.post('/incidencias', exigirRol('encargado', 'administrador'), c.registrarIncidencia);
publico.get('/incidencias', exigirRol('encargado', 'administrador'), c.listarIncidencias);

const interno = express.Router();
interno.get('/reportes/datos', c.datosReportes);   // lectura para Reportes
module.exports = { publico, interno };
