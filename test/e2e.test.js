// Pruebas de integración de punta a punta: levantan Gateway + 5 servicios en el mismo proceso
// (puertos 4xxx) contra las bases reales de PostgreSQL y llaman a la API como lo haría un cliente.
const P = { gateway: 4080, usuarios: 4001, inventario: 4002, reservas: 4003, notificaciones: 4004, reportes: 4005 };
for (const [k, v] of Object.entries(P)) {
  process.env['PORT_' + k.toUpperCase()] = String(v);
  if (k !== 'gateway') process.env['URL_' + k.toUpperCase()] = `http://localhost:${v}`;
}
process.env.TAREAS = 'off';
process.env.LIMITE_SESIONES_MIN = '10000';
process.env.LIMITE_GENERAL_MIN = '100000';
process.env.TIMEOUT_LLAMADAS_MS = '1500';
process.env.BCRYPT_RONDAS = '4';

const request = require('supertest');
const { Pool } = require('pg');
const config = require('../shared/config');

const servidores = {};
let api; let pool; let gw;
const SERVICIOS = ['usuarios', 'inventario', 'notificaciones', 'reservas', 'reportes'];
const arrancar = async (n) => { servidores[n] = await require(`../services/${n}/src/index.js`).arrancar(); };
const detener = (n) => new Promise((r) => { servidores[n].closeAllConnections(); servidores[n].close(r); });

beforeAll(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  for (const n of SERVICIOS) await arrancar(n);
  gw = await require('../gateway/src/index.js').arrancar();
  api = request(`http://localhost:${P.gateway}`);
  pool = new Pool({ ...config.bd, database: config.bd.nombres.reservas });
});
afterAll(async () => {
  gw.closeAllConnections(); await new Promise((r) => gw.close(r));
  for (const n of SERVICIOS) await new Promise((r) => { servidores[n].closeAllConnections(); servidores[n].close(r); });
  await pool.end();
});

// ---------- ayudantes ----------
const B = '/api/v1';
const unico = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
async function login(correo, contrasena = 'Prestalab123') {
  const r = await api.post(`${B}/sesiones`).send({ correo, contrasena });
  return r.body.tokenAcceso;
}
async function nuevoUsuario(rol = 'alumno') {
  const correo = `u${unico()}@prueba.mx`;
  const r = await api.post(`${B}/usuarios`).send({ nombre: 'Usuario de prueba', correo, matricula: 'T' + unico().slice(0, 8), contrasena: 'Prestalab123', rol });
  expect(r.status).toBe(201);
  return { id: r.body.id, token: await login(correo), correo };
}
const bearer = (t) => ({ authorization: `Bearer ${t}` });
let tokens = {};
let reloj = 0;
// Horario único y futuro para no chocar entre pruebas (Date.now() + desplazamiento creciente)
function horario(horasDesdeAhora = 48, duracionH = 1) {
  const i = new Date(Date.now() + (horasDesdeAhora + (reloj++) * 3) * 3600e3); i.setMinutes(0, 0, 0);
  return { inicio: i.toISOString(), fin: new Date(i.getTime() + duracionH * 3600e3).toISOString() };
}
async function nuevoRecurso(extra = {}) {
  const r = await api.post(`${B}/recursos`).set(bearer(tokens.enc1))
    .send({ nombre: 'Recurso de prueba', codigoInventario: 'T-' + unico(), categoriaId: 1, laboratorioId: 1, ...extra });
  expect(r.status).toBe(201);
  return r.body;
}
const reservar = (token, recursoId, h, extra = {}) => api.post(`${B}/reservas`).set(bearer(token)).send({ recursoId, ...h, ...extra });
const esperarNotif = async (token, tipo) => {
  for (let i = 0; i < 20; i++) {
    const r = await api.get(`${B}/notificaciones`).set(bearer(token));
    const n = r.body.data.find((x) => x.tipo === tipo);
    if (n) return n;
    await new Promise((x) => setTimeout(x, 100));
  }
  return null;
};

beforeAll(async () => {
  tokens.admin = await login('admin@prestalab.mx');
  tokens.enc1 = await login('encargado1@prestalab.mx');
  tokens.enc2 = await login('encargado2@prestalab.mx');
  tokens.docente = await login('docente@prestalab.mx');
});

