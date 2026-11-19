// Pruebas de calidad y seguridad (Entrega 7). Complementan a e2e.test.js: cubren el checklist de seguridad,
// los casos de error y de permisos, y los defectos D-01 a D-04 encontrados y corregidos en esta entrega.
// Igual que e2e.test.js, levantan Gateway + 5 servicios en el mismo proceso (puertos 4xxx) contra PostgreSQL.
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

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const YAML = require('yaml');
const { Pool } = require('pg');
const config = require('../shared/config');

const RAIZ = path.join(__dirname, '..');
const B = '/api/v1';
const SERVICIOS = ['usuarios', 'inventario', 'notificaciones', 'reservas', 'reportes'];
const servidores = {};
let api; let gw; let poolUsuarios;
const tokens = {};

const unico = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const bearer = (t) => ({ authorization: `Bearer ${t}` });
async function login(correo, contrasena = 'Prestalab123') {
  const r = await api.post(`${B}/sesiones`).send({ correo, contrasena });
  return r.body.tokenAcceso;
}
async function nuevoUsuario(rol = 'alumno') {
  const correo = `s${unico()}@prueba.mx`;
  const r = await api.post(`${B}/usuarios`).send({ nombre: 'Usuario de seguridad', correo, matricula: 'S' + unico().slice(0, 8), contrasena: 'Prestalab123', rol });
  expect(r.status).toBe(201);
  return { id: r.body.id, correo, token: await login(correo) };
}

beforeAll(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  for (const n of SERVICIOS) servidores[n] = await require(`../services/${n}/src/index.js`).arrancar();
  gw = await require('../gateway/src/index.js').arrancar();
  api = request(`http://localhost:${P.gateway}`);
  poolUsuarios = new Pool({ ...config.bd, database: config.bd.nombres.usuarios });
  tokens.admin = await login('admin@prestalab.mx');
  tokens.enc1 = await login('encargado1@prestalab.mx');
  tokens.alumno = await login('alumno1@prestalab.mx');
});
afterAll(async () => {
  gw.closeAllConnections(); await new Promise((r) => gw.close(r));
  for (const n of SERVICIOS) { servidores[n].closeAllConnections(); await new Promise((r) => servidores[n].close(r)); }
  await poolUsuarios.end();
});

// ---------------------------------------------------------------------------------------------
describe('Checklist: contraseñas y datos sensibles', () => {
  test('ninguna contraseña está en texto plano en la base de datos (todas son hash bcrypt)', async () => {
    const { rows } = await poolUsuarios.query('SELECT correo, contrasena FROM usuarios');
    expect(rows.length).toBeGreaterThan(5);
    for (const u of rows) {
      expect(u.contrasena).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
      expect(u.contrasena).not.toBe('Prestalab123');
    }
  });
  test('un usuario recién registrado también se guarda con hash, y la API nunca lo devuelve', async () => {
    const u = await nuevoUsuario();
    const { rows } = await poolUsuarios.query('SELECT contrasena FROM usuarios WHERE id = $1', [u.id]);
    expect(rows[0].contrasena).toMatch(/^\$2[aby]\$/);
    for (const ruta of [`/usuarios/${u.id}`, '/usuarios?limit=100']) {
      const r = await api.get(B + ruta).set(bearer(tokens.admin));
      expect(JSON.stringify(r.body)).not.toMatch(/contrasena|hash|\$2[aby]\$/i);
    }
  });
  test('dos usuarios con la misma contraseña no comparten hash (sal aleatoria)', async () => {
    const a = await nuevoUsuario(); const b = await nuevoUsuario();
    const { rows } = await poolUsuarios.query('SELECT contrasena FROM usuarios WHERE id IN ($1, $2)', [a.id, b.id]);
    expect(rows[0].contrasena).not.toBe(rows[1].contrasena);
  });
});

