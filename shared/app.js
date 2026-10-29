// Fábrica común de aplicaciones Express para los servicios y arranque estándar.
const express = require('express');
const crypto = require('crypto');
const { rutaNoEncontrada, manejadorErrores } = require('./errors');
const { esperarBd, ejecutarArchivo, sembrarSiVacia } = require('./db');

function idPeticion(req, res, next) {
  if (!req.headers['x-request-id']) req.headers['x-request-id'] = 'req-' + crypto.randomBytes(4).toString('hex');
  res.setHeader('x-request-id', req.headers['x-request-id']);
  next();
}

function crearApp(nombre) {
  const app = express();
  app.disable('x-powered-by');
  // El contrato omite los campos sin valor en lugar de enviar null
  app.set('json replacer', (k, v) => (v === null ? undefined : v));
  app.use(idPeticion);
  app.use(express.json({ limit: '100kb' }));
  app.get('/health', (req, res) => res.json({ servicio: nombre, estado: 'ok' }));
  return app;
}

function cerrarApp(app) {
  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);
  return app;
}

// Espera la BD, crea tablas (idempotente), carga datos de prueba si está vacía y abre el puerto.
async function arrancarServicio({ nombre, puerto, app, pool, esquema, datosPrueba, alIniciar }) {
  if (pool) {
    await esperarBd(pool);
    if (esquema) await ejecutarArchivo(pool, esquema);
    if (datosPrueba && (await sembrarSiVacia(pool, datosPrueba.tabla, datosPrueba.archivo))) console.log(`[${nombre}] datos de prueba cargados`);
  }
  const servidor = await new Promise((resolve) => {
    const s = app.listen(puerto, () => resolve(s));
  });
  console.log(`[${nombre}] escuchando en el puerto ${servidor.address().port}`);
  if (alIniciar) alIniciar();
  return servidor;
}

module.exports = { crearApp, cerrarApp, arrancarServicio, idPeticion };