// ---------- RF-01 autenticación ----------
describe('RF-01 registro e inicio de sesión', () => {
  test('registra un alumno y nunca devuelve la contraseña', async () => {
    const correo = `a${unico()}@prueba.mx`;
    const r = await api.post(`${B}/usuarios`).send({ nombre: 'Prueba Uno', correo, matricula: '123', contrasena: 'Prestalab123' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ correo, rol: 'alumno', estado: 'activo' });
    expect(JSON.stringify(r.body)).not.toMatch(/contrasena|hash/i);
    expect(r.headers.location).toMatch(/\/api\/v1\/usuarios\/\d+/);
  });
  test('correo repetido -> 409 CORREO_REPETIDO', async () => {
    const u = await nuevoUsuario();
    const r = await api.post(`${B}/usuarios`).send({ nombre: 'Otra Persona', correo: u.correo, matricula: '9', contrasena: 'Prestalab123' });
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('CORREO_REPETIDO');
  });
  test('no se puede auto-registrar como administrador', async () => {
    const r = await api.post(`${B}/usuarios`).send({ nombre: 'Hacker', correo: `h${unico()}@x.mx`, matricula: '1', contrasena: 'Prestalab123', rol: 'administrador' });
    expect(r.status).toBe(400);
  });
  test('validación: campos faltantes y contraseña corta -> 400 con detalles', async () => {
    const r = await api.post(`${B}/usuarios`).send({ nombre: 'Ab', correo: 'no-es-correo', contrasena: '123' });
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('VALIDACION_FALLIDA');
    const campos = r.body.error.detalles.map((d) => d.campo);
    expect(campos).toEqual(expect.arrayContaining(['nombre', 'correo', 'matricula', 'contrasena']));
  });
  test('inicio de sesión correcto entrega JWT con expiración', async () => {
    const r = await api.post(`${B}/sesiones`).send({ correo: 'alumno1@prestalab.mx', contrasena: 'Prestalab123' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ tipo: 'Bearer', expiraEn: 3600, usuario: { rol: 'alumno' } });
  });
  test('credenciales incorrectas -> 401 sin revelar si falló el correo o la contraseña', async () => {
    const a = await api.post(`${B}/sesiones`).send({ correo: 'alumno1@prestalab.mx', contrasena: 'incorrecta' });
    const b = await api.post(`${B}/sesiones`).send({ correo: 'noexiste@prestalab.mx', contrasena: 'incorrecta' });
    expect(a.status).toBe(401); expect(b.status).toBe(401);
    expect(a.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
    expect(a.body.error.mensaje).toBe(b.body.error.mensaje);
  });
  test('JSON roto -> 400 JSON_INVALIDO', async () => {
    const r = await api.post(`${B}/sesiones`).set('content-type', 'application/json').send('{roto');
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('JSON_INVALIDO');
  });
});

// ---------- Gateway / seguridad ----------
describe('Gateway y seguridad (RNF)', () => {
  test('sin token -> 401 TOKEN_INVALIDO con formato de error completo', async () => {
    const r = await api.get(`${B}/recursos`);
    expect(r.status).toBe(401);
    expect(r.body.error).toMatchObject({ codigo: 'TOKEN_INVALIDO', ruta: '/api/v1/recursos' });
    expect(r.body.error.idPeticion).toMatch(/^req-/);
    expect(r.headers['x-request-id']).toBe(r.body.error.idPeticion);
  });
  test('token alterado -> 401', async () => {
    const r = await api.get(`${B}/recursos`).set(bearer(tokens.admin.slice(0, -3) + 'abc'));
    expect(r.status).toBe(401);
  });
  test('el cliente no puede falsificar su identidad con encabezados X-User-*', async () => {
    const u = await nuevoUsuario();
    const r = await api.get(`${B}/usuarios`).set(bearer(u.token)).set('x-user-id', '1').set('x-user-rol', 'administrador');
    expect(r.status).toBe(403);
  });
  test('las rutas internas no se publican en el Gateway', async () => {
    const r = await api.get('/internal/v1/usuarios/1/estado').set(bearer(tokens.admin));
    expect(r.status).toBe(404);
  });
  test('ruta inexistente -> 404 con formato de error', async () => {
    const r = await api.get(`${B}/cosas`).set(bearer(tokens.admin));
    expect(r.status).toBe(404);
    expect(r.body.error.codigo).toBe('NO_ENCONTRADO');
  });
  test('un servicio no responde sin el token interno', async () => {
    const r = await request(`http://localhost:${P.inventario}`).get('/api/v1/recursos');
    expect(r.status).toBe(401);
  });
  test('límite de peticiones en el inicio de sesión -> 429', async () => {
    config.limites.sesionesPorMinuto = 3;
    const srv = await new Promise((r) => { const s = require('../gateway/src/app').crearGateway().listen(0, () => r(s)); });
    const otro = request(`http://localhost:${srv.address().port}`);
    const codigos = [];
    for (let i = 0; i < 5; i++) codigos.push((await otro.post(`${B}/sesiones`).send({ correo: 'x@x.mx', contrasena: 'y' })).status);
    expect(codigos.filter((c) => c === 429).length).toBeGreaterThanOrEqual(2);
    const r = await otro.post(`${B}/sesiones`).send({ correo: 'x@x.mx', contrasena: 'y' });
    expect(r.body.error.codigo).toBe('DEMASIADAS_PETICIONES');
    config.limites.sesionesPorMinuto = 10000;
    srv.closeAllConnections(); await new Promise((r) => srv.close(r));
  });
  test('el health del Gateway reporta el estado de los servicios', async () => {
    const r = await api.get('/health');
    expect(r.status).toBe(200);
    expect(r.body.servicios).toMatchObject({ usuarios: 'ok', inventario: 'ok', reservas: 'ok' });
  });
});

// ---------- RF-02 gestión de usuarios ----------
describe('RF-02 usuarios y roles', () => {
  test('solo el administrador lista usuarios; con paginación', async () => {
    const u = await nuevoUsuario();
    expect((await api.get(`${B}/usuarios`).set(bearer(u.token))).status).toBe(403);
    const r = await api.get(`${B}/usuarios?page=1&limit=2`).set(bearer(tokens.admin));
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(2);
    expect(r.body.meta).toMatchObject({ page: 1, limit: 2 });
    expect(r.body.meta.total).toBeGreaterThanOrEqual(6);
  });
  test('limit mayor a 100 -> 400', async () => {
    expect((await api.get(`${B}/usuarios?limit=500`).set(bearer(tokens.admin))).status).toBe(400);
  });
  test('un usuario consulta el suyo pero no el de otro', async () => {
    const a = await nuevoUsuario(); const b = await nuevoUsuario();
    expect((await api.get(`${B}/usuarios/${a.id}`).set(bearer(a.token))).status).toBe(200);
    expect((await api.get(`${B}/usuarios/${b.id}`).set(bearer(a.token))).status).toBe(403);
    expect((await api.get(`${B}/usuarios/999999`).set(bearer(tokens.admin))).status).toBe(404);
    expect((await api.get(`${B}/usuarios/abc`).set(bearer(tokens.admin))).status).toBe(400);
  });
  test('el administrador cambia rol y estado; un alumno no puede subirse el rol', async () => {
    const u = await nuevoUsuario();
    const intento = await api.patch(`${B}/usuarios/${u.id}`).set(bearer(u.token)).send({ rol: 'administrador' });
    expect(intento.status).toBe(403);
    const nombre = await api.patch(`${B}/usuarios/${u.id}`).set(bearer(u.token)).send({ nombre: 'Nuevo Nombre' });
    expect(nombre.status).toBe(200); expect(nombre.body.nombre).toBe('Nuevo Nombre');
    const r = await api.patch(`${B}/usuarios/${u.id}`).set(bearer(tokens.admin)).send({ rol: 'docente' });
    expect(r.status).toBe(200); expect(r.body.rol).toBe('docente');
    expect((await api.patch(`${B}/usuarios/${u.id}`).set(bearer(tokens.admin)).send({})).status).toBe(400);
  });
});

// ---------- RF-03 inventario ----------
describe('RF-03 inventario (CRUD completo)', () => {
  test('laboratorios: crear, listar, consultar y reemplazar (solo administrador)', async () => {
    const nombre = 'Lab ' + unico();
    expect((await api.post(`${B}/laboratorios`).set(bearer(tokens.enc1)).send({ nombre, ubicacion: 'X' })).status).toBe(403);
    const c = await api.post(`${B}/laboratorios`).set(bearer(tokens.admin)).send({ nombre, ubicacion: 'Edificio C' });
    expect(c.status).toBe(201);
    expect((await api.post(`${B}/laboratorios`).set(bearer(tokens.admin)).send({ nombre, ubicacion: 'Otro' })).status).toBe(409);
    expect((await api.get(`${B}/laboratorios/${c.body.id}`).set(bearer(tokens.docente))).body.nombre).toBe(nombre);
    const p = await api.put(`${B}/laboratorios/${c.body.id}`).set(bearer(tokens.admin)).send({ nombre: nombre + ' B', ubicacion: 'Edificio D' });
    expect(p.status).toBe(200); expect(p.body.ubicacion).toBe('Edificio D');
    expect((await api.get(`${B}/laboratorios?limit=1`).set(bearer(tokens.docente))).body.data).toHaveLength(1);
    expect((await api.put(`${B}/laboratorios/99999`).set(bearer(tokens.admin)).send({ nombre: 'z', ubicacion: 'z' })).status).toBe(404);
  });
  test('categorías: crear y filtrar por tipo', async () => {
    const c = await api.post(`${B}/categorias`).set(bearer(tokens.admin)).send({ nombre: 'Cat ' + unico(), tipo: 'espacio' });
    expect(c.status).toBe(201);
    const l = await api.get(`${B}/categorias?tipo=espacio`).set(bearer(tokens.docente));
    expect(l.body.data.every((x) => x.tipo === 'espacio')).toBe(true);
    expect((await api.post(`${B}/categorias`).set(bearer(tokens.admin)).send({ nombre: 'x', tipo: 'otro' })).status).toBe(400);
  });
  test('recursos: crear, código repetido, consultar, reemplazar, estado y baja lógica', async () => {
    const r = await nuevoRecurso();
    expect(r).toMatchObject({ estado: 'activo', laboratorioId: 1 });
    const dup = await api.post(`${B}/recursos`).set(bearer(tokens.enc1)).send({ nombre: 'Otro', codigoInventario: r.codigoInventario, categoriaId: 1, laboratorioId: 1 });
    expect(dup.status).toBe(409); expect(dup.body.error.codigo).toBe('CODIGO_INVENTARIO_REPETIDO');
    expect((await api.get(`${B}/recursos/${r.id}`).set(bearer(tokens.docente))).status).toBe(200);
    const put = await api.put(`${B}/recursos/${r.id}`).set(bearer(tokens.enc1)).send({ nombre: 'Renombrado', codigoInventario: r.codigoInventario, categoriaId: 1, laboratorioId: 1, descripcion: 'd' });
    expect(put.body.nombre).toBe('Renombrado');
    const est = await api.patch(`${B}/recursos/${r.id}`).set(bearer(tokens.enc1)).send({ estado: 'mantenimiento' });
    expect(est.body.estado).toBe('mantenimiento');
    expect((await api.patch(`${B}/recursos/${r.id}`).set(bearer(tokens.enc1)).send({ estado: 'roto' })).status).toBe(400);
    expect((await api.delete(`${B}/recursos/${r.id}`).set(bearer(tokens.enc1))).status).toBe(204);
    expect((await api.get(`${B}/recursos/${r.id}`).set(bearer(tokens.enc1))).body.estado).toBe('baja');
    expect((await api.delete(`${B}/recursos/${r.id}`).set(bearer(tokens.enc1))).status).toBe(409);
    expect((await api.get(`${B}/recursos/999999`).set(bearer(tokens.enc1))).status).toBe(404);
  });
  test('el encargado solo administra su laboratorio; los alumnos no administran', async () => {
    const fuera = await api.post(`${B}/recursos`).set(bearer(tokens.enc2)).send({ nombre: 'x', codigoInventario: 'T-' + unico(), categoriaId: 1, laboratorioId: 1 });
    expect(fuera.status).toBe(403);
    const u = await nuevoUsuario();
    expect((await api.post(`${B}/recursos`).set(bearer(u.token)).send({ nombre: 'x', codigoInventario: 'T-' + unico(), categoriaId: 1, laboratorioId: 1 })).status).toBe(403);
    const mal = await api.post(`${B}/recursos`).set(bearer(tokens.admin)).send({ nombre: 'x', codigoInventario: 'T-' + unico(), categoriaId: 9999, laboratorioId: 1 });
    expect(mal.status).toBe(422);
  });
  test('filtros y búsqueda de recursos', async () => {
    const r = await api.get(`${B}/recursos?laboratorioId=3&tipo=equipo&estado=activo&q=osciloscopio`).set(bearer(tokens.docente));
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeGreaterThanOrEqual(2);
    expect(r.body.data.every((x) => x.laboratorioId === 3 && /osciloscopio/i.test(x.nombre))).toBe(true);
  });
});

// ---------- RF-04, RF-05 reservas ----------
describe('RF-04 disponibilidad y RF-05 reservas', () => {
  test('disponibilidad excluye lo ocupado y lo que no está activo', async () => {
    const u = await nuevoUsuario(); const h = horario();
    const ocupado = await nuevoRecurso({ nombre: 'Ocupado ' + unico() });
    const enMant = await nuevoRecurso({ nombre: 'Mant ' + unico() });
    await api.patch(`${B}/recursos/${enMant.id}`).set(bearer(tokens.enc1)).send({ estado: 'mantenimiento' });
    expect((await reservar(u.token, ocupado.id, h)).status).toBe(201);
    const r = await api.get(`${B}/disponibilidad`).query({ ...h, laboratorioId: 1, limit: 100 }).set(bearer(u.token));
    expect(r.status).toBe(200);
    const ids = r.body.data.map((x) => x.recursoId);
    expect(ids).not.toContain(ocupado.id); expect(ids).not.toContain(enMant.id);
    expect(ids).toContain(1);
    expect((await api.get(`${B}/disponibilidad`).query({ inicio: h.fin, fin: h.inicio }).set(bearer(u.token))).status).toBe(400);
    expect((await api.get(`${B}/disponibilidad`).set(bearer(u.token))).status).toBe(400);
  });
  test('crear reserva -> 201, Location y notificación de confirmación', async () => {
    const u = await nuevoUsuario(); const rec = await nuevoRecurso();
    const r = await reservar(u.token, rec.id, horario());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ usuarioId: u.id, recursoId: rec.id, estado: 'confirmada' });
    expect(r.headers.location).toBe(`/api/v1/reservas/${r.body.id}`);
    const n = await esperarNotif(u.token, 'confirmacion');
    expect(n).toMatchObject({ leida: false, estadoEnvio: 'enviada' });
    const marcada = await api.patch(`${B}/notificaciones/${n.id}`).set(bearer(u.token)).send({ leida: true });
    expect(marcada.body.leida).toBe(true);
    const otro = await nuevoUsuario();
    expect((await api.patch(`${B}/notificaciones/${n.id}`).set(bearer(otro.token)).send({ leida: true })).status).toBe(403);
    expect((await api.get(`${B}/notificaciones?leida=false`).set(bearer(u.token))).body.data.every((x) => !x.leida)).toBe(true);
  });
  test('validaciones: sin campos, fin antes de inicio, fecha pasada, recurso inexistente', async () => {
    const u = await nuevoUsuario(); const rec = await nuevoRecurso(); const h = horario();
    expect((await api.post(`${B}/reservas`).set(bearer(u.token)).send({ recursoId: rec.id, inicio: h.inicio })).status).toBe(400);
    expect((await reservar(u.token, rec.id, { inicio: h.fin, fin: h.inicio })).status).toBe(400);
    const pasado = new Date(Date.now() - 7200e3).toISOString();
    expect((await reservar(u.token, rec.id, { inicio: pasado, fin: new Date(Date.now() - 3600e3).toISOString() })).status).toBe(400);
    expect((await reservar(u.token, 999999, h)).status).toBe(404);
  });
  test('traslape -> 409 RESERVA_TRASLAPADA, pero un horario contiguo sí se permite', async () => {
    const a = await nuevoUsuario(); const b = await nuevoUsuario(); const rec = await nuevoRecurso(); const h = horario(60, 2);
    expect((await reservar(a.token, rec.id, h)).status).toBe(201);
    const t = await reservar(b.token, rec.id, h);
    expect(t.status).toBe(409); expect(t.body.error.codigo).toBe('RESERVA_TRASLAPADA');
    const parcial = new Date(new Date(h.inicio).getTime() + 3600e3).toISOString();
    expect((await reservar(b.token, rec.id, { inicio: parcial, fin: new Date(new Date(h.fin).getTime() + 3600e3).toISOString() })).status).toBe(409);
    expect((await reservar(b.token, rec.id, { inicio: h.fin, fin: new Date(new Date(h.fin).getTime() + 3600e3).toISOString() })).status).toBe(201);
  });
  test('concurrencia: 8 peticiones simultáneas al mismo horario -> exactamente una reserva', async () => {
    const rec = await nuevoRecurso(); const h = horario(80);
    const us = await Promise.all(Array.from({ length: 8 }, () => nuevoUsuario()));
    const rs = await Promise.all(us.map((u) => reservar(u.token, rec.id, h)));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(7);
  });
  test('límite de reservas por rol (alumno 2) -> 422 LIMITE_RESERVAS_EXCEDIDO', async () => {
    const u = await nuevoUsuario(); const rec = await nuevoRecurso();
    expect((await reservar(u.token, rec.id, horario())).status).toBe(201);
    expect((await reservar(u.token, rec.id, horario())).status).toBe(201);
    const t = await reservar(u.token, rec.id, horario());
    expect(t.status).toBe(422); expect(t.body.error.codigo).toBe('LIMITE_RESERVAS_EXCEDIDO');
  });
  test('recurso en mantenimiento -> 422 RECURSO_NO_RESERVABLE', async () => {
    const u = await nuevoUsuario(); const rec = await nuevoRecurso();
    await api.patch(`${B}/recursos/${rec.id}`).set(bearer(tokens.enc1)).send({ estado: 'mantenimiento' });
    const r = await reservar(u.token, rec.id, horario());
    expect(r.status).toBe(422); expect(r.body.error.codigo).toBe('RECURSO_NO_RESERVABLE');
  });
  test('usuario bloqueado -> 422 USUARIO_SANCIONADO', async () => {
    const u = await nuevoUsuario(); const rec = await nuevoRecurso();
    await api.patch(`${B}/usuarios/${u.id}`).set(bearer(tokens.admin)).send({ estado: 'bloqueado' });
    const r = await reservar(u.token, rec.id, horario());
    expect(r.status).toBe(422); expect(r.body.error.codigo).toBe('USUARIO_SANCIONADO');
  });
  test('roles: el administrador no reserva; el encargado reserva en mostrador solo en su laboratorio', async () => {
    const u = await nuevoUsuario(); const rec = await nuevoRecurso();
    expect((await reservar(tokens.admin, rec.id, horario())).status).toBe(403);
    const ok = await reservar(tokens.enc1, rec.id, horario(), { usuarioId: u.id });
    expect(ok.status).toBe(201); expect(ok.body.usuarioId).toBe(u.id);
    expect((await reservar(tokens.enc2, rec.id, horario())).status).toBe(403);
    const otro = await nuevoUsuario();
    expect((await reservar(u.token, rec.id, horario(), { usuarioId: otro.id })).status).toBe(403);
  });
  test('consultar, listar con filtros y control de acceso', async () => {
    const a = await nuevoUsuario(); const b = await nuevoUsuario(); const rec = await nuevoRecurso();
    const r = (await reservar(a.token, rec.id, horario())).body;
    expect((await api.get(`${B}/reservas/${r.id}`).set(bearer(a.token))).status).toBe(200);
    expect((await api.get(`${B}/reservas/${r.id}`).set(bearer(b.token))).status).toBe(403);
    expect((await api.get(`${B}/reservas/${r.id}`).set(bearer(tokens.enc1))).status).toBe(200);
    expect((await api.get(`${B}/reservas/${r.id}`).set(bearer(tokens.enc2))).status).toBe(403);
    expect((await api.get(`${B}/reservas/999999`).set(bearer(tokens.admin))).status).toBe(404);
    const lista = await api.get(`${B}/reservas?estado=confirmada`).set(bearer(a.token));
    expect(lista.body.data.map((x) => x.id)).toEqual([r.id]);
    expect((await api.get(`${B}/reservas?usuarioId=${a.id}`).set(bearer(b.token))).status).toBe(403);
    const admin = await api.get(`${B}/reservas?recursoId=${rec.id}`).set(bearer(tokens.admin));
    expect(admin.body.meta.total).toBe(1);
    expect((await api.get(`${B}/reservas?estado=inventado`).set(bearer(tokens.admin))).status).toBe(400);
  });
  test('modificar horario y cancelar; reglas de plazo y estado', async () => {
    const u = await nuevoUsuario(); const rec = await nuevoRecurso(); const h = horario();
    const r = (await reservar(u.token, rec.id, h)).body;
    const nuevo = horario(100);
    const m = await api.patch(`${B}/reservas/${r.id}`).set(bearer(u.token)).send(nuevo);
    expect(m.status).toBe(200); expect(new Date(m.body.inicio).toISOString()).toBe(nuevo.inicio);
    const c = await api.patch(`${B}/reservas/${r.id}`).set(bearer(u.token)).send({ estado: 'cancelada' });
    expect(c.body.estado).toBe('cancelada');
    const de_nuevo = await api.patch(`${B}/reservas/${r.id}`).set(bearer(u.token)).send({ estado: 'cancelada' });
    expect(de_nuevo.status).toBe(409); expect(de_nuevo.body.error.codigo).toBe('ESTADO_INCOMPATIBLE');
    // el horario liberado queda disponible otra vez
    expect((await reservar((await nuevoUsuario()).token, rec.id, nuevo)).status).toBe(201);
    // fuera de plazo: faltan menos de 60 min
    const cerca = { inicio: new Date(Date.now() + 30 * 60e3).toISOString(), fin: new Date(Date.now() + 90 * 60e3).toISOString() };
    const rc = (await reservar(u.token, rec.id, cerca)).body;
    const tarde = await api.patch(`${B}/reservas/${rc.id}`).set(bearer(u.token)).send({ estado: 'cancelada' });
    expect(tarde.status).toBe(422); expect(tarde.body.error.codigo).toBe('FUERA_DE_PLAZO');
    expect((await api.patch(`${B}/reservas/${rc.id}`).set(bearer(u.token)).send({})).status).toBe(400);
  });
  test('modificar a un horario ocupado -> 409', async () => {
    const a = await nuevoUsuario(); const b = await nuevoUsuario(); const rec = await nuevoRecurso();
    const h1 = horario(); const h2 = horario();
    await reservar(a.token, rec.id, h1);
    const r2 = (await reservar(b.token, rec.id, h2)).body;
    expect((await api.patch(`${B}/reservas/${r2.id}`).set(bearer(b.token)).send(h1)).status).toBe(409);
  });
});

