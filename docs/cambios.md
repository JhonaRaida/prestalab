# Cambios respecto al diseño

Registro de lo que cambió en cada entrega respecto a lo diseñado antes.

## Entrega 7 — Pruebas, seguridad, documentación y despliegue

**La arquitectura y el modelo de datos no cambiaron.** Los cambios son correcciones de defectos hallados al revisar la API (detalle en [`entregas/entrega-7/defectos.md`](../entregas/entrega-7/defectos.md)):

1. **D-01 · Ids y páginas fuera de rango → 400.** Los identificadores se aceptan hasta 2 147 483 647 (el máximo de `INTEGER` en PostgreSQL) y `page` hasta 1 000 000. Antes, valores mayores provocaban un 500. Contrato: se amplió la descripción de la respuesta 400.
2. **D-02 · Cuenta bloqueada no inicia sesión.** `POST /sesiones` responde **403 `CUENTA_BLOQUEADA`** cuando la contraseña es correcta pero la cuenta está bloqueada (con contraseña incorrecta sigue siendo 401). Contrato: nueva respuesta 403 en `POST /sesiones`.
3. **D-03 · CORS.** Nueva variable `CORS_ORIGINS` (lista blanca, vacía por defecto). Sin ella, ningún sitio externo puede usar la API desde un navegador.
4. **D-04 · Secretos obligatorios en producción.** Con `NODE_ENV=production` (el `Dockerfile` ya lo fija) el sistema no arranca si `JWT_SECRET` o `SERVICE_TOKEN` faltan, son los de ejemplo o miden menos de 16 caracteres. **Quien use Docker debe editar `.env`** (el README ya lo pedía).
5. **D-05 · Dependencias.** `npm audit fix` actualizó `body-parser`, `http-proxy-middleware` y `follow-redirects`; nueva dependencia `cors`.

Cambios en pruebas y herramientas:

6. **`test/seguridad.test.js`:** 89 pruebas nuevas (146 en total, 99 % de líneas). Genera una prueba de «sin token → 401» por cada operación protegida de `docs/openapi.yaml`.
7. **`npm run humo`** (`scripts/humo.js`): prueba de humo de solo lectura para después de desplegar.
8. **`npm run carga`** acepta `RUTA`, `CORREO` y `SALIDA` para medir cualquier `GET` y guardar el resultado.
9. **Colección de Postman:** 62 peticiones (se agregó «Recurso con id fuera de rango → 400»).
10. **Documentación nueva:** [`docs/despliegue.md`](despliegue.md) y los entregables de [`entregas/entrega-7/`](../entregas/entrega-7/).

## Entrega 5 — MVP Backend I

**La arquitectura no cambió:** se mantienen el Gateway, los 5 servicios, las 4 bases de datos y el modelo de la Entrega 4.

Cambios en las herramientas de prueba y la documentación:

1. **Colección de Postman con inicio de sesión automático.** Antes había que correr primero la carpeta "1. Autenticación" para tener los tokens; si no, las peticiones respondían 401. Ahora la colección revisa antes de cada petición si tiene el token de la cuenta que usa y, si falta o ya venció, inicia sesión sola. "Crear recurso" genera su propio código de inventario.
2. **Duración del token documentada.** `.env.example` incluye `JWT_EXPIRA_SEGUNDOS` (por defecto 3600 = 1 hora), que el sistema ya permitía configurar.
3. **Documentación reorganizada.** El `README.md` quedó solo con instalación y ejecución; la parte técnica pasó a `docs/arquitectura.md` y este registro de cambios a `docs/cambios.md`.
4. **Contrato sin marca de borrador.** `docs/openapi.yaml` pasa de `1.0.0-borrador` a `1.0.0` porque ya está implementado; los endpoints y esquemas no cambian.
5. **Evidencias repetibles.** `npm run evidencias` (`scripts/evidencias-crud.js`) ejecuta los CRUD de Recursos y Reservas y los errores 400, 404 y 401, y guarda cada petición con su respuesta en `entregas/entrega-5/evidencias/evidencias-crud.json`.
6. **Reservas como segundo CRUD.** «Eliminar» una reserva es cancelarla con `PATCH /reservas/{id}` (E-23): cambia de estado y no se borra, igual que la baja lógica de Recursos (E-18), para no perder el historial que usan los reportes y las sanciones.

## Entrega 4 — Modelo de datos y persistencia

Diferencias respecto al diseño de la API de la Entrega 3 (ya sincronizadas en `docs/openapi.yaml` y en el documento de la Entrega 4):

1. `Recurso` incluye dos datos informativos: `tipo` y `encargadoId`.
2. Dos rutas internas de **solo lectura** para Reportes: `GET /internal/v1/catalogo` (Inventario) y `GET /internal/v1/reportes/datos` (Reservas).
3. Dos códigos de error 422 nuevos: `LABORATORIO_NO_VALIDO` y `CATEGORIA_NO_VALIDA`.
4. Las fechas se devuelven en UTC (`...Z`), que también es ISO 8601 con zona; el cliente puede enviar cualquier offset.
5. Extras fuera de `/api/v1`: `GET /health` y `GET /docs`.
