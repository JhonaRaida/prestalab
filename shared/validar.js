// Validación con Zod y paginación común.
const { z } = require('zod');
const { Errores } = require('./errors');

function validar(esquema, datos) {
  const r = esquema.safeParse(datos === undefined ? {} : datos);
  if (!r.success) {
    const detalles = r.error.issues.map((i) => ({ campo: i.path.join('.') || undefined, problema: i.message }));
    throw Errores.validacion(detalles);
  }
  return r.data;
}

const fechaIso = z.string({ required_error: 'Es obligatorio', invalid_type_error: 'Debe ser texto' })
  .datetime({ offset: true, message: 'Debe ser una fecha ISO 8601 con zona horaria, por ejemplo 2026-11-03T10:00:00-06:00' });
const idEntero = z.coerce.number({ invalid_type_error: 'Debe ser un número' }).int('Debe ser entero').positive('Debe ser mayor que cero');
const paginacion = {
  page: z.coerce.number().int().min(1, 'Debe ser 1 o mayor').default(1),
  limit: z.coerce.number().int().min(1, 'Debe ser 1 o mayor').max(100, 'El máximo es 100').default(20),
};
const booleano = z.enum(['true', 'false'], { message: 'Debe ser true o false' }).transform((v) => v === 'true');

function idRuta(valor, nombre = 'id') {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) throw Errores.validacion([{ campo: nombre, problema: 'Debe ser un entero positivo' }]);
  return n;
}

const respuestaLista = (data, total, { page, limit }) => ({ data, meta: { page, limit, total } });

module.exports = { z, validar, fechaIso, idEntero, paginacion, booleano, idRuta, respuestaLista };
