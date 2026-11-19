// Prueba de carga (RNF rendimiento): 50 usuarios concurrentes consultando GET /api/v1/recursos.
// Mide la latencia de cada petición y reporta p50/p95/p99.
// Uso: npm run carga
//   USUARIOS=50  DURACION=20 (segundos)  RUTA='/recursos?limit=20' (cualquier GET bajo /api/v1)
//   CORREO=alumno1@prestalab.mx  SALIDA=archivo.json (guarda el resumen)
// IMPORTANTE: el Gateway limita peticiones (429). Para esta prueba arráncalo con LIMITE_GENERAL_MIN=1000000.
const base = process.env.BASE_URL || 'http://localhost:8080';
const usuarios = Number(process.env.USUARIOS || 50);
const duracion = Number(process.env.DURACION || 20);
const ruta = process.env.RUTA || '/recursos?limit=20';
const correo = process.env.CORREO || 'alumno1@prestalab.mx';

(async () => {
  const r = await fetch(`${base}/api/v1/sesiones`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ correo, contrasena: 'Prestalab123' }) });
  if (!r.ok) throw new Error('No se pudo iniciar sesión: ' + r.status);
  const { tokenAcceso } = await r.json();
  const lat = []; const codigos = {};
  const fin = Date.now() + duracion * 1000;
  async function usuario() {
    while (Date.now() < fin) {
      const t0 = performance.now();
      try {
        const x = await fetch(`${base}/api/v1${ruta}`, { headers: { authorization: `Bearer ${tokenAcceso}` } });
        await x.arrayBuffer();
        codigos[x.status] = (codigos[x.status] || 0) + 1;
      } catch (_) { codigos.error = (codigos.error || 0) + 1; }
      lat.push(performance.now() - t0);
    }
  }
  await Promise.all(Array.from({ length: usuarios }, usuario));
  lat.sort((a, b) => a - b);
  const p = (q) => Math.round(lat[Math.min(lat.length - 1, Math.floor(lat.length * q))]);
  const resumen = {
    ruta: `GET /api/v1${ruta}`, usuariosConcurrentes: usuarios, duracionSegundos: duracion, peticiones: lat.length, codigosHttp: codigos,
    peticionesPorSegundo: Math.round(lat.length / duracion), latenciaMediaMs: Math.round(lat.reduce((s, x) => s + x, 0) / lat.length),
    p50Ms: p(0.5), p95Ms: p(0.95), p99Ms: p(0.99), maxMs: Math.round(lat[lat.length - 1]),
    cumpleRNF_p95_menor_500ms: p(0.95) < 500 && Object.keys(codigos).every((c) => c.startsWith('2')),
  };
  console.log(JSON.stringify(resumen, null, 2));
  if (process.env.SALIDA) require('fs').writeFileSync(process.env.SALIDA, JSON.stringify(resumen, null, 2) + '\n');
  if (codigos[429]) console.log('\nAviso: hubo 429 (límite del Gateway). Arranca con LIMITE_GENERAL_MIN=1000000 para medir el rendimiento.');
})().catch((e) => { console.error(e.message); process.exit(1); });
