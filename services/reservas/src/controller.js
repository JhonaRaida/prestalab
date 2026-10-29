const service = require('./service');
const repo = require('./repository');
const { z, validar, fechaIso, idEntero, idRuta, paginacion, respuestaLista } = require('../../../shared/validar');

const TIPO = z.enum(['equipo', 'espacio'], { message: 'Debe ser equipo o espacio' });
const offset = (p) => (p.page - 1) * p.limit;

const esqDisp = z.object({ inicio: fechaIso, fin: fechaIso, tipo: TIPO.optional(), laboratorioId: idEntero.optional(), categoriaId: idEntero.optional(), ...paginacion });
const esqReserva = z.object({ recursoId: idEntero, inicio: fechaIso, fin: fechaIso, usuarioId: idEntero.optional() }).strict();
const esqListaRes = z.object({
  ...paginacion, usuarioId: idEntero.optional(), recursoId: idEntero.optional(),
  estado: z.enum(['confirmada', 'cancelada', 'en_curso', 'finalizada']).optional(),
  desde: fechaIso.optional(), hasta: fechaIso.optional(),
});
const esqModificar = z.object({ inicio: fechaIso.optional(), fin: fechaIso.optional(), estado: z.enum(['cancelada'], { message: 'Solo se permite cancelada' }).optional() })
  .strict().refine((o) => Object.keys(o).length > 0, { message: 'Envía al menos un campo a modificar' })
  .refine((o) => !(o.estado && (o.inicio || o.fin)), { message: 'No combines cancelar con cambiar el horario' });
const esqEntrega = z.object({ reservaId: idEntero, observaciones: z.string().max(500).optional() }).strict();
const esqDevolucion = z.object({ estadoDevolucion: z.enum(['correcto', 'danado', 'incompleto'], { message: 'Debe ser correcto, danado o incompleto' }), observaciones: z.string().max(500).optional() }).strict();
const esqIncidencia = z.object({
  prestamoId: idEntero, tipo: z.enum(['dano', 'faltante', 'retraso'], { message: 'Debe ser dano, faltante o retraso' }),
  descripcion: z.string({ required_error: 'Es obligatoria' }).trim().min(1, 'Es obligatoria').max(500),
}).strict();
const esqListaInc = z.object({
  ...paginacion, tipo: z.enum(['dano', 'faltante', 'retraso']).optional(), recursoId: idEntero.optional(),
  estado: z.enum(['abierta', 'cerrada']).optional(), desde: fechaIso.optional(), hasta: fechaIso.optional(),
});

const lista = (res, f, { filas, total }) => res.json(respuestaLista(filas, total, f));

exports.disponibilidad = async (req, res) => {
  const f = validar(esqDisp, req.query);
  lista(res, f, await service.disponibilidad(f, req));
};
exports.crearReserva = async (req, res) => {
  const r = await service.crearReserva(validar(esqReserva, req.body), req.usuario, req);
  res.status(201).location(`/api/v1/reservas/${r.id}`).json(r);
};
exports.listarReservas = async (req, res) => {
  const f = validar(esqListaRes, req.query);
  lista(res, f, await service.listarReservas({ ...f, offset: offset(f) }, req.usuario));
};
exports.obtenerReserva = async (req, res) => res.json(await service.obtenerReserva(idRuta(req.params.reservaId, 'reservaId'), req.usuario));
exports.modificarReserva = async (req, res) =>
  res.json(await service.modificarReserva(idRuta(req.params.reservaId, 'reservaId'), validar(esqModificar, req.body), req.usuario));
exports.entregar = async (req, res) => {
  const p = await service.entregar(validar(esqEntrega, req.body), req.usuario);
  res.status(201).location(`/api/v1/prestamos/${p.id}`).json(p);
};
exports.obtenerPrestamo = async (req, res) => res.json(await service.obtenerPrestamo(idRuta(req.params.prestamoId, 'prestamoId'), req.usuario));
exports.devolver = async (req, res) =>
  res.json(await service.devolver(idRuta(req.params.prestamoId, 'prestamoId'), validar(esqDevolucion, req.body), req.usuario, req));
exports.registrarIncidencia = async (req, res) => {
  const i = await service.registrarIncidencia(validar(esqIncidencia, req.body), req.usuario);
  res.status(201).location(`/api/v1/incidencias/${i.id}`).json(i);
};
exports.listarIncidencias = async (req, res) => {
  const f = validar(esqListaInc, req.query);
  lista(res, f, await service.listarIncidencias({ ...f, offset: offset(f) }, req.usuario));
};

// Interno: datos crudos para Reportes
exports.datosReportes = async (req, res) => {
  const f = validar(z.object({ desde: fechaIso, hasta: fechaIso, laboratorioIds: z.string().regex(/^\d+(,\d+)*$/, 'Lista de ids separada por comas').optional() }), req.query);
  res.json(await repo.datosReportes({ desde: f.desde, hasta: f.hasta, laboratorioIds: f.laboratorioIds ? f.laboratorioIds.split(',').map(Number) : null }));
};
