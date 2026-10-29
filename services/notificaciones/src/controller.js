const service = require('./service');
const repo = require('./repository');
const { z, validar, idRuta, idEntero, paginacion, booleano, respuestaLista } = require('../../../shared/validar');

exports.listar = async (req, res) => {
  const f = validar(z.object({ ...paginacion, leida: booleano.optional() }), req.query);
  const { filas, total } = await repo.listarDeUsuario(req.usuario.id, { ...f, offset: (f.page - 1) * f.limit });
  res.json(respuestaLista(filas, total, f));
};
exports.marcar = async (req, res) => {
  const { leida } = validar(z.object({ leida: z.boolean({ required_error: 'Es obligatorio', invalid_type_error: 'Debe ser true o false' }) }).strict(), req.body);
  res.json(await service.marcar(idRuta(req.params.notificacionId, 'notificacionId'), leida, req.usuario));
};
exports.registrarInterna = async (req, res) => {
  const d = validar(z.object({
    usuarioId: idEntero, tipo: z.enum(['confirmacion', 'recordatorio', 'retraso']), mensaje: z.string().min(1).max(500),
  }).strict(), req.body);
  res.status(201).json(await service.registrar(d));
};
