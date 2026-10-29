// Controladores de Usuarios: validan la entrada, llaman al servicio y arman la respuesta HTTP.
const service = require('./service');
const repo = require('./repository');
const { z, validar, idRuta, paginacion, respuestaLista, idEntero } = require('../../../shared/validar');

const esquemaRegistro = z.object({
  nombre: z.string({ required_error: 'Es obligatorio' }).trim().min(3, 'Mínimo 3 caracteres').max(120, 'Máximo 120 caracteres'),
  correo: z.string({ required_error: 'Es obligatorio' }).trim().email('Debe ser un correo válido').max(160),
  matricula: z.string({ required_error: 'Es obligatorio' }).trim().min(1, 'Es obligatorio').max(20, 'Máximo 20 caracteres'),
  contrasena: z.string({ required_error: 'Es obligatorio' }).min(8, 'Mínimo 8 caracteres').max(72, 'Máximo 72 caracteres'),
  rol: z.enum(['alumno', 'docente'], { message: 'Solo se permite alumno o docente' }).optional(),
}).strict();

const esquemaSesion = z.object({
  correo: z.string({ required_error: 'Es obligatorio' }).email('Debe ser un correo válido'),
  contrasena: z.string({ required_error: 'Es obligatorio' }).min(1, 'Es obligatoria'),
}).strict();

const esquemaActualizar = z.object({
  nombre: z.string().trim().min(3, 'Mínimo 3 caracteres').max(120).optional(),
  rol: z.enum(['alumno', 'docente', 'encargado', 'administrador'], { message: 'Rol no válido' }).optional(),
  estado: z.enum(['activo', 'bloqueado'], { message: 'Estado no válido' }).optional(),
}).strict().refine((o) => Object.keys(o).length > 0, { message: 'Envía al menos un campo a modificar' });

const esquemaLista = z.object({
  ...paginacion,
  rol: z.enum(['alumno', 'docente', 'encargado', 'administrador']).optional(),
  estado: z.enum(['activo', 'bloqueado']).optional(),
  q: z.string().max(100).optional(),
});

const offset = (p) => (p.page - 1) * p.limit;

exports.registrar = async (req, res) => {
  const u = await service.registrar(validar(esquemaRegistro, req.body));
  res.status(201).location(`/api/v1/usuarios/${u.id}`).json(u);
};
exports.iniciarSesion = async (req, res) => res.status(201).json(await service.iniciarSesion(validar(esquemaSesion, req.body)));
exports.listar = async (req, res) => {
  const f = validar(esquemaLista, req.query);
  const { filas, total } = await repo.listar({ ...f, offset: offset(f) });
  res.json(respuestaLista(filas, total, f));
};
exports.obtener = async (req, res) => res.json(await service.obtener(idRuta(req.params.usuarioId, 'usuarioId'), req.usuario));
exports.actualizar = async (req, res) =>
  res.json(await service.actualizar(idRuta(req.params.usuarioId, 'usuarioId'), validar(esquemaActualizar, req.body), req.usuario));
exports.sanciones = async (req, res) => {
  const p = validar(z.object(paginacion), req.query);
  const { filas, total } = await service.listarSanciones(idRuta(req.params.usuarioId, 'usuarioId'), req.usuario, { limit: p.limit, offset: offset(p) });
  res.json(respuestaLista(filas, total, p));
};

// Internos
exports.estadoInterno = async (req, res) => res.json(await service.estadoInterno(idRuta(req.params.usuarioId, 'usuarioId')));
exports.crearSancionInterna = async (req, res) => {
  const d = validar(z.object({
    usuarioId: idEntero, motivo: z.string().min(1).max(255),
    prestamoId: idEntero.optional(), dias: idEntero.optional(),
  }), req.body);
  res.status(201).json(await service.crearSancionInterna(d));
};