describe('Checklist: secretos y configuración', () => {
  const archivos = () => execSync('git ls-files', { cwd: RAIZ, encoding: 'utf8' }).split('\n').filter(Boolean);

  test('el archivo .env no está versionado y está en .gitignore', () => {
    expect(archivos()).not.toContain('.env');
    expect(fs.readFileSync(path.join(RAIZ, '.gitignore'), 'utf8')).toMatch(/^\.env$/m);
    expect(fs.readFileSync(path.join(RAIZ, '.dockerignore'), 'utf8')).toMatch(/^\.env$/m);
  });
  test('.env.example solo trae valores de ejemplo para los secretos', () => {
    const ejemplo = fs.readFileSync(path.join(RAIZ, '.env.example'), 'utf8');
    expect(ejemplo).toMatch(/^JWT_SECRET=cambia-este/m);
    expect(ejemplo).toMatch(/^SERVICE_TOKEN=cambia-este/m);
  });
  test('el código fuente no contiene claves privadas ni secretos escritos a mano', () => {
    const revisables = archivos().filter((f) => /\.(js|json|ya?ml|sql|md|dot|py)$/.test(f) && !/package-lock|postman|entregas|^test\//.test(f));
    const patrones = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /AKIA[0-9A-Z]{16}/, /(?:jwt|service)[_-]?(?:secret|token)\s*[:=]\s*['"][^'"]{12,}['"]/i];
    for (const f of revisables) {
      const texto = fs.readFileSync(path.join(RAIZ, f), 'utf8');
      for (const p of patrones) expect({ f, hallazgo: p.test(texto) }).toEqual({ f, hallazgo: false });
    }
  });
  test('en producción el sistema se niega a arrancar con secretos de ejemplo, vacíos o cortos', () => {
    const { validarSecretos } = config;
    const ok = { entorno: 'production', jwtSecreto: 'a'.repeat(32), tokenServicio: 'b'.repeat(32) };
    expect(() => validarSecretos(ok)).not.toThrow();
    expect(() => validarSecretos({ ...ok, jwtSecreto: 'cambia-este-secreto-por-una-cadena-larga-y-aleatoria' })).toThrow(/JWT_SECRET/);
    expect(() => validarSecretos({ ...ok, tokenServicio: 'cambia-este-token-interno' })).toThrow(/SERVICE_TOKEN/);
    expect(() => validarSecretos({ ...ok, jwtSecreto: 'corto' })).toThrow(/JWT_SECRET/);
    expect(() => validarSecretos({ ...ok, jwtSecreto: undefined })).toThrow(/JWT_SECRET/);
    // fuera de producción (desarrollo y pruebas) se permiten los valores de relleno
    expect(() => validarSecretos({ ...ok, entorno: 'development', jwtSecreto: 'corto' })).not.toThrow();
  });
});

describe('Checklist: los endpoints protegidos verifican autenticación', () => {
  const doc = YAML.parse(fs.readFileSync(path.join(RAIZ, 'docs/openapi.yaml'), 'utf8'));
  const operaciones = [];
  for (const [ruta, metodos] of Object.entries(doc.paths)) {
    for (const [metodo, op] of Object.entries(metodos)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(metodo)) continue;
      if (Array.isArray(op.security) && op.security.length === 0) continue; // públicas: POST /sesiones y POST /usuarios
      operaciones.push([metodo.toUpperCase(), ruta]);
    }
  }
  test('el contrato documenta solo 2 operaciones públicas', () => {
    const total = Object.values(doc.paths).reduce((n, m) => n + Object.keys(m).filter((k) => ['get', 'post', 'put', 'patch', 'delete'].includes(k)).length, 0);
    expect(total - operaciones.length).toBe(2);
    expect(operaciones.length).toBeGreaterThan(30);
  });
  test.each(operaciones)('%s %s sin token -> 401', async (metodo, ruta) => {
    const r = await api[metodo.toLowerCase()](B + ruta.replace(/\{[^}]+\}/g, '1'));
    expect(r.status).toBe(401);
    expect(r.body.error.codigo).toBe('TOKEN_INVALIDO');
  });

  describe('tokens manipulados', () => {
    const codificar = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const casos = {
      'algoritmo "none"': () => `${codificar({ alg: 'none', typ: 'JWT' })}.${codificar({ sub: '1', rol: 'administrador' })}.`,
      'firmado con otro secreto': () => jwt.sign({ rol: 'administrador' }, 'otro-secreto-distinto-0123456789', { subject: '1', expiresIn: 600 }),
      'expirado': () => jwt.sign({ rol: 'administrador' }, config.jwtSecreto, { subject: '1', expiresIn: -60 }),
      'sin el esquema Bearer': () => null,
      'basura': () => 'esto.no.es-un-jwt',
    };
    test.each(Object.keys(casos))('%s -> 401', async (nombre) => {
      const t = casos[nombre]();
      const peticion = api.get(`${B}/usuarios`);
      const r = nombre === 'sin el esquema Bearer' ? await peticion.set('authorization', tokens.admin) : await peticion.set(bearer(t));
      expect(r.status).toBe(401);
    });
  });
});

