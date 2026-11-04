# Cambios respecto al diseño

Registro de lo que cambió en cada entrega respecto a lo diseñado antes.

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
