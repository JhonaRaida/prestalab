// Prueba de humo posterior al despliegue: confirma que el sistema desplegado responde y es seguro en lo básico.
// Solo lee datos y no modifica nada, así que se puede correr contra cualquier entorno.
// Uso: npm run humo           (BASE_URL=http://localhost:8080)
//      CORREO=... CONTRASENA=... npm run humo   (cuenta para el paso de inicio de sesión; por defecto, la de prueba)
const base = process.env.BASE_URL || 'http://localhost:8080';
const correo = process.env.CORREO || 'alumno1@prestalab.mx';
const contrasena = process.env.CONTRASENA || 'Prestalab123';

const pasos = [];
async function paso(nombre, fn) {
  try { const detalle = await fn(); pasos.push({ nombre, ok: true, detalle }); console.log(`  ✓ ${nombre}${detalle ? ' — ' + detalle : ''}`); }
  catch (e) { pasos.push({ nombre, ok: false, detalle: e.message }); console.log(`  ✗ ${nombre} — ${e.message}`); }
}
const exigir = (cond, msg) => { if (!cond) throw new Error(msg); };

(async () => {
  console.log(`Prueba de humo contra ${base}`);
  let token;
  await paso('GET /health: Gateway y los 5 servicios en "ok"', async () => {
    const r = await fetch(`${base}/health`); const j = await r.json();
    exigir(r.status === 200, `respondió ${r.status}: ${JSON.stringify(j)}`);
    exigir(Object.values(j.servicios).every((e) => e === 'ok'), JSON.stringify(j.servicios));
    return Object.keys(j.servicios).join(', ');
  });
  await paso('GET /docs: documentación Swagger disponible', async () => {
    const r = await fetch(`${base}/docs/`); exigir(r.status === 200, `respondió ${r.status}`);
  });
  await paso('Ruta protegida sin token -> 401', async () => {
    const r = await fetch(`${base}/api/v1/recursos`); exigir(r.status === 401, `respondió ${r.status}`);
  });
  await paso('Inicio de sesión -> 201 con token', async () => {
    const r = await fetch(`${base}/api/v1/sesiones`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ correo, contrasena }) });
    exigir(r.status === 201, `respondió ${r.status} (¿datos de prueba desactivados? usa CORREO y CONTRASENA)`);
    token = (await r.json()).tokenAcceso; exigir(token, 'sin tokenAcceso');
  });
  await paso('Consulta autenticada GET /recursos -> 200', async () => {
    const r = await fetch(`${base}/api/v1/recursos?limit=1`, { headers: { authorization: `Bearer ${token}` } });
    exigir(r.status === 200, `respondió ${r.status}`); const j = await r.json(); return `${j.meta.total} recursos`;
  });
  await paso('Entrada inválida -> 400 (no 500)', async () => {
    const r = await fetch(`${base}/api/v1/recursos/99999999999999999999`, { headers: { authorization: `Bearer ${token}` } });
    exigir(r.status === 400, `respondió ${r.status}`);
  });
  await paso('Las rutas internas no están publicadas -> 404', async () => {
    const r = await fetch(`${base}/internal/v1/catalogo`); exigir(r.status === 404, `respondió ${r.status}`);
  });
  await paso('Cabeceras de seguridad y sin X-Powered-By', async () => {
    const r = await fetch(`${base}/health`);
    exigir(r.headers.get('x-content-type-options') === 'nosniff', 'falta X-Content-Type-Options');
    exigir(!r.headers.get('x-powered-by'), 'se anuncia X-Powered-By');
  });
  await paso('Sin CORS abierto a cualquier origen', async () => {
    const r = await fetch(`${base}/api/v1/recursos`, { headers: { origin: 'http://sitio-no-autorizado.example', authorization: `Bearer ${token}` } });
    exigir(r.headers.get('access-control-allow-origin') !== '*' && r.headers.get('access-control-allow-origin') !== 'http://sitio-no-autorizado.example', 'permite un origen no autorizado');
  });

  const fallos = pasos.filter((p) => !p.ok).length;
  console.log(fallos ? `\n${fallos} de ${pasos.length} pasos fallaron.` : `\nTodo en orden: ${pasos.length} de ${pasos.length} pasos correctos.`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('No se pudo conectar:', e.message); process.exit(1); });