describe('Checklist: los endpoints sensibles verifican autorización (403)', () => {
  // [método, ruta, cuerpo]. Un alumno no puede ejecutar ninguna de estas operaciones.
  const soloPersonal = [
    ['get', '/usuarios'], ['post', '/laboratorios', { nombre: 'x', ubicacion: 'y' }], ['put', '/laboratorios/1', { nombre: 'x', ubicacion: 'y' }],
    ['post', '/categorias', { nombre: 'x', tipo: 'equipo' }], ['post', '/recursos', { nombre: 'x', codigoInventario: 'x', categoriaId: 1, laboratorioId: 1 }],
    ['put', '/recursos/1', {}], ['patch', '/recursos/1', { estado: 'baja' }], ['delete', '/recursos/1'],
    ['post', '/prestamos', { reservaId: 1 }], ['patch', '/prestamos/1', { estadoDevolucion: 'bueno' }],
    ['post', '/incidencias', {}], ['get', '/incidencias'],
    ['get', '/reportes/uso'], ['get', '/reportes/ocupacion'], ['get', '/reportes/retrasos'],
  ];
  test.each(soloPersonal.map(([m, r, c]) => [m, r, c || {}]))('alumno: %s %s -> 403', async (metodo, ruta, cuerpo) => {
    const r = await api[metodo](B + ruta).set(bearer(tokens.alumno)).send(cuerpo);
    expect(r.status).toBe(403);
    expect(r.body.error.codigo).toBe('PERMISO_INSUFICIENTE');
  });
  test('un encargado no puede administrar usuarios ni laboratorios', async () => {
    expect((await api.get(`${B}/usuarios`).set(bearer(tokens.enc1))).status).toBe(403);
    expect((await api.post(`${B}/laboratorios`).set(bearer(tokens.enc1)).send({ nombre: 'x', ubicacion: 'y' })).status).toBe(403);
  });
  test('un alumno no ve ni modifica los datos de otro usuario', async () => {
    const otro = await nuevoUsuario();
    for (const [m, r, c] of [['get', `/usuarios/${otro.id}`], ['get', `/usuarios/${otro.id}/sanciones`], ['patch', `/usuarios/${otro.id}`, { nombre: 'Intruso' }]]) {
      expect((await api[m](B + r).set(bearer(tokens.alumno)).send(c)).status).toBe(403);
    }
  });
  test('un usuario no puede subirse el rol ni desbloquearse a sí mismo', async () => {
    const u = await nuevoUsuario();
    for (const cambio of [{ rol: 'administrador' }, { estado: 'activo' }, { rol: 'encargado' }]) {
      const r = await api.patch(`${B}/usuarios/${u.id}`).set(bearer(u.token)).send(cambio);
      expect(r.status).toBe(403);
    }
  });
});

