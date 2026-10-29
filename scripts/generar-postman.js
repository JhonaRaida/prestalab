// Genera postman/PrestaLab.postman_collection.json y el entorno. Uso: node scripts/generar-postman.js
// La colección se ejecuta de arriba hacia abajo (Runner) y encadena variables: tokens, ids, fechas.
const fs = require('fs');
const path = require('path');

const items = [];
let carpeta;
const folder = (name, description) => { carpeta = { name, description, item: [] }; items.push(carpeta); };
const guion = (lines) => ({ listen: 'test', script: { type: 'text/javascript', exec: lines } });
const pre = (lines) => ({ listen: 'prerequest', script: { type: 'text/javascript', exec: lines } });

function req(name, metodo, ruta, { token, body, tests = [], pre: preLines, query, descripcion } = {}) {
  const url = {
    raw: `{{baseUrl}}${ruta}` + (query ? '?' + Object.entries(query).map(([k, v]) => `${k}=${v}`).join('&') : ''),
    host: ['{{baseUrl}}'], path: ruta.split('/').filter(Boolean),
  };
  if (query) url.query = Object.entries(query).map(([key, value]) => ({ key, value: String(value) }));
  const header = [];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (body) header.push({ key: 'Content-Type', value: 'application/json' });
  const event = [];
  if (preLines) event.push(pre(preLines));
  event.push(guion(tests));
  carpeta.item.push({
    name, event, request: {
      method: metodo, header, url, description: descripcion,
      body: body ? { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } : undefined,
    },
  });
}
const status = (n) => `pm.test('Código ${n}', () => pm.response.to.have.status(${n}));`;
const codigo = (c) => `pm.test('Error ${c}', () => pm.expect(pm.response.json().error.codigo).to.eql('${c}'));`;
const guardar = (variable, expr) => `pm.collectionVariables.set('${variable}', ${expr});`;
const fechas = (minInicio, duracionMin, offsetDias = 0) => [
  `const t0 = Date.now() + ${offsetDias} * 86400000 + ${minInicio} * 60000;`,
  `const i = new Date(t0); ${offsetDias ? 'i.setMinutes(0,0,0);' : ''}`,
  `pm.collectionVariables.set('inicio', i.toISOString());`,
  `pm.collectionVariables.set('fin', new Date(i.getTime() + ${duracionMin} * 60000).toISOString());`,
];

// ---------------------------------------------------------------------------------------------
folder('1. Autenticación', 'Cinco cuentas de demostración (contraseña Prestalab123) y un usuario nuevo registrado en cada corrida.');
const cuentas = [['alumno', 'alumno1@prestalab.mx'], ['docente', 'docente@prestalab.mx'], ['encargado', 'encargado1@prestalab.mx'], ['encargado2', 'encargado2@prestalab.mx'], ['admin', 'admin@prestalab.mx']];
for (const [v, correo] of cuentas) {
  req(`Iniciar sesión (${v})`, 'POST', '/sesiones', {
    body: { correo, contrasena: 'Prestalab123' },
    tests: [status(201), 'const r = pm.response.json();', `pm.test('Trae token Bearer', () => pm.expect(r.tokenAcceso).to.be.a('string'));`, guardar('token_' + v, 'r.tokenAcceso')],
  });
}
req('Registrar usuario nuevo (RF-01)', 'POST', '/usuarios', {
  pre: [`pm.collectionVariables.set('correoNuevo', 'nuevo' + Date.now() + '@prueba.mx');`],
  body: { nombre: 'Estudiante de Prueba', correo: '{{correoNuevo}}', matricula: '0239999', contrasena: 'Prestalab123' },
  tests: [status(201), 'const r = pm.response.json();', `pm.test('Rol alumno y sin contraseña', () => { pm.expect(r.rol).to.eql('alumno'); pm.expect(r).to.not.have.property('contrasena'); });`, guardar('usuarioNuevoId', 'r.id')],
});
req('Iniciar sesión (usuario nuevo)', 'POST', '/sesiones', {
  body: { correo: '{{correoNuevo}}', contrasena: 'Prestalab123' },
  tests: [status(201), guardar('token_nuevo', 'pm.response.json().tokenAcceso')],
});

