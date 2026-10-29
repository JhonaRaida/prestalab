// Lógica de Notificaciones (RF-08). El envío por correo se simula con un registro en consola;
// para un envío real se sustituye `enviar` por nodemailer o un proveedor SMTP sin tocar el resto.
const repo = require('./repository');
const { Errores } = require('../../../shared/errors');

async function enviar(n) {
  console.log(`[notificaciones] (correo simulado) usuario=${n.usuarioId} tipo=${n.tipo}: ${n.mensaje}`);
  return true;
}

async function registrar({ usuarioId, tipo, mensaje }) {
  let ok = false;
  try { ok = await enviar({ usuarioId, tipo, mensaje }); } catch (_) { ok = false; }
  return repo.crear({ usuarioId, tipo, mensaje, estadoEnvio: ok ? 'enviada' : 'fallida' });
}

async function marcar(id, leida, actor) {
  const n = await repo.porId(id);
  if (!n) throw Errores.noEncontrado('La notificación');
  if (n.usuarioId !== actor.id) throw Errores.permiso('Solo puedes modificar tus propias notificaciones.');
  return repo.marcarLeida(id, leida);
}

module.exports = { registrar, marcar };
