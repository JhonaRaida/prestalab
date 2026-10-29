// Reglas de negocio de Reservas y Préstamos (RF-04, RF-05, RF-06, RF-07, RF-09).
const repo = require('./repository');
const config = require('../../../shared/config');
const { Errores } = require('../../../shared/errors');
const { transaccion } = require('../../../shared/db');
const { llamar } = require('../../../shared/http');

const R = config.reglas;
const MIN = 60 * 1000;
const esAdmin = (a) => a.rol === 'administrador';
const esPersonal = (a) => a.rol === 'encargado' || a.rol === 'administrador';

// ---------- utilidades ----------
const ahora = () => new Date();

// Dueño de la reserva, encargado de su laboratorio o administrador.
function puedeVerReserva(r, a) {
  return esAdmin(a) || r.usuarioId === a.id || (a.rol === 'encargado' && r.encargadoId === a.id);
}
// Solo el encargado del laboratorio o el administrador pueden operar préstamos.
function exigirEncargadoDe(r, a) {
  if (esAdmin(a)) return;
  if (a.rol === 'encargado' && r.encargadoId === a.id) return;
  throw Errores.permiso('Solo el encargado del laboratorio puede realizar esta operación.');
}

// Notificar nunca bloquea ni falla la operación principal (la dependencia es "no bloqueante").
function notificar(req, usuarioId, tipo, mensaje) {
  llamar('notificaciones', '/internal/v1/notificaciones', { metodo: 'POST', cuerpo: { usuarioId, tipo, mensaje }, req, nombre: 'Notificaciones' })
    .catch((e) => console.warn(`[reservas] no se pudo notificar (${e.codigo || e.message})`));
}

const fmt = (d) => new Date(d).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' });

async function obtenerRecursoRemoto(recursoId, req) {
  const r = await llamar('inventario', `/api/v1/recursos/${recursoId}`, { req, nombre: 'Inventario' });
  if (r.status === 404) throw Errores.noEncontrado('El recurso');
  if (!r.ok) throw Errores.servicioCaido('Inventario');
  return r.datos;
}

async function estadoUsuarioRemoto(usuarioId, req) {
  const r = await llamar('usuarios', `/internal/v1/usuarios/${usuarioId}/estado`, { req, nombre: 'Usuarios' });
  if (r.status === 404) throw Errores.noEncontrado('El usuario');
  if (!r.ok) throw Errores.servicioCaido('Usuarios');
  return r.datos;
}

function validarHorario(inicio, fin) {
  const i = new Date(inicio); const f = new Date(fin);
  if (f <= i) throw Errores.validacion([{ campo: 'fin', problema: 'Debe ser posterior al inicio' }]);
  if (i <= ahora()) throw Errores.validacion([{ campo: 'inicio', problema: 'Debe ser una fecha futura' }]);
}

function traducirTraslape(e) {
  if (e.code === '23P01') throw Errores.conflicto('RESERVA_TRASLAPADA', 'El recurso ya está reservado en ese horario.');
  throw e;
}

// ---------- disponibilidad (RF-04) ----------
async function disponibilidad({ inicio, fin, tipo, laboratorioId, categoriaId, page, limit }, req) {
  const i = new Date(inicio); const f = new Date(fin);
  if (f <= i) throw Errores.validacion([{ campo: 'fin', problema: 'Debe ser posterior al inicio' }]);
  // 1) catálogo de recursos activos desde Inventario
  const candidatos = [];
  for (let p = 1; p <= 20; p++) {
    const qs = new URLSearchParams({ estado: 'activo', limit: '100', page: String(p) });
    if (tipo) qs.set('tipo', tipo);
    if (laboratorioId) qs.set('laboratorioId', laboratorioId);
    if (categoriaId) qs.set('categoriaId', categoriaId);
    const r = await llamar('inventario', `/api/v1/recursos?${qs}`, { req, nombre: 'Inventario' });
    if (!r.ok) throw Errores.servicioCaido('Inventario');
    candidatos.push(...r.datos.data);
    if (candidatos.length >= r.datos.meta.total) break;
  }
  // 2) quitar los ocupados en ese horario
  const ocupados = await repo.recursosOcupados(i, f);
  const libres = candidatos.filter((x) => !ocupados.has(x.id)).map((x) => ({
    recursoId: x.id, nombre: x.nombre, tipo: x.tipo, laboratorioId: x.laboratorioId, inicio: i.toISOString(), fin: f.toISOString(),
  }));
  return { filas: libres.slice((page - 1) * limit, page * limit), total: libres.length };
}