folder('2. Usuarios', 'RF-02: consulta y gestión de usuarios');
req('Listar usuarios (administrador)', 'GET', '/usuarios', { token: 'token_admin', query: { page: 1, limit: 5 }, tests: [status(200), `pm.test('Paginado', () => { const r = pm.response.json(); pm.expect(r.data.length).to.be.at.most(5); pm.expect(r.meta).to.have.keys('page','limit','total'); });`] });
req('Listar usuarios como alumno → 403', 'GET', '/usuarios', { token: 'token_nuevo', tests: [status(403), codigo('PERMISO_INSUFICIENTE')] });
req('Consultar mi usuario', 'GET', '/usuarios/{{usuarioNuevoId}}', { token: 'token_nuevo', tests: [status(200)] });
req('Consultar usuario de otra persona → 403', 'GET', '/usuarios/1', { token: 'token_nuevo', tests: [status(403)] });
req('Cambiar mi nombre', 'PATCH', '/usuarios/{{usuarioNuevoId}}', { token: 'token_nuevo', body: { nombre: 'Estudiante Renombrado' }, tests: [status(200), `pm.test('Nombre cambiado', () => pm.expect(pm.response.json().nombre).to.eql('Estudiante Renombrado'));`] });
req('Alumno intenta subirse el rol → 403', 'PATCH', '/usuarios/{{usuarioNuevoId}}', { token: 'token_nuevo', body: { rol: 'administrador' }, tests: [status(403)] });
req('Administrador cambia estado del usuario', 'PATCH', '/usuarios/{{usuarioNuevoId}}', { token: 'token_admin', body: { estado: 'activo' }, tests: [status(200)] });
req('Consultar sanciones propias', 'GET', '/usuarios/{{usuarioNuevoId}}/sanciones', { token: 'token_nuevo', tests: [status(200)] });

folder('3. Inventario', 'RF-03: laboratorios, categorías y recursos (CRUD completo)');
req('Listar laboratorios', 'GET', '/laboratorios', { token: 'token_alumno', tests: [status(200), `pm.test('Hay laboratorios', () => pm.expect(pm.response.json().data.length).to.be.above(0));`] });
req('Crear laboratorio (administrador)', 'POST', '/laboratorios', {
  token: 'token_admin', pre: [`pm.collectionVariables.set('sufijo', String(Date.now()));`],
  body: { nombre: 'Laboratorio {{sufijo}}', ubicacion: 'Edificio C' }, tests: [status(201), guardar('laboratorioNuevoId', 'pm.response.json().id')],
});
req('Reemplazar laboratorio (PUT)', 'PUT', '/laboratorios/{{laboratorioNuevoId}}', { token: 'token_admin', body: { nombre: 'Laboratorio {{sufijo}} B', ubicacion: 'Edificio D' }, tests: [status(200)] });
req('Crear categoría', 'POST', '/categorias', { token: 'token_admin', body: { nombre: 'Categoría {{sufijo}}', tipo: 'equipo' }, tests: [status(201)] });
req('Listar categorías de espacios', 'GET', '/categorias', { token: 'token_alumno', query: { tipo: 'espacio' }, tests: [status(200)] });
req('Crear recurso (encargado)', 'POST', '/recursos', {
  token: 'token_encargado', body: { nombre: 'Laptop de prueba {{sufijo}}', codigoInventario: 'PM-{{sufijo}}', categoriaId: 1, laboratorioId: 1, descripcion: 'Creada desde Postman' },
  tests: [status(201), guardar('recursoId', 'pm.response.json().id')],
});
req('Crear recurso con código repetido → 409', 'POST', '/recursos', { token: 'token_encargado', body: { nombre: 'Otra', codigoInventario: 'PM-{{sufijo}}', categoriaId: 1, laboratorioId: 1 }, tests: [status(409), codigo('CODIGO_INVENTARIO_REPETIDO')] });
req('Crear recurso en laboratorio ajeno → 403', 'POST', '/recursos', { token: 'token_encargado2', body: { nombre: 'x', codigoInventario: 'PM-X-{{sufijo}}', categoriaId: 1, laboratorioId: 1 }, tests: [status(403)] });
req('Crear recurso sin campos → 400', 'POST', '/recursos', { token: 'token_encargado', body: { nombre: 'x' }, tests: [status(400), codigo('VALIDACION_FALLIDA'), `pm.test('Detalla los campos', () => pm.expect(pm.response.json().error.detalles.length).to.be.above(0));`] });
req('Consultar recurso', 'GET', '/recursos/{{recursoId}}', { token: 'token_alumno', tests: [status(200)] });
req('Listar y filtrar recursos', 'GET', '/recursos', { token: 'token_alumno', query: { laboratorioId: 1, tipo: 'equipo', estado: 'activo', page: 1, limit: 10 }, tests: [status(200)] });
req('Reemplazar recurso (PUT)', 'PUT', '/recursos/{{recursoId}}', { token: 'token_encargado', body: { nombre: 'Laptop renombrada', codigoInventario: 'PM-{{sufijo}}', categoriaId: 1, laboratorioId: 1, descripcion: 'Editada' }, tests: [status(200)] });
req('Recurso inexistente → 404', 'GET', '/recursos/999999', { token: 'token_alumno', tests: [status(404), codigo('NO_ENCONTRADO')] });

