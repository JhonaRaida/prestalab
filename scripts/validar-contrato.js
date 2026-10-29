// Verifica que las respuestas REALES de la API cumplen los esquemas de docs/openapi.yaml.
// Requiere el sistema en marcha (npm start o docker compose up). Uso: npm run contrato
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const Ajv = require('ajv/dist/2019');
const addFormats = require('ajv-formats');

const base = process.env.BASE_URL || 'http://localhost:8080';
const doc = YAML.parse(fs.readFileSync(path.join(__dirname, '../docs/openapi.yaml'), 'utf8'));
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const reescribir = (o) => JSON.parse(JSON.stringify(o).replace(/#\/components\/schemas\//g, '#/$defs/'));
const validador = (nombre) => ajv.compile({ $ref: `#/$defs/${nombre}`, $defs: reescribir(doc.components.schemas) });

let fallos = 0; let total = 0;
function revisar(etiqueta, esquema, cuerpo) {
  total++;
  const v = validador(esquema);
  if (v(cuerpo)) console.log(`  ✓ ${etiqueta} cumple ${esquema}`);
  else { fallos++; console.log(`  ✗ ${etiqueta} NO cumple ${esquema}:`, JSON.stringify(v.errors.map((e) => `${e.instancePath} ${e.message}`))); }
}
async function llamar(metodo, ruta, token, cuerpo) {
  const r = await fetch(base + '/api/v1' + ruta, {
    method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const t = await r.text();
  return { status: r.status, cuerpo: t ? JSON.parse(t) : null };
}

(async () => {
  const sesion = async (c) => (await llamar('POST', '/sesiones', null, { correo: c, contrasena: 'Prestalab123' }));
  const s = await sesion('alumno1@prestalab.mx'); revisar('POST /sesiones', 'Sesion', s.cuerpo);
  const alumno = s.cuerpo.tokenAcceso;
  const admin = (await sesion('admin@prestalab.mx')).cuerpo.tokenAcceso;
  const enc = (await sesion('encargado1@prestalab.mx')).cuerpo.tokenAcceso;
  const correo = `contrato${Date.now()}@prueba.mx`;
  const u = await llamar('POST', '/usuarios', null, { nombre: 'Contrato Prueba', correo, matricula: '1', contrasena: 'Prestalab123' });
  revisar('POST /usuarios', 'Usuario', u.cuerpo);
  const nuevo = (await sesion(correo)).cuerpo.tokenAcceso;
  revisar('GET /usuarios', 'Meta', (await llamar('GET', '/usuarios?limit=2', admin)).cuerpo.meta);
  revisar('GET /usuarios/{id}', 'Usuario', (await llamar('GET', `/usuarios/${u.cuerpo.id}`, nuevo)).cuerpo);
  revisar('GET /laboratorios (1)', 'Laboratorio', (await llamar('GET', '/laboratorios', alumno)).cuerpo.data[0]);
  revisar('GET /categorias (1)', 'Categoria', (await llamar('GET', '/categorias', alumno)).cuerpo.data[0]);
  const rec = await llamar('POST', '/recursos', enc, { nombre: 'Contrato', codigoInventario: 'CT-' + Date.now(), categoriaId: 1, laboratorioId: 1 });
  revisar('POST /recursos', 'Recurso', rec.cuerpo);
  const i = new Date(Date.now() + 5 * 60000); const f = new Date(i.getTime() + 3600000);
  const disp = await llamar('GET', `/disponibilidad?inicio=${encodeURIComponent(i.toISOString())}&fin=${encodeURIComponent(f.toISOString())}&limit=1`, nuevo);
  revisar('GET /disponibilidad (1)', 'RecursoDisponible', disp.cuerpo.data[0]);
  const res = await llamar('POST', '/reservas', nuevo, { recursoId: rec.cuerpo.id, inicio: i.toISOString(), fin: f.toISOString() });
  revisar('POST /reservas', 'Reserva', res.cuerpo);
  const pre = await llamar('POST', '/prestamos', enc, { reservaId: res.cuerpo.id });
  revisar('POST /prestamos', 'Prestamo', pre.cuerpo);
  const dev = await llamar('PATCH', `/prestamos/${pre.cuerpo.id}`, enc, { estadoDevolucion: 'danado', observaciones: 'prueba' });
  revisar('PATCH /prestamos (devolución)', 'Prestamo', dev.cuerpo);
  revisar('POST /incidencias', 'Incidencia', (await llamar('POST', '/incidencias', enc, { prestamoId: pre.cuerpo.id, tipo: 'faltante', descripcion: 'x' })).cuerpo);
  revisar('GET /incidencias (1)', 'Incidencia', (await llamar('GET', '/incidencias', enc)).cuerpo.data[0]);
  await new Promise((r) => setTimeout(r, 400));
  revisar('GET /notificaciones (1)', 'Notificacion', (await llamar('GET', '/notificaciones', nuevo)).cuerpo.data[0]);
  const rango = '?desde=2020-01-01T00:00:00Z&hasta=2035-01-01T00:00:00Z';
  revisar('GET /reportes/uso', 'ReporteUso', (await llamar('GET', '/reportes/uso' + rango, admin)).cuerpo);
  revisar('GET /reportes/ocupacion', 'ReporteOcupacion', (await llamar('GET', '/reportes/ocupacion' + rango, admin)).cuerpo);
  revisar('GET /reportes/retrasos', 'ReporteRetrasos', (await llamar('GET', '/reportes/retrasos' + rango, admin)).cuerpo);
  revisar('error 401', 'Error', (await llamar('GET', '/recursos')).cuerpo);
  revisar('error 400', 'Error', (await llamar('POST', '/reservas', nuevo, {})).cuerpo);
  revisar('error 409', 'Error', (await llamar('POST', '/recursos', enc, { nombre: 'x', codigoInventario: rec.cuerpo.codigoInventario, categoriaId: 1, laboratorioId: 1 })).cuerpo);
  console.log(`\n${total - fallos}/${total} respuestas cumplen el contrato`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
