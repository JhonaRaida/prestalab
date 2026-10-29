// Reportes (RF-10): solo lectura y sin base de datos propia. Combina datos de Reservas e Inventario.
const config = require('../../../shared/config');
const { Errores } = require('../../../shared/errors');
const { llamar } = require('../../../shared/http');

const HORA = 3600 * 1000;
const redondear = (n) => Math.round(n * 100) / 100;

async function obtenerDatos({ desde, hasta, laboratorioId }, actor, req) {
  const cat = await llamar('inventario', '/internal/v1/catalogo', { req, nombre: 'Inventario' });
  if (!cat.ok) throw Errores.servicioCaido('Inventario');
  let labs = cat.datos.laboratorios;
  // El encargado solo ve su laboratorio
  if (actor.rol === 'encargado') {
    labs = labs.filter((l) => l.encargadoId === actor.id);
    if (laboratorioId && !labs.some((l) => l.id === laboratorioId)) throw Errores.permiso('Solo puedes consultar reportes de tu laboratorio.');
  }
  if (laboratorioId) labs = labs.filter((l) => l.id === laboratorioId);
  if (!labs.length) return { labs: [], recursos: [], reservas: [], prestamos: [], incidencias: [] };
  const ids = labs.map((l) => l.id);
  const qs = new URLSearchParams({ desde, hasta, laboratorioIds: ids.join(',') });
  const d = await llamar('reservas', `/internal/v1/reportes/datos?${qs}`, { req, nombre: 'Reservas' });
  if (!d.ok) throw Errores.servicioCaido('Reservas');
  return { labs, recursos: cat.datos.recursos.filter((r) => ids.includes(r.laboratorioId)), ...d.datos };
}

async function uso(f, actor, req) {
  const d = await obtenerDatos(f, actor, req);
  const filas = d.recursos.map((r) => {
    const ps = d.prestamos.filter((p) => p.recursoId === r.id);
    const horas = ps.reduce((s, p) => {
      const fin = p.fechaDevolucion ? new Date(p.fechaDevolucion) : new Date(p.finReserva);
      return s + Math.max(0, fin - new Date(p.fechaEntrega)) / HORA;
    }, 0);
    return { recursoId: r.id, nombre: r.nombre, totalPrestamos: ps.length, horasUso: redondear(horas) };
  }).sort((a, b) => b.totalPrestamos - a.totalPrestamos || b.horasUso - a.horasUso);
  return { desde: f.desde, hasta: f.hasta, recursos: filas };
}

// Ocupación = horas reservadas dentro del periodo / (recursos activos x horas operativas por día x días del periodo)
async function ocupacion(f, actor, req) {
  const d = await obtenerDatos(f, actor, req);
  const ini = new Date(f.desde).getTime(); const fin = new Date(f.hasta).getTime();
  const dias = Math.max(1, Math.ceil((fin - ini) / (24 * HORA)));
  const laboratorios = d.labs.map((l) => {
    const recs = d.recursos.filter((r) => r.laboratorioId === l.id && r.estado !== 'baja').length;
    const capacidad = recs * config.reglas.horarioHoras * dias;
    const reservadas = d.reservas.filter((r) => r.laboratorioId === l.id).reduce((s, r) => {
      const a = Math.max(ini, new Date(r.inicio).getTime()); const b = Math.min(fin, new Date(r.fin).getTime());
      return s + Math.max(0, b - a) / HORA;
    }, 0);
    return { laboratorioId: l.id, nombre: l.nombre, porcentajeOcupacion: capacidad ? redondear(Math.min(100, (reservadas / capacidad) * 100)) : 0 };
  });
  return { desde: f.desde, hasta: f.hasta, laboratorios };
}

async function retrasos(f, actor, req) {
  const d = await obtenerDatos(f, actor, req);
  const tol = config.reglas.toleranciaMinutos * 60000;
  const lista = d.prestamos.filter((p) => p.fechaDevolucion && new Date(p.fechaDevolucion) - new Date(p.finReserva) > tol)
    .map((p) => ({ prestamoId: p.id, usuarioId: p.usuarioId, minutosRetraso: Math.floor((new Date(p.fechaDevolucion) - new Date(p.finReserva)) / 60000) }));
  return { desde: f.desde, hasta: f.hasta, totalRetrasos: lista.length, totalIncidencias: d.incidencias.length, retrasos: lista };
}

module.exports = { uso, ocupacion, retrasos };