folder('4. Reservas', 'RF-04, RF-05, RF-09: disponibilidad y reservas con reglas de negocio');
req('Consultar disponibilidad', 'GET', '/disponibilidad', {
  token: 'token_nuevo', pre: fechas(0, 60, 3),
  query: { inicio: '{{inicio}}', fin: '{{fin}}', laboratorioId: 1, limit: 100 },
  tests: [status(200), `pm.test('El recurso nuevo aparece libre', () => pm.expect(pm.response.json().data.map(x => x.recursoId)).to.include(Number(pm.collectionVariables.get('recursoId'))));`],
});
req('Crear reserva', 'POST', '/reservas', {
  token: 'token_nuevo', body: { recursoId: '{{recursoId}}', inicio: '{{inicio}}', fin: '{{fin}}' },
  tests: [status(201), 'const r = pm.response.json();', `pm.test('Confirmada', () => pm.expect(r.estado).to.eql('confirmada'));`, guardar('reservaId', 'r.id'), `pm.test('Location', () => pm.expect(pm.response.headers.get('Location')).to.include('/reservas/'));`],
});
req('Reservar el mismo horario → 409 traslape', 'POST', '/reservas', { token: 'token_docente', body: { recursoId: '{{recursoId}}', inicio: '{{inicio}}', fin: '{{fin}}' }, tests: [status(409), codigo('RESERVA_TRASLAPADA')] });
req('Reservar sin el campo fin → 400', 'POST', '/reservas', { token: 'token_nuevo', body: { recursoId: '{{recursoId}}', inicio: '{{inicio}}' }, tests: [status(400)] });
req('Reservar con fecha pasada → 400', 'POST', '/reservas', { token: 'token_nuevo', body: { recursoId: '{{recursoId}}', inicio: '2020-01-01T10:00:00-06:00', fin: '2020-01-01T11:00:00-06:00' }, tests: [status(400)] });
req('Consultar mi reserva', 'GET', '/reservas/{{reservaId}}', { token: 'token_nuevo', tests: [status(200)] });
req('Otro alumno no ve mi reserva → 403', 'GET', '/reservas/{{reservaId}}', { token: 'token_alumno', tests: [status(403)] });
req('Historial con filtros', 'GET', '/reservas', { token: 'token_nuevo', query: { estado: 'confirmada', page: 1, limit: 10 }, tests: [status(200), `pm.test('Solo mis reservas', () => pm.response.json().data.forEach(r => pm.expect(r.usuarioId).to.eql(Number(pm.collectionVariables.get('usuarioNuevoId')))));`] });
req('Modificar horario', 'PATCH', '/reservas/{{reservaId}}', {
  token: 'token_nuevo', pre: fechas(0, 60, 4), body: { inicio: '{{inicio}}', fin: '{{fin}}' }, tests: [status(200)],
});
req('Cancelar reserva', 'PATCH', '/reservas/{{reservaId}}', { token: 'token_nuevo', body: { estado: 'cancelada' }, tests: [status(200), `pm.test('Cancelada', () => pm.expect(pm.response.json().estado).to.eql('cancelada'));`] });
req('Cancelar de nuevo → 409', 'PATCH', '/reservas/{{reservaId}}', { token: 'token_nuevo', body: { estado: 'cancelada' }, tests: [status(409), codigo('ESTADO_INCOMPATIBLE')] });