// ---------- reservas (RF-05) ----------
async function crearReserva(datos, actor, req) {
  let usuarioId = actor.id;
  if (datos.usuarioId !== undefined && datos.usuarioId !== actor.id) {
    if (actor.rol !== 'encargado') throw Errores.permiso('Solo el encargado puede reservar a nombre de otro usuario.');
    usuarioId = datos.usuarioId;
  }
  validarHorario(datos.inicio, datos.fin);

  const recurso = await obtenerRecursoRemoto(datos.recursoId, req);
  if (recurso.estado !== 'activo') throw Errores.regla('RECURSO_NO_RESERVABLE', 'El recurso no está disponible para reservarse (mantenimiento o baja).');
  if (actor.rol === 'encargado' && recurso.encargadoId !== actor.id) throw Errores.permiso('Solo puedes reservar en mostrador recursos de tu laboratorio.');

  const u = await estadoUsuarioRemoto(usuarioId, req);
  if (u.estado === 'bloqueado' || u.sancionVigente) {
    throw Errores.regla('USUARIO_SANCIONADO', 'El usuario tiene una sanción vigente y no puede reservar.');
  }

  const reserva = await transaccion(repo.pool, async (db) => {
    await repo.bloquearUsuario(db, usuarioId);       // evita que dos peticiones simultáneas rebasen el límite
    const limite = R.limiteReservas[u.rol] || 2;
    if ((await repo.contarVigentes(db, usuarioId)) >= limite) {
      throw Errores.regla('LIMITE_RESERVAS_EXCEDIDO', `Alcanzaste el límite de ${limite} reservas vigentes para tu rol.`);
    }
    try {
      return await repo.crearReserva(db, {
        usuarioId, recursoId: recurso.id, laboratorioId: recurso.laboratorioId, encargadoId: recurso.encargadoId,
        inicio: datos.inicio, fin: datos.fin,
      });
    } catch (e) { return traducirTraslape(e); }
  });

  notificar(req, usuarioId, 'confirmacion', `Tu reserva #${reserva.id} de "${recurso.nombre}" quedó confirmada para el ${fmt(reserva.inicio)}.`);
  return repo.publicaReserva(reserva);
}

async function listarReservas(f, actor) {
  const filtros = { ...f };
  if (actor.rol === 'alumno' || actor.rol === 'docente') {
    if (f.usuarioId && f.usuarioId !== actor.id) throw Errores.permiso('Solo puedes consultar tus propias reservas.');
    filtros.usuarioId = actor.id;
  } else if (actor.rol === 'encargado') {
    filtros.encargadoId = actor.id;
  }
  const { filas, total } = await repo.listarReservas(filtros);
  return { filas: filas.map(repo.publicaReserva), total };
}

async function obtenerReserva(id, actor) {
  const r = await repo.reservaPorId(repo.pool, id);
  if (!r) throw Errores.noEncontrado('La reserva');
  if (!puedeVerReserva(r, actor)) throw Errores.permiso('No tienes acceso a esta reserva.');
  return repo.publicaReserva(r);
}