describe('Checklist: las entradas se validan (D-01)', () => {
  const RUTAS_CON_ID = ['/recursos/', '/usuarios/', '/reservas/', '/prestamos/', '/laboratorios/'];
  test.each(RUTAS_CON_ID)('%s con un id fuera del rango INTEGER -> 400 (antes 500)', async (prefijo) => {
    for (const id of ['99999999999999999999', '2147483648', '0', '-5', '1.5', 'abc', '1e3x']) {
      const r = await api.get(B + prefijo + id).set(bearer(tokens.admin));
      expect([400, 404]).toContain(r.status);
      expect(r.status).not.toBe(500);
    }
    const r = await api.get(B + prefijo + '99999999999999999999').set(bearer(tokens.admin));
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('VALIDACION_FALLIDA');
  });
  test('el id máximo válido (2147483647) responde 404, no 500', async () => {
    const r = await api.get(`${B}/recursos/2147483647`).set(bearer(tokens.admin));
    expect(r.status).toBe(404);
  });
  test.each(['/recursos', '/usuarios', '/reservas', '/notificaciones', '/incidencias'])('%s?page desmedida o limit inválido -> 400 (antes 500)', async (ruta) => {
    for (const q of ['page=99999999999999999999', 'page=1000001', 'page=0', 'page=-1', 'page=abc', 'limit=0', 'limit=101', 'limit=1e9']) {
      const r = await api.get(`${B}${ruta}?${q}`).set(bearer(tokens.admin));
      expect({ q, status: r.status }).toEqual({ q, status: 400 });
    }
  });
  test('filtros con id fuera de rango también se rechazan', async () => {
    for (const ruta of ['/recursos?laboratorioId=99999999999999999999', '/reservas?recursoId=99999999999999999999']) {
      const r = await api.get(B + ruta).set(bearer(tokens.admin));
      expect(r.status).toBe(400);
    }
  });
  test('cuerpos con tipos incorrectos o campos extra -> 400 (no hay asignación masiva)', async () => {
    const casos = [
      [`${B}/usuarios`, { nombre: 'Intento', correo: `m${unico()}@x.mx`, matricula: '1', contrasena: 'Prestalab123', rol: 'alumno', estado: 'activo' }],
      [`${B}/usuarios`, { nombre: 123, correo: ['a@b.c'], matricula: {}, contrasena: true }],
      [`${B}/usuarios`, { nombre: 'Intento', correo: `m${unico()}@x.mx`, matricula: '1', contrasena: 'x'.repeat(73) }],
      [`${B}/sesiones`, { correo: { $ne: null }, contrasena: { $ne: null } }],
      [`${B}/sesiones`, { correo: 'alumno1@prestalab.mx', contrasena: 'Prestalab123', admin: true }],
    ];
    for (const [ruta, cuerpo] of casos) {
      const r = await api.post(ruta).send(cuerpo);
      expect({ ruta, status: r.status }).toEqual({ ruta, status: 400 });
      expect(r.body.error.codigo).toBe('VALIDACION_FALLIDA');
    }
  });
  test('cuerpo mayor a 100 KB -> 400 sin tumbar el servicio', async () => {
    const r = await api.post(`${B}/usuarios`).send({ nombre: 'x'.repeat(200 * 1024) });
    expect(r.status).toBe(400);
    expect((await api.get('/health')).status).toBe(200);
  });
  test('intentos de inyección SQL se tratan como texto (consultas parametrizadas)', async () => {
    const veneno = ["' OR '1'='1", "'; DROP TABLE usuarios; --", '%', '_', '\\', "Robert'); DROP TABLE reservas;--"];
    for (const v of veneno) {
      const a = await api.get(`${B}/usuarios`).query({ q: v }).set(bearer(tokens.admin));
      expect(a.status).toBe(200);
      const b = await api.post(`${B}/sesiones`).send({ correo: `${v}@x.mx`, contrasena: v });
      expect([400, 401]).toContain(b.status);
      const c = await api.get(`${B}/recursos`).query({ q: v, tipo: v, estado: v }).set(bearer(tokens.admin));
      expect([200, 400]).toContain(c.status);
    }
    const { rows } = await poolUsuarios.query('SELECT count(*)::int AS n FROM usuarios');
    expect(rows[0].n).toBeGreaterThan(5); // la tabla sigue existiendo
  });
});

describe('Checklist: los errores no revelan información interna', () => {
  const PROHIBIDO = /(stack|at \w+ \(|node_modules|\.js:\d+|postgres|pg_|select |insert |constraint|ECONN|invalid input syntax|out of range|prestalab123|password)/i;
  test('ninguna respuesta de error (400, 401, 403, 404, 409, 422) filtra detalles técnicos', async () => {
    const ver = [
      api.get(`${B}/recursos/99999999999999999999`).set(bearer(tokens.admin)),
      api.get(`${B}/recursos?page=abc`).set(bearer(tokens.admin)),
      api.get(`${B}/recursos`),
      api.get(`${B}/usuarios`).set(bearer(tokens.alumno)),
      api.get(`${B}/recursos/2147483647`).set(bearer(tokens.admin)),
      api.get(`${B}/no-existe`).set(bearer(tokens.admin)),
      api.get('/internal/v1/catalogo'),
      api.post(`${B}/sesiones`).set('content-type', 'application/json').send('{"roto":'),
      api.post(`${B}/sesiones`).send({ correo: 'alumno1@prestalab.mx', contrasena: 'incorrecta' }),
      api.post(`${B}/usuarios`).send({ nombre: 'Repetido', correo: 'alumno1@prestalab.mx', matricula: '1', contrasena: 'Prestalab123' }),
    ];
    for (const r of await Promise.all(ver)) {
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
      expect(JSON.stringify(r.body)).not.toMatch(PROHIBIDO);
      expect(Object.keys(r.body)).toEqual(['error']);
      expect(r.body.error).toEqual(expect.objectContaining({ codigo: expect.any(String), mensaje: expect.any(String), ruta: expect.any(String), idPeticion: expect.stringMatching(/^req-/) }));
    }
  });
  test('las respuestas no anuncian la tecnología del servidor', async () => {
    const r = await api.get(`${B}/recursos`).set(bearer(tokens.alumno));
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['strict-transport-security']).toBeDefined();
  });
});