folder('5. Préstamos e incidencias', 'RF-06, RF-07: entrega, devolución, incidencias y mantenimiento');
req('Reservar para dentro de 5 minutos', 'POST', '/reservas', {
  token: 'token_nuevo', pre: [`const i = new Date(Date.now() + 5 * 60000);`, `pm.collectionVariables.set('inicio', i.toISOString());`, `pm.collectionVariables.set('fin', new Date(i.getTime() + 3600000).toISOString());`],
  body: { recursoId: '{{recursoId}}', inicio: '{{inicio}}', fin: '{{fin}}' }, tests: [status(201), guardar('reservaId', 'pm.response.json().id')],
});
req('Alumno intenta registrar entrega → 403', 'POST', '/prestamos', { token: 'token_nuevo', body: { reservaId: '{{reservaId}}' }, tests: [status(403)] });
req('Registrar entrega (encargado)', 'POST', '/prestamos', {
  token: 'token_encargado', body: { reservaId: '{{reservaId}}', observaciones: 'Entregada con cargador' },
  tests: [status(201), guardar('prestamoId', 'pm.response.json().id')],
});
req('Consultar préstamo', 'GET', '/prestamos/{{prestamoId}}', { token: 'token_nuevo', tests: [status(200)] });
req('Registrar incidencia manual', 'POST', '/incidencias', { token: 'token_encargado', body: { prestamoId: '{{prestamoId}}', tipo: 'faltante', descripcion: 'Falta el mouse' }, tests: [status(201)] });
req('Registrar devolución dañada', 'PATCH', '/prestamos/{{prestamoId}}', {
  token: 'token_encargado', body: { estadoDevolucion: 'danado', observaciones: 'Pantalla con rayones' },
  tests: [status(200), 'const e = pm.response.json().efectos;', `pm.test('Recurso a mantenimiento y con incidencia', () => { pm.expect(e.recursoEstado).to.eql('mantenimiento'); pm.expect(e.incidenciasCreadas.length).to.eql(1); });`],
});
req('Devolver de nuevo → 409', 'PATCH', '/prestamos/{{prestamoId}}', { token: 'token_encargado', body: { estadoDevolucion: 'correcto' }, tests: [status(409)] });
req('Reservar recurso en mantenimiento → 422', 'POST', '/reservas', { token: 'token_nuevo', pre: fechas(0, 60, 6), body: { recursoId: '{{recursoId}}', inicio: '{{inicio}}', fin: '{{fin}}' }, tests: [status(422), codigo('RECURSO_NO_RESERVABLE')] });
req('Listar incidencias', 'GET', '/incidencias', { token: 'token_encargado', query: { recursoId: '{{recursoId}}' }, tests: [status(200), `pm.test('Dos incidencias', () => pm.expect(pm.response.json().data.length).to.eql(2));`] });
req('Reactivar el recurso', 'PATCH', '/recursos/{{recursoId}}', { token: 'token_encargado', body: { estado: 'activo' }, tests: [status(200)] });
req('Dar de baja el recurso (DELETE)', 'DELETE', '/recursos/{{recursoId}}', { token: 'token_encargado', tests: [status(204)] });