async function modificarReserva(id, cambios, actor) {
  return transaccion(repo.pool, async (db) => {
    const r = await repo.reservaPorId(db, id, true);
    if (!r) throw Errores.noEncontrado('La reserva');
    if (!puedeVerReserva(r, actor)) throw Errores.permiso('No tienes acceso a esta reserva.');
    if (r.estado !== 'confirmada') throw Errores.conflicto('ESTADO_INCOMPATIBLE', `Una reserva ${r.estado.replace('_', ' ')} ya no se puede modificar.`);
    // RN: cancelar o modificar solo hasta 1 hora antes (el personal del laboratorio puede hacerlo siempre)
    if (!esPersonal(actor) && new Date(r.inicio).getTime() - ahora().getTime() < R.cancelarHorasAntes * MIN) {
      throw Errores.regla('FUERA_DE_PLAZO', 'Solo se puede cancelar o modificar hasta una hora antes del inicio.');
    }
    if (cambios.estado === 'cancelada') {
      return repo.publicaReserva(await repo.actualizarReserva(db, id, { estado: 'cancelada' }));
    }
    const inicio = cambios.inicio || r.inicio; const fin = cambios.fin || r.fin;
    validarHorario(inicio, fin);
    try { return repo.publicaReserva(await repo.actualizarReserva(db, id, { inicio, fin })); }
    catch (e) { return traducirTraslape(e); }
  });
}

// ---------- préstamos (RF-06) ----------
async function entregar({ reservaId, observaciones }, actor) {
  return transaccion(repo.pool, async (db) => {
    const r = await repo.reservaPorId(db, reservaId, true);
    if (!r) throw Errores.noEncontrado('La reserva');
    exigirEncargadoDe(r, actor);
    if (r.estado !== 'confirmada') throw Errores.conflicto('ESTADO_INCOMPATIBLE', `No se puede entregar una reserva ${r.estado.replace('_', ' ')}.`);
    const t = ahora().getTime(); const inicio = new Date(r.inicio).getTime();
    if (t < inicio - R.toleranciaMinutos * MIN || t > inicio + R.toleranciaMinutos * MIN) {
      throw Errores.regla('FUERA_DE_PLAZO', `La entrega solo se registra entre ${R.toleranciaMinutos} minutos antes y ${R.toleranciaMinutos} minutos después del inicio.`);
    }
    const p = await repo.crearPrestamo(db, { reservaId, entregadoPor: actor.id, observaciones });
    await repo.actualizarReserva(db, reservaId, { estado: 'en_curso' });
    return p;
  });
}

async function obtenerPrestamo(id, actor) {
  const p = await repo.prestamoPorId(repo.pool, id);
  if (!p) throw Errores.noEncontrado('El préstamo');
  const r = await repo.reservaPorId(repo.pool, p.reservaId);
  if (!puedeVerReserva(r, actor)) throw Errores.permiso('No tienes acceso a este préstamo.');
  return p;
}

