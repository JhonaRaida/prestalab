// Evidencias de la Entrega 5: ejecuta los CRUD de Recursos y Reservas contra el Gateway
// y guarda cada petición con su respuesta real. Uso (con el sistema corriendo):
//   npm run evidencias              -> entregas/entrega-5/evidencias/evidencias-crud.json
const fs = require('fs');
const BASE = `http://localhost:${process.env.PORT_GATEWAY || 8080}/api/v1`;
const OUT = process.argv[2] || require('path').join(__dirname, '..', 'entregas', 'entrega-5', 'evidencias', 'evidencias-crud.json');
const pasos = [];

async function llamar(id, titulo, metodo, ruta, token, cuerpo) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cuerpo) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + ruta, { method: metodo, headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const txt = await r.text();
  let json = null; try { json = txt ? JSON.parse(txt) : null; } catch { json = txt; }
  pasos.push({ id, titulo, metodo, ruta: '/api/v1' + ruta, rol: token ? undefined : 'sin token', cuerpo: cuerpo || null, status: r.status, respuesta: json });
  return { status: r.status, json };
}
const login = async (correo) => (await llamar(null, null, 'POST', '/sesiones', null, { correo, contrasena: 'Prestalab123' })).json.tokenAcceso;

(async () => {
  const enc = await login('encargado1@prestalab.mx');
  const alu = await login('alumno1@prestalab.mx');
  pasos.length = 0;                      // los logins no son parte de la evidencia
  const marca = Date.now().toString().slice(-5);

  // ---------- CRUD 1: Recursos (Inventario) ----------
  const c = await llamar('R1', 'Crear un recurso', 'POST', '/recursos', enc,
    { nombre: 'Osciloscopio digital', codigoInventario: `EV5-${marca}`, categoriaId: 1, laboratorioId: 1, descripcion: 'Alta para la evidencia de la Entrega 5' });
  const rid = c.json.id;
  await llamar('R2', 'Consultar varios recursos (con filtros y paginación)', 'GET', '/recursos?laboratorioId=1&page=1&limit=3', enc);
  await llamar('R3', 'Consultar un recurso', 'GET', `/recursos/${rid}`, enc);
  await llamar('R4', 'Modificar un recurso (PUT)', 'PUT', `/recursos/${rid}`, enc,
    { nombre: 'Osciloscopio digital 100 MHz', codigoInventario: `EV5-${marca}`, categoriaId: 1, laboratorioId: 1, descripcion: 'Datos corregidos' });
  await llamar('R5', 'Modificar el estado (PATCH)', 'PATCH', `/recursos/${rid}`, enc, { estado: 'mantenimiento' });
  await llamar('R6', 'Eliminar (dar de baja) el recurso', 'DELETE', `/recursos/${rid}`, enc);
  await llamar('R7', 'Comprobar la baja', 'GET', `/recursos/${rid}`, enc);
  await llamar('R8', 'Error de validación: faltan campos', 'POST', '/recursos', enc, { nombre: 'x' });
  await llamar('R9', 'Recurso inexistente', 'GET', '/recursos/999999', enc);

  // ---------- CRUD 2: Reservas ----------
  const dia = 86400000;
  const h = (d) => { const t = new Date(Date.now() + d * dia); t.setMinutes(0, 0, 0); return t; };
  const ini = h(3), fin = new Date(ini.getTime() + 3600000);
  const disp = await (await fetch(`${BASE}/disponibilidad?inicio=${ini.toISOString()}&fin=${fin.toISOString()}&laboratorioId=1&limit=100`,
    { headers: { Authorization: `Bearer ${alu}` } })).json();
  const lista = disp.data || disp;
  const libre = (Array.isArray(lista) ? lista : []).find((x) => x.disponible !== false);
  if (!libre) throw new Error('Sin recurso libre: ' + JSON.stringify(disp).slice(0, 300));
  const v = await llamar('V1', 'Crear una reserva', 'POST', '/reservas', alu,
    { recursoId: libre.recursoId || libre.id, inicio: ini.toISOString(), fin: fin.toISOString() });
  const vid = v.json.id;
  await llamar('V2', 'Consultar varias reservas (historial)', 'GET', '/reservas?page=1&limit=3', alu);
  await llamar('V3', 'Consultar una reserva', 'GET', `/reservas/${vid}`, alu);
  const ini2 = h(4), fin2 = new Date(ini2.getTime() + 2 * 3600000);
  await llamar('V4', 'Modificar el horario', 'PATCH', `/reservas/${vid}`, alu, { inicio: ini2.toISOString(), fin: fin2.toISOString() });
  await llamar('V5', 'Eliminar (cancelar) la reserva', 'PATCH', `/reservas/${vid}`, alu, { estado: 'cancelada' });
  await llamar('V6', 'Comprobar la cancelación', 'GET', `/reservas/${vid}`, alu);
  await llamar('V7', 'Error de validación: falta "fin"', 'POST', '/reservas', alu, { recursoId: libre.recursoId || libre.id, inicio: ini.toISOString() });
  await llamar('V8', 'Reserva inexistente', 'GET', '/reservas/999999', alu);

  // ---------- Errores transversales ----------
  await llamar('X1', 'Ruta inexistente', 'GET', '/cosas', alu);
  await llamar('X2', 'Petición sin token', 'GET', '/recursos', null);

  fs.writeFileSync(OUT, JSON.stringify({ fecha: new Date().toISOString(), recursoId: rid, reservaId: vid, pasos }, null, 2));
  for (const p of pasos) console.log(p.id, p.metodo, p.ruta, '→', p.status);
})().catch((e) => { console.error(e); process.exit(1); });