folder('6. Notificaciones', 'RF-08');
req('Mis notificaciones', 'GET', '/notificaciones', { token: 'token_nuevo', query: { leida: 'false' }, tests: [status(200), 'const r = pm.response.json();', `pm.test('Hay confirmaciones', () => pm.expect(r.data.length).to.be.above(0));`, guardar('notificacionId', 'r.data[0].id')] });
req('Marcar como leída', 'PATCH', '/notificaciones/{{notificacionId}}', { token: 'token_nuevo', body: { leida: true }, tests: [status(200), `pm.test('Leída', () => pm.expect(pm.response.json().leida).to.eql(true));`] });
req('Marcar notificación ajena → 403', 'PATCH', '/notificaciones/{{notificacionId}}', { token: 'token_alumno', body: { leida: true }, tests: [status(403)] });

folder('7. Reportes', 'RF-10');
const rango = { desde: '2020-01-01T00:00:00Z', hasta: '2035-01-01T00:00:00Z' };
req('Reporte de uso', 'GET', '/reportes/uso', { token: 'token_admin', query: rango, tests: [status(200), `pm.test('Lista de recursos', () => pm.expect(pm.response.json().recursos).to.be.an('array'));`] });
req('Reporte de ocupación', 'GET', '/reportes/ocupacion', { token: 'token_encargado', query: rango, tests: [status(200)] });
req('Reporte de retrasos e incidencias', 'GET', '/reportes/retrasos', { token: 'token_admin', query: rango, tests: [status(200)] });
req('Reporte de otro laboratorio → 403', 'GET', '/reportes/uso', { token: 'token_encargado2', query: { ...rango, laboratorioId: 1 }, tests: [status(403)] });
req('Reporte sin fechas → 400', 'GET', '/reportes/uso', { token: 'token_admin', tests: [status(400)] });

folder('8. Errores transversales', 'Formato de error único, seguridad del Gateway');
req('Sin token → 401', 'GET', '/recursos', { tests: [status(401), codigo('TOKEN_INVALIDO'), `pm.test('Formato de error completo', () => pm.expect(pm.response.json().error).to.have.keys('codigo','mensaje','ruta','fecha','idPeticion'));`] });
req('Credenciales incorrectas → 401', 'POST', '/sesiones', { body: { correo: 'alumno1@prestalab.mx', contrasena: 'incorrecta' }, tests: [status(401), codigo('CREDENCIALES_INVALIDAS')] });
req('Ruta inexistente → 404', 'GET', '/cosas', { token: 'token_admin', tests: [status(404)] });

// ---------------------------------------------------------------------------------------------
const coleccion = {
  info: {
    name: 'PrestaLab API (Entrega 5-8)', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: 'Colección de PrestaLab. Ejecútala completa con el Runner (de arriba hacia abajo): encadena tokens e ids con variables. Cuentas de demostración: contraseña Prestalab123.',
  },
  variable: [{ key: 'baseUrl', value: 'http://localhost:8080/api/v1' }],
  item: items,
};
const entorno = { name: 'PrestaLab local', values: [{ key: 'baseUrl', value: 'http://localhost:8080/api/v1', enabled: true }], _postman_variable_scope: 'environment' };
const dir = path.join(__dirname, '..', 'postman');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'PrestaLab.postman_collection.json'), JSON.stringify(coleccion, null, 2));
fs.writeFileSync(path.join(dir, 'PrestaLab.postman_environment.json'), JSON.stringify(entorno, null, 2));
console.log(`Colección generada: ${items.reduce((n, f) => n + f.item.length, 0)} peticiones en ${items.length} carpetas`);
