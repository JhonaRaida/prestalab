// Lógica de negocio de Inventario (RF-03).
const repo = require('./repository');
const { Errores } = require('../../../shared/errors');

const esAdmin = (a) => a.rol === 'administrador';

function traducirError(e) {
  if (e.code === '23505') {
    if (/codigo_inventario/.test(e.constraint || e.detail || '')) throw Errores.conflicto('CODIGO_INVENTARIO_REPETIDO', 'Ya existe un recurso con ese código de inventario.');
    throw Errores.conflicto('CODIGO_INVENTARIO_REPETIDO', 'Ya existe un registro con ese nombre.');
  }
  throw e;
}
const con = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { return traducirError(e); } };

// El encargado solo administra los recursos de su laboratorio.
async function verificarLaboratorio(laboratorioId, actor) {
  const lab = await repo.labPorId(laboratorioId);
  if (!lab) throw Errores.regla('LABORATORIO_NO_VALIDO', 'El laboratorio indicado no existe.');
  if (!esAdmin(actor) && lab.encargadoId !== actor.id) throw Errores.permiso('Solo puedes administrar recursos de tu laboratorio.');
  return lab;
}
async function verificarCategoria(categoriaId) {
  if (!(await repo.catPorId(categoriaId))) throw Errores.regla('CATEGORIA_NO_VALIDA', 'La categoría indicada no existe.');
}

const obtenerRecurso = async (id) => {
  const r = await repo.recursoPorId(id);
  if (!r) throw Errores.noEncontrado('El recurso');
  return r;
};

async function crearRecurso(d, actor) {
  await verificarLaboratorio(d.laboratorioId, actor);
  await verificarCategoria(d.categoriaId);
  return repo.crearRecurso(d);
}
async function reemplazarRecurso(id, d, actor) {
  const actual = await obtenerRecurso(id);
  await verificarLaboratorio(actual.laboratorioId, actor);           // debe administrar el lugar de origen
  if (d.laboratorioId !== actual.laboratorioId) await verificarLaboratorio(d.laboratorioId, actor);
  await verificarCategoria(d.categoriaId);
  return repo.reemplazarRecurso(id, d);
}
async function cambiarEstado(id, estado, actor) {
  const actual = await obtenerRecurso(id);
  await verificarLaboratorio(actual.laboratorioId, actor);
  return repo.cambiarEstado(id, estado);
}
async function darDeBaja(id, actor) {
  const actual = await obtenerRecurso(id);
  await verificarLaboratorio(actual.laboratorioId, actor);
  if (actual.estado === 'baja') throw Errores.conflicto('ESTADO_INCOMPATIBLE', 'El recurso ya está dado de baja.');
  await repo.cambiarEstado(id, 'baja');
}
async function laboratorio(id) {
  const l = await repo.labPorId(id);
  if (!l) throw Errores.noEncontrado('El laboratorio');
  return l;
}
async function reemplazarLab(id, d) {
  await laboratorio(id);
  return repo.reemplazarLab(id, d);
}

module.exports = {
  crearRecurso: con(crearRecurso), reemplazarRecurso: con(reemplazarRecurso), cambiarEstado, darDeBaja, obtenerRecurso,
  laboratorio, crearLab: con(repo.crearLab), reemplazarLab: con(reemplazarLab), crearCat: con(repo.crearCat),
};
