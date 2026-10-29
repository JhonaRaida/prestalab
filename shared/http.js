// Cliente HTTP entre servicios: reenvía identidad e id de petición, aplica timeout y
// convierte "servicio caído / lento / 5xx" en 503 SERVICIO_NO_DISPONIBLE.
const config = require('./config');
const { Errores } = require('./errors');

async function llamar(servicio, ruta, { metodo = 'GET', cuerpo, req, nombre } = {}) {
  const headers = { 'x-service-token': config.tokenServicio, accept: 'application/json' };
  if (cuerpo !== undefined) headers['content-type'] = 'application/json';
  if (req) {
    for (const h of ['x-request-id', 'x-user-id', 'x-user-rol']) if (req.headers[h]) headers[h] = req.headers[h];
  }
  let res;
  try {
    res = await fetch(config.urls[servicio] + ruta, {
      method: metodo,
      headers,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(config.timeoutLlamadasMs),
    });
  } catch (e) {
    throw Errores.servicioCaido(nombre || servicio);
  }
  if (res.status >= 500) throw Errores.servicioCaido(nombre || servicio);
  let datos = null;
  const texto = await res.text();
  if (texto) { try { datos = JSON.parse(texto); } catch (_) { datos = null; } }
  return { ok: res.ok, status: res.status, datos };
}

module.exports = { llamar };