describe('Checklist: CORS acorde al proyecto (D-03)', () => {
  const origen = 'http://app.prestalab.test';
  afterEach(() => { config.corsOrigenes.length = 0; });

  test('por defecto ningún origen externo recibe permiso CORS', async () => {
    const r = await api.get(`${B}/recursos`).set(bearer(tokens.alumno)).set('Origin', 'http://evil.example');
    expect(r.status).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });
  test('el preflight de un origen que no está en la lista no recibe ningún permiso (el navegador lo bloquea)', async () => {
    const r = await api.options(`${B}/recursos`).set('Origin', 'http://evil.example').set('Access-Control-Request-Method', 'GET');
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    expect(r.headers['access-control-allow-methods']).toBeUndefined();
  });
  test('un origen de la lista blanca (CORS_ORIGINS) recibe el permiso, solo él', async () => {
    config.corsOrigenes.push(origen);
    const pre = await api.options(`${B}/reservas`).set('Origin', origen)
      .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(pre.status).toBe(204);
    expect(pre.headers['access-control-allow-origin']).toBe(origen);
    expect(pre.headers['access-control-allow-headers']).toMatch(/Authorization/i);
    expect(pre.headers['access-control-allow-methods']).toMatch(/PATCH/);
    expect(pre.headers['access-control-allow-credentials']).toBeUndefined();
    const real = await api.get(`${B}/recursos`).set(bearer(tokens.alumno)).set('Origin', origen);
    expect(real.headers['access-control-allow-origin']).toBe(origen);
    const otro = await api.get(`${B}/recursos`).set(bearer(tokens.alumno)).set('Origin', 'http://evil.example');
    expect(otro.headers['access-control-allow-origin']).toBeUndefined();
  });
  test('nunca se refleja "*" ni se permite un origen "null"', async () => {
    config.corsOrigenes.push(origen);
    const r = await api.get(`${B}/recursos`).set(bearer(tokens.alumno)).set('Origin', 'null');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Cuentas bloqueadas (D-02)', () => {
  test('una cuenta bloqueada no puede iniciar sesión: 403 CUENTA_BLOQUEADA', async () => {
    const u = await nuevoUsuario();
    expect((await api.patch(`${B}/usuarios/${u.id}`).set(bearer(tokens.admin)).send({ estado: 'bloqueado' })).status).toBe(200);
    const r = await api.post(`${B}/sesiones`).send({ correo: u.correo, contrasena: 'Prestalab123' });
    expect(r.status).toBe(403);
    expect(r.body.error.codigo).toBe('CUENTA_BLOQUEADA');
    expect(r.body.tokenAcceso).toBeUndefined();
  });
  test('con contraseña incorrecta sigue siendo 401: no se revela el estado de la cuenta', async () => {
    const u = await nuevoUsuario();
    await api.patch(`${B}/usuarios/${u.id}`).set(bearer(tokens.admin)).send({ estado: 'bloqueado' });
    const r = await api.post(`${B}/sesiones`).send({ correo: u.correo, contrasena: 'incorrecta' });
    expect(r.status).toBe(401);
    expect(r.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
  });
  test('al desbloquearla, la cuenta vuelve a iniciar sesión', async () => {
    const u = await nuevoUsuario();
    await api.patch(`${B}/usuarios/${u.id}`).set(bearer(tokens.admin)).send({ estado: 'bloqueado' });
    await api.patch(`${B}/usuarios/${u.id}`).set(bearer(tokens.admin)).send({ estado: 'activo' });
    const r = await api.post(`${B}/sesiones`).send({ correo: u.correo, contrasena: 'Prestalab123' });
    expect(r.status).toBe(201);
  });
});

describe('Concurrencia', () => {
  test('30 inicios de sesión simultáneos se atienden todos, cada uno con su token', async () => {
    const rs = await Promise.all(Array.from({ length: 30 }, () => api.post(`${B}/sesiones`).send({ correo: 'alumno1@prestalab.mx', contrasena: 'Prestalab123' })));
    expect(rs.every((r) => r.status === 201)).toBe(true);
    for (const r of rs) expect(r.body.tokenAcceso).toBeTruthy();
  });
  test('30 registros simultáneos con el mismo correo: solo uno se crea, el resto 409 (no hay 500)', async () => {
    const correo = `c${unico()}@prueba.mx`;
    const rs = await Promise.all(Array.from({ length: 30 }, () =>
      api.post(`${B}/usuarios`).send({ nombre: 'Carrera', correo, matricula: '1', contrasena: 'Prestalab123' })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(29);
    expect(rs.some((r) => r.status >= 500)).toBe(false);
  });
  test('200 lecturas simultáneas de GET /recursos responden 200', async () => {
    const rs = await Promise.all(Array.from({ length: 200 }, () => api.get(`${B}/recursos?limit=20`).set(bearer(tokens.alumno))));
    expect(rs.filter((r) => r.status !== 200)).toHaveLength(0);
  });
});