// Devolución: actualiza préstamo y reserva, genera incidencias, pone en mantenimiento si hay daño y
// sanciona si hubo retraso. Todo en una transacción: si Inventario o Usuarios no responden, se revierte (503).
async function devolver(id, { estadoDevolucion, observaciones }, actor, req) {
  const resultado = await transaccion(repo.pool, async (db) => {
    const p = await repo.prestamoPorId(db, id, true);
    if (!p) throw Errores.noEncontrado('El préstamo');
    const r = await repo.reservaPorId(db, p.reservaId, true);
    exigirEncargadoDe(r, actor);
    if (p.fechaDevolucion) throw Errores.conflicto('ESTADO_INCOMPATIBLE', 'Este préstamo ya fue devuelto.');

    const actualizado = await repo.registrarDevolucion(db, id, { recibidoPor: actor.id, estadoDevolucion, observaciones });
    await repo.actualizarReserva(db, r.id, { estado: 'finalizada' });

    const efectos = { retraso: false, incidenciasCreadas: [], recursoEstado: 'activo' };
    const minutosTarde = Math.floor((ahora().getTime() - new Date(r.fin).getTime()) / MIN);
    efectos.retraso = minutosTarde > R.toleranciaMinutos;

    if (efectos.retraso) {
      const inc = await repo.crearIncidencia(db, { prestamoId: id, recursoId: r.recursoId, tipo: 'retraso', descripcion: `Devolución con ${minutosTarde} minutos de retraso.` });
      efectos.incidenciasCreadas.push(inc.id);
    }
    if (estadoDevolucion === 'danado' || estadoDevolucion === 'incompleto') {
      const dano = estadoDevolucion === 'danado';
      const inc = await repo.crearIncidencia(db, {
        prestamoId: id, recursoId: r.recursoId, tipo: dano ? 'dano' : 'faltante',
        descripcion: observaciones || (dano ? 'El recurso se devolvió dañado.' : 'El recurso se devolvió incompleto.'),
      });
      efectos.incidenciasCreadas.push(inc.id);
    }
    if (estadoDevolucion === 'danado') {
      const m = await llamar('inventario', `/internal/v1/recursos/${r.recursoId}`, { metodo: 'PATCH', cuerpo: { estado: 'mantenimiento' }, req, nombre: 'Inventario' });
      if (!m.ok) throw Errores.servicioCaido('Inventario');
      efectos.recursoEstado = 'mantenimiento';
    }
    if (efectos.retraso) {
      const s = await llamar('usuarios', '/internal/v1/sanciones', {
        metodo: 'POST', req, nombre: 'Usuarios',
        cuerpo: { usuarioId: r.usuarioId, motivo: `Retraso de ${minutosTarde} minutos en la devolución del préstamo #${id}`, prestamoId: id, dias: R.sancionDias },
      });
      if (!s.ok) throw Errores.servicioCaido('Usuarios');
      efectos.sancionCreada = s.datos.id;
    }
    return { prestamo: actualizado, efectos, reserva: r, minutosTarde };
  });

  if (resultado.efectos.retraso) {
    notificar(req, resultado.reserva.usuarioId, 'retraso',
      `Devolviste con ${resultado.minutosTarde} minutos de retraso. Tu cuenta queda bloqueada para reservar durante ${R.sancionDias} días.`);
  }
  return { ...resultado.prestamo, efectos: resultado.efectos };
}

// ---------- incidencias (RF-07) ----------
async function registrarIncidencia({ prestamoId, tipo, descripcion }, actor) {
  const p = await repo.prestamoPorId(repo.pool, prestamoId);
  if (!p) throw Errores.noEncontrado('El préstamo');
  const r = await repo.reservaPorId(repo.pool, p.reservaId);
  exigirEncargadoDe(r, actor);
  return repo.crearIncidencia(repo.pool, { prestamoId, recursoId: r.recursoId, tipo, descripcion });
}
async function listarIncidencias(f, actor) {
  return repo.listarIncidencias({ ...f, encargadoId: actor.rol === 'encargado' ? actor.id : undefined });
}

// ---------- tareas programadas (RF-08) ----------
async function ejecutarTareas() {
  const cancel = await repo.cancelarNoPresentados(R.toleranciaMinutos);
  const recordar = await repo.reservasParaRecordar(R.recordatorioMinutos);
  for (const r of recordar) notificar(null, r.usuarioId, 'recordatorio', `Recordatorio: tu reserva #${r.id} empieza el ${fmt(r.inicio)}.`);
  const tarde = await repo.reservasConRetraso(R.toleranciaMinutos);
  for (const r of tarde) notificar(null, r.usuarioId, 'retraso', `Tu reserva #${r.id} ya terminó y el recurso aún no se devuelve. Devuélvelo cuanto antes para evitar una sanción.`);
  return { canceladas: cancel, recordatorios: recordar.length, avisosRetraso: tarde.length };
}

module.exports = {
  disponibilidad, crearReserva, listarReservas, obtenerReserva, modificarReserva, entregar, obtenerPrestamo,
  devolver, registrarIncidencia, listarIncidencias, ejecutarTareas,
};
