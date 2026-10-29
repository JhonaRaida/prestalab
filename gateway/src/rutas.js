// Tabla de enrutamiento del Gateway: primer segmento de /api/v1/<segmento> -> servicio.
const ENRUTAMIENTO = {
  sesiones: 'usuarios', usuarios: 'usuarios',
  laboratorios: 'inventario', categorias: 'inventario', recursos: 'inventario',
  disponibilidad: 'reservas', reservas: 'reservas', prestamos: 'reservas', incidencias: 'reservas',
  notificaciones: 'notificaciones', reportes: 'reportes',
};
// Rutas públicas (no requieren token)
const esPublica = (metodo, ruta) =>
  metodo === 'POST' && (ruta === '/api/v1/sesiones' || ruta === '/api/v1/usuarios');

function servicioDe(ruta) {
  const m = /^\/api\/v1\/([^/?]+)/.exec(ruta);
  return m ? ENRUTAMIENTO[m[1]] : undefined;
}
module.exports = { ENRUTAMIENTO, esPublica, servicioDe };
