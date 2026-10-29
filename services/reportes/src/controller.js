const service = require('./service');
const { z, validar, fechaIso, idEntero } = require('../../../shared/validar');
const { Errores } = require('../../../shared/errors');

const esq = z.object({ desde: fechaIso, hasta: fechaIso, laboratorioId: idEntero.optional() })
  .refine((o) => !o.desde || !o.hasta || new Date(o.hasta) > new Date(o.desde), { message: 'hasta debe ser posterior a desde', path: ['hasta'] });

const manejar = (fn) => async (req, res) => {
  const f = validar(esq, req.query);
  if (!f.desde) throw Errores.validacion([{ campo: 'desde', problema: 'Es obligatorio' }]);
  res.json(await fn(f, req.usuario, req));
};
exports.uso = manejar(service.uso);
exports.ocupacion = manejar(service.ocupacion);
exports.retrasos = manejar(service.retrasos);
