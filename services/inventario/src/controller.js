const service = require('./service');
const repo = require('./repository');
const { z, validar, idRuta, idEntero, paginacion, respuestaLista } = require('../../../shared/validar');

const TIPO = z.enum(['equipo', 'espacio'], { message: 'Debe ser equipo o espacio' });
const ESTADO = z.enum(['activo', 'mantenimiento', 'baja'], { message: 'Debe ser activo, mantenimiento o baja' });
const texto = (max, req = 'Es obligatorio') => z.string({ required_error: req }).trim().min(1, req).max(max, `Máximo ${max} caracteres`);

const esqLab = z.object({ nombre: texto(120), ubicacion: texto(160), encargadoId: idEntero.optional() }).strict();
const esqCat = z.object({ nombre: texto(80), tipo: TIPO }).strict();
const esqRec = z.object({
  nombre: texto(120), codigoInventario: texto(40), categoriaId: idEntero, laboratorioId: idEntero,
  descripcion: z.string().max(500).optional(),
}).strict();
const esqEstado = z.object({ estado: ESTADO }).strict();
const esqPag = z.object(paginacion);
const esqRecursos = z.object({
  ...paginacion, laboratorioId: idEntero.optional(), categoriaId: idEntero.optional(),
  tipo: TIPO.optional(), estado: ESTADO.optional(), q: z.string().max(100).optional(),
});
const offset = (p) => (p.page - 1) * p.limit;
const lista = async (res, f, fn) => { const { filas, total } = await fn({ ...f, offset: offset(f) }); res.json(respuestaLista(filas, total, f)); };

exports.listarLabs = async (req, res) => lista(res, validar(esqPag, req.query), repo.listarLabs);
exports.crearLab = async (req, res) => {
  const l = await service.crearLab(validar(esqLab, req.body));
  res.status(201).location(`/api/v1/laboratorios/${l.id}`).json(l);
};
exports.obtenerLab = async (req, res) => res.json(await service.laboratorio(idRuta(req.params.laboratorioId, 'laboratorioId')));
exports.reemplazarLab = async (req, res) =>
  res.json(await service.reemplazarLab(idRuta(req.params.laboratorioId, 'laboratorioId'), validar(esqLab, req.body)));

exports.listarCats = async (req, res) => lista(res, validar(esqPag.extend({ tipo: TIPO.optional() }), req.query), repo.listarCats);
exports.crearCat = async (req, res) => {
  const c = await service.crearCat(validar(esqCat, req.body));
  res.status(201).location(`/api/v1/categorias/${c.id}`).json(c);
};

exports.listarRecursos = async (req, res) => lista(res, validar(esqRecursos, req.query), repo.listarRecursos);
exports.crearRecurso = async (req, res) => {
  const r = await service.crearRecurso(validar(esqRec, req.body), req.usuario);
  res.status(201).location(`/api/v1/recursos/${r.id}`).json(r);
};
exports.obtenerRecurso = async (req, res) => res.json(await service.obtenerRecurso(idRuta(req.params.recursoId, 'recursoId')));
exports.reemplazarRecurso = async (req, res) =>
  res.json(await service.reemplazarRecurso(idRuta(req.params.recursoId, 'recursoId'), validar(esqRec, req.body), req.usuario));
exports.cambiarEstado = async (req, res) =>
  res.json(await service.cambiarEstado(idRuta(req.params.recursoId, 'recursoId'), validar(esqEstado, req.body).estado, req.usuario));
exports.darDeBaja = async (req, res) => { await service.darDeBaja(idRuta(req.params.recursoId, 'recursoId'), req.usuario); res.status(204).end(); };

// Internos
exports.estadoInterno = async (req, res) =>
  res.json(await service.cambiarEstado(idRuta(req.params.recursoId, 'recursoId'), validar(esqEstado, req.body).estado, { rol: 'administrador' }));
exports.catalogo = async (req, res) => res.json(await repo.catalogo());