// ---------- RF-06, RF-07 préstamos, incidencias y sanciones ----------
describe('RF-06 entrega y devolución, RF-07 incidencias y sanción', () => {
  const cercana = () => ({ inicio: new Date(Date.now() + 5 * 60e3).toISOString(), fin: new Date(Date.now() + 65 * 60e3).toISOString() });

  test('flujo correcto: reservar -> entregar -> devolver sin efectos', async () => {
    const u = await nuevoUsuario(); const rec = await nuevoRecurso();
    const res = (await reservar(u.token, rec.id, cercana())).body;
    expect((await api.post(`${B}/prestamos`).set(bearer(u.token)).send({ reservaId: res.id })).status).toBe(403);
    expect((await api.post(`${B}/prestamos`).set(bearer(tokens.enc2)).send({ reservaId: res.id })).status).toBe(403);
    const e = await api.post(`${B}/prestamos`).set(bearer(tokens.enc1)).send({ reservaId: res.id, observaciones: 'Con cargador' });
    expect(e.status).toBe(201);
    expect((await api.get(`${B}/reservas/${res.id}`).set(bearer(u.token))).body.estado).toBe('en_curso');
    expect((await api.post(`${B}/prestamos`).set(bearer(tokens.enc1)).send({ reservaId: res.id })).status).toBe(409);
    expect((await api.get(`${B}/prestamos/${e.body.id}`).set(bearer(u.token))).status).toBe(200);
    expect((await api.get(`${B}/prestamos/${e.body.id}`).set(bearer((await nuevoUsuario()).token))).status).toBe(403);
    const d = await api.patch(`${B}/prestamos/${e.body.id}`).set(bearer(tokens.enc1)).send({ estadoDevolucion: 'correcto' });
    expect(d.status).toBe(200);
    expect(d.body.efectos).toEqual({ retraso: false, incidenciasCreadas: [], recursoEstado: 'activo' });
    expect((await api.get(`${B}/reservas/${res.id}`).set(bearer(u.token))).body.estado).toBe('finalizada');
    expect((await api.patch(`${B}/prestamos/${e.body.id}`).set(bearer(tokens.enc1)).send({ estadoDevolucion: 'correcto' })).status).toBe(409);
  });
  test('entregar con reserva lejana o inexistente', async () => {
    const u = await nuevoUsuario(); const rec = await nuevoRecurso();
    const lejana = (await reservar(u.token, rec.id, horario())).body;
    const r = await api.post(`${B}/prestamos`).set(bearer(tokens.enc1)).send({ reservaId: lejana.id });
    expect(r.status).toBe(422); expect(r.body.error.codigo).toBe('FUERA_DE_PLAZO');
    expect((await api.post(`${B}/prestamos`).set(bearer(tokens.enc1)).send({ reservaId: 999999 })).status).toBe(404);
    expect((await api.post(`${B}/prestamos`).set(bearer(tokens.enc1)).send({})).status).toBe(400);
  });
  test('devolución dañada: incidencia, recurso a mantenimiento y ya no se puede reservar', async () => {
    const u = await nuevoUsuario(); const rec = await nuevoRecurso();
    const res = (await reservar(u.token, rec.id, cercana())).body;
    const e = (await api.post(`${B}/prestamos`).set(bearer(tokens.enc1)).send({ reservaId: res.id })).body;
    const d = await api.patch(`${B}/prestamos/${e.id}`).set(bearer(tokens.enc1)).send({ estadoDevolucion: 'danado', observaciones: 'Pantalla rota' });
    expect(d.status).toBe(200);
    expect(d.body.efectos.recursoEstado).toBe('mantenimiento');
    expect(d.body.efectos.incidenciasCreadas).toHaveLength(1);
    expect((await api.get(`${B}/recursos/${rec.id}`).set(bearer(u.token))).body.estado).toBe('mantenimiento');
    expect((await reservar(u.token, rec.id, horario())).body.error.codigo).toBe('RECURSO_NO_RESERVABLE');
    const inc = await api.get(`${B}/incidencias?tipo=dano&recursoId=${rec.id}`).set(bearer(tokens.enc1));
    expect(inc.body.data).toHaveLength(1);
    expect(inc.body.data[0]).toMatchObject({ tipo: 'dano', descripcion: 'Pantalla rota', estado: 'abierta' });
    expect((await api.get(`${B}/incidencias`).set(bearer(tokens.enc2))).body.data.find((x) => x.recursoId === rec.id)).toBeUndefined();
    expect((await api.get(`${B}/incidencias`).set(bearer(u.token))).status).toBe(403);
  });
  test('devolución incompleta genera incidencia de faltante sin mantenimiento', async () => {
    const u = await nuevoUsuario(); const rec = await nuevoRecurso();
    const res = (await reservar(u.token, rec.id, cercana())).body;
    const e = (await api.post(`${B}/prestamos`).set(bearer(tokens.enc1)).send({ reservaId: res.id })).body;
    const d = await api.patch(`${B}/prestamos/${e.id}`).set(bearer(tokens.enc1)).send({ estadoDevolucion: 'incompleto' });
    expect(d.body.efectos).toMatchObject({ recursoEstado: 'activo', retraso: false });
    expect((await api.get(`${B}/incidencias?tipo=faltante&recursoId=${rec.id}`).set(bearer(tokens.admin))).body.data).toHaveLength(1);
    expect((await api.patch(`${B}/prestamos/${e.id}`).set(bearer(tokens.enc1)).send({ estadoDevolucion: 'correcto' })).status).toBe(409);
    expect((await api.patch(`${B}/prestamos/${e.id}`).set(bearer(tokens.enc1)).send({ estadoDevolucion: 'roto' })).status).toBe(400);
  });
  test('devolución tardía: incidencia de retraso, sanción automática, bloqueo y notificación', async () => {
    const u = await nuevoUsuario(); const rec = await nuevoRecurso();
    const res = (await reservar(u.token, rec.id, cercana())).body;
    const e = (await api.post(`${B}/prestamos`).set(bearer(tokens.enc1)).send({ reservaId: res.id })).body;
    // se simula que la reserva terminó hace una hora
    await pool.query(`UPDATE reservas SET inicio = now() - interval '2 hours', fin = now() - interval '1 hour' WHERE id = $1`, [res.id]);
    const d = await api.patch(`${B}/prestamos/${e.id}`).set(bearer(tokens.enc1)).send({ estadoDevolucion: 'correcto' });
    expect(d.status).toBe(200);
    expect(d.body.efectos.retraso).toBe(true);
    expect(d.body.efectos.sancionCreada).toBeGreaterThan(0);
    expect(d.body.efectos.incidenciasCreadas).toHaveLength(1);
    const sanc = await api.get(`${B}/usuarios/${u.id}/sanciones`).set(bearer(u.token));
    expect(sanc.body.data).toHaveLength(1);
    expect(sanc.body.data[0].prestamoId).toBe(e.id);
    expect((await api.get(`${B}/usuarios/${u.id}/sanciones`).set(bearer((await nuevoUsuario()).token))).status).toBe(403);
    const intento = await reservar(u.token, rec.id, horario());
    expect(intento.status).toBe(422); expect(intento.body.error.codigo).toBe('USUARIO_SANCIONADO');
    expect(await esperarNotif(u.token, 'retraso')).toBeTruthy();
    expect((await api.get(`${B}/incidencias?tipo=retraso&recursoId=${rec.id}`).set(bearer(tokens.enc1))).body.data).toHaveLength(1);
  });
  test('incidencia manual del encargado', async () => {
    const u = await nuevoUsuario(); const rec = await nuevoRecurso();
    const res = (await reservar(u.token, rec.id, cercana())).body;
    const e = (await api.post(`${B}/prestamos`).set(bearer(tokens.enc1)).send({ reservaId: res.id })).body;
    const ok = await api.post(`${B}/incidencias`).set(bearer(tokens.enc1)).send({ prestamoId: e.id, tipo: 'faltante', descripcion: 'Falta el mouse' });
    expect(ok.status).toBe(201); expect(ok.body.recursoId).toBe(rec.id);
    expect((await api.post(`${B}/incidencias`).set(bearer(tokens.enc2)).send({ prestamoId: e.id, tipo: 'faltante', descripcion: 'x' })).status).toBe(403);
    expect((await api.post(`${B}/incidencias`).set(bearer(tokens.enc1)).send({ prestamoId: 999999, tipo: 'dano', descripcion: 'x' })).status).toBe(404);
    expect((await api.post(`${B}/incidencias`).set(bearer(tokens.enc1)).send({ prestamoId: e.id, tipo: 'otro', descripcion: 'x' })).status).toBe(400);
  });
  test('tarea programada: cancela las reservas no presentadas y envía recordatorios', async () => {
    const u = await nuevoUsuario(); const rec = await nuevoRecurso();
    const res = (await reservar(u.token, rec.id, cercana())).body;
    await pool.query(`UPDATE reservas SET recordatorio_enviado = false WHERE id = $1`, [res.id]);
    const t = await require('../services/reservas/src/service').ejecutarTareas();
    expect(t.recordatorios).toBeGreaterThanOrEqual(1);
    expect(await esperarNotif(u.token, 'recordatorio')).toBeTruthy();
    await pool.query(`UPDATE reservas SET inicio = now() - interval '2 hours', fin = now() - interval '1 hour' WHERE id = $1`, [res.id]);
    const t2 = await require('../services/reservas/src/service').ejecutarTareas();
    expect(t2.canceladas).toBeGreaterThanOrEqual(1);
    expect((await api.get(`${B}/reservas/${res.id}`).set(bearer(u.token))).body.estado).toBe('cancelada');
  });
});

