// API Gateway: punto de entrada único. Asigna idPeticion, limita peticiones, valida el JWT,
// reenvía identidad/rol a los servicios y traduce fallas de red a 503.
const express = require('express');
const crypto = require('crypto');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const YAML = require('yaml');
const swaggerUi = require('swagger-ui-express');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const config = require('../../shared/config');
const { verificar } = require('../../shared/auth');
const { Errores, enviarError, rutaNoEncontrada, manejadorErrores } = require('../../shared/errors');
const { esPublica, servicioDe } = require('./rutas');

function crearGateway() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));

  // idPeticion único por petición
  app.use((req, res, next) => {
    req.headers['x-request-id'] = 'req-' + crypto.randomBytes(4).toString('hex');
    res.setHeader('x-request-id', req.headers['x-request-id']);
    next();
  });

  // Salud agregada (útil para demostrar tolerancia a fallos)
  app.get('/health', async (req, res) => {
    const nombres = Object.keys(config.urls);
    const estados = await Promise.all(nombres.map(async (n) => {
      try { const r = await fetch(config.urls[n] + '/health', { signal: AbortSignal.timeout(1500) }); return [n, r.ok ? 'ok' : 'error']; }
      catch (_) { return [n, 'caido']; }
    }));
    const servicios = Object.fromEntries(estados);
    res.status(Object.values(servicios).every((e) => e === 'ok') ? 200 : 503).json({ gateway: 'ok', servicios });
  });

  // Documentación interactiva (OpenAPI de la Entrega 3)
  const yamlPath = path.join(__dirname, '../../docs/openapi.yaml');
  if (fs.existsSync(yamlPath)) {
    const doc = YAML.parse(fs.readFileSync(yamlPath, 'utf8'));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(doc, { customSiteTitle: 'PrestaLab API' }));
  }

  const limite = (max) => rateLimit({
    windowMs: 60 * 1000, limit: max, standardHeaders: true, legacyHeaders: false,
    handler: (req, res) => enviarError(req, res, 429, 'DEMASIADAS_PETICIONES', 'Hiciste demasiadas peticiones. Espera un minuto e intenta de nuevo.'),
  });
  // Más estricto para el inicio de sesión y el registro (fuerza bruta)
  app.use('/api/v1/sesiones', limite(config.limites.sesionesPorMinuto));
  app.use('/api/v1', limite(config.limites.generalPorMinuto));

  // Autenticación: valida el token y deja la identidad en req
  app.use('/api/v1', (req, res, next) => {
    try {
      const ruta = '/api/v1' + req.url.split('?')[0].replace(/\/+$/, '');
      if (!servicioDe(ruta)) return rutaNoEncontrada(req, res);
      if (esPublica(req.method, ruta)) return next();
      const h = req.headers.authorization || '';
      const m = /^Bearer (.+)$/i.exec(h);
      if (!m) throw Errores.tokenInvalido();
      req.identidad = verificar(m[1]);
      next();
    } catch (e) { next(e); }
  });

  // Un proxy por servicio
  for (const nombre of Object.keys(config.urls)) {
    app.use(createProxyMiddleware({
      target: config.urls[nombre],
      changeOrigin: true,
      pathFilter: (pathname) => servicioDe(pathname) === nombre,
      proxyTimeout: 10000,
      on: {
        proxyReq: (proxyReq, req) => {
          // Nunca confiar en la identidad que mande el cliente
          proxyReq.removeHeader('x-user-id'); proxyReq.removeHeader('x-user-rol'); proxyReq.removeHeader('x-service-token');
          proxyReq.setHeader('x-service-token', config.tokenServicio);
          proxyReq.setHeader('x-request-id', req.headers['x-request-id']);
          if (req.identidad) {
            proxyReq.setHeader('x-user-id', String(req.identidad.id));
            proxyReq.setHeader('x-user-rol', req.identidad.rol);
          }
        },
        error: (err, req, res) => {
          if (res.headersSent || typeof res.writeHead !== 'function') return;
          enviarError(req, res, 503, 'SERVICIO_NO_DISPONIBLE',
            `El servicio de ${nombre} no está disponible. Intenta de nuevo en unos momentos.`);
        },
      },
    }));
  }

  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);
  return app;
}
module.exports = { crearGateway };