// ---------- RF-10 reportes ----------
describe('RF-10 reportes', () => {
  const rango = '?desde=2020-01-01T00:00:00Z&hasta=2035-01-01T00:00:00Z';
  test('uso, ocupación y retrasos con datos reales', async () => {
    const uso = await api.get(`${B}/reportes/uso${rango}`).set(bearer(tokens.admin));
    expect(uso.status).toBe(200);
    expect(uso.body.recursos.length).toBeGreaterThan(5);
    expect(uso.body.recursos[0].totalPrestamos).toBeGreaterThanOrEqual(1);
    const ocu = await api.get(`${B}/reportes/ocupacion${rango}`).set(bearer(tokens.admin));
    expect(ocu.body.laboratorios.length).toBeGreaterThanOrEqual(3);
    expect(ocu.body.laboratorios.every((l) => l.porcentajeOcupacion >= 0 && l.porcentajeOcupacion <= 100)).toBe(true);
    const ret = await api.get(`${B}/reportes/retrasos${rango}`).set(bearer(tokens.admin));
    expect(ret.body.totalRetrasos).toBeGreaterThanOrEqual(1);
    expect(ret.body.retrasos[0].minutosRetraso).toBeGreaterThan(15);
    expect(ret.body.totalIncidencias).toBeGreaterThanOrEqual(ret.body.totalRetrasos);
  });
  test('el encargado solo ve su laboratorio y no puede pedir otro', async () => {
    const r = await api.get(`${B}/reportes/ocupacion${rango}`).set(bearer(tokens.enc2));
    expect(r.body.laboratorios.map((l) => l.laboratorioId)).toEqual([3]);
    expect((await api.get(`${B}/reportes/uso${rango}&laboratorioId=1`).set(bearer(tokens.enc2))).status).toBe(403);
  });
  test('validaciones y permisos', async () => {
    expect((await api.get(`${B}/reportes/uso`).set(bearer(tokens.admin))).status).toBe(400);
    expect((await api.get(`${B}/reportes/uso?desde=2026-02-01T00:00:00Z&hasta=2026-01-01T00:00:00Z`).set(bearer(tokens.admin))).status).toBe(400);
    expect((await api.get(`${B}/reportes/uso${rango}`).set(bearer((await nuevoUsuario()).token))).status).toBe(403);
  });
});

// ---------- RNF tolerancia a fallos ----------
describe('RNF tolerancia a fallos', () => {
  test('si Notificaciones cae, las reservas siguen funcionando (dependencia no bloqueante)', async () => {
    await detener('notificaciones');
    try {
      const u = await nuevoUsuario(); const rec = await nuevoRecurso();
      const r = await reservar(u.token, rec.id, horario());
      expect(r.status).toBe(201);
      expect((await api.get(`${B}/notificaciones`).set(bearer(u.token))).status).toBe(503);
    } finally { await arrancar('notificaciones'); }
  });
  test('si Inventario cae: crear reserva y disponibilidad responden 503; el resto del sistema sigue', async () => {
    const u = await nuevoUsuario(); const rec = await nuevoRecurso();
    await detener('inventario');
    try {
      const r = await reservar(u.token, rec.id, horario());
      expect(r.status).toBe(503); expect(r.body.error.codigo).toBe('SERVICIO_NO_DISPONIBLE');
      expect((await api.get(`${B}/disponibilidad`).query(horario()).set(bearer(u.token))).status).toBe(503);
      const g = await api.get(`${B}/recursos`).set(bearer(u.token));
      expect(g.status).toBe(503); expect(g.body.error.codigo).toBe('SERVICIO_NO_DISPONIBLE');
      expect((await api.get(`${B}/reservas`).set(bearer(u.token))).status).toBe(200);
      expect((await api.get(`${B}/reportes/uso?desde=2020-01-01T00:00:00Z&hasta=2035-01-01T00:00:00Z`).set(bearer(tokens.admin))).status).toBe(503);
      expect((await api.get('/health')).status).toBe(503);
    } finally { await arrancar('inventario'); }
    expect((await reservar(u.token, rec.id, horario())).status).toBe(201);
  });
  test('si Inventario cae durante una devolución dañada, se revierte todo (503) y se puede reintentar', async () => {
    const u = await nuevoUsuario(); const rec = await nuevoRecurso();
    const h = { inicio: new Date(Date.now() + 5 * 60e3).toISOString(), fin: new Date(Date.now() + 65 * 60e3).toISOString() };
    const res = (await reservar(u.token, rec.id, h)).body;
    const e = (await api.post(`${B}/prestamos`).set(bearer(tokens.enc1)).send({ reservaId: res.id })).body;
    await detener('inventario');
    try {
      const d = await api.patch(`${B}/prestamos/${e.id}`).set(bearer(tokens.enc1)).send({ estadoDevolucion: 'danado' });
      expect(d.status).toBe(503);
      const p = await api.get(`${B}/prestamos/${e.id}`).set(bearer(tokens.enc1));
      expect(p.body.fechaDevolucion).toBeUndefined();            // la transacción se revirtió
      expect((await api.get(`${B}/reservas/${res.id}`).set(bearer(tokens.enc1))).body.estado).toBe('en_curso');
    } finally { await arrancar('inventario'); }
    expect((await api.patch(`${B}/prestamos/${e.id}`).set(bearer(tokens.enc1)).send({ estadoDevolucion: 'danado' })).status).toBe(200);
  });
});
