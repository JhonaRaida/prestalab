# Entrega 7 — Pruebas, seguridad, documentación y despliegue

**Proyecto:** PrestaLab · Sistema de reserva y control de préstamo de equipo y espacios de laboratorio
**Materia:** Arquitectura Orientada a Servicios · Ing. Luis Leonardo Mendoza Reséndiz
**Equipo "Tranquilo nos la navegamos":** Jhonatan Uriel Morales Badillo, José Vidal López Salazar, David Sosa Gómez, Alejandro Ramírez Contreras
**Repositorio:** <https://github.com/JhonaRaida/prestalab> · tag `entrega-7`

## Reporte breve

| | |
|---|---|
| **Entrega** | 7 — Pruebas, seguridad, documentación y despliegue |
| **Objetivo de la semana** | Preparar el sistema para evaluarse como producto: demostrar calidad, seguridad básica, documentación y estabilidad, sin agregar funciones nuevas. |
| **Qué se implementó** | **89 pruebas nuevas** de seguridad y calidad (146 en total, 99 % de cobertura de líneas), con casos de error, permisos, entradas hostiles, CORS y concurrencia. Revisión del checklist de seguridad (8 de 8 puntos). Corrección de **4 defectos** y de 3 dependencias vulnerables. Prueba de carga sobre 2 endpoints y prueba de humo post-despliegue (`npm run humo`). Guía de despliegue con respaldo y restauración. README completo y OpenAPI actualizado. |
| **Qué cambió respecto a la entrega anterior** | La arquitectura y el modelo de datos **no cambiaron**. Cambios de comportamiento (todos correcciones): ids y páginas fuera de rango responden 400 en lugar de 500; una cuenta bloqueada ya no puede iniciar sesión (403 `CUENTA_BLOQUEADA`); se agregó la política CORS (`CORS_ORIGINS`); en producción es obligatorio configurar `JWT_SECRET` y `SERVICE_TOKEN`. Detalle en [`docs/cambios.md`](../../docs/cambios.md). |
| **Problemas encontrados** | 6 hallazgos (D-01 a D-06): errores 500 con ids o páginas enormes, cuentas bloqueadas que podían iniciar sesión, ausencia de CORS, secretos de relleno en el código, 3 dependencias con vulnerabilidades altas y un aviso en `zod` 3.x. Detalle en [`defectos.md`](defectos.md). |
| **Cómo se resolvieron** | D-01 a D-05 se corrigieron y cada uno tiene pruebas automáticas que **fallan sin la corrección** (18 pruebas fallaban con el código anterior; ahora pasan todas). D-06 (`zod`) no es alcanzable en el sistema y su corrección exige cambiar de versión mayor; queda documentado como riesgo aceptado. |
| **Pendientes para la semana 8** | Entrega final: documento técnico final, presentación, demo y retrospectiva. Correr la Opción A de despliegue (Docker) y agregar la captura. Mejoras futuras ya identificadas: revocación de tokens, límite de peticiones compartido entre instancias, migración a Zod 4. |
| **Repositorio y versión** | <https://github.com/JhonaRaida/prestalab> · rama `entrega-7` · tag `entrega-7` |

## Entregables obligatorios

| Entregable | Dónde está |
|---|---|
| Plan y evidencia de pruebas | [`plan-de-pruebas.md`](plan-de-pruebas.md) y la carpeta [`evidencias/`](evidencias/) |
| Documentación de API | [`docs/openapi.yaml`](../../docs/openapi.yaml), publicada en <http://localhost:8080/docs> (Swagger UI); validada contra la API real con `npm run contrato` (20 de 20) |
| Checklist de seguridad | [`checklist-seguridad.md`](checklist-seguridad.md) |
| README final preliminar | [`README.md`](../../README.md) (instalación, uso, pruebas, despliegue y problemas comunes) y [`docs/arquitectura.md`](../../docs/arquitectura.md) |
| Evidencia de despliegue o procedimiento reproducible | [`docs/despliegue.md`](../../docs/despliegue.md) (procedimiento, respaldo, reversión) y [`evidencias/prueba-de-humo.txt`](evidencias/prueba-de-humo.txt) |
| Lista de errores encontrados y corregidos | [`defectos.md`](defectos.md) |

## Trabajo requerido

| Requisito | Cómo se cumplió |
|---|---|
| Crear pruebas de endpoints o lógica crítica | 146 pruebas automáticas ([`test/`](../../test/)): unitarias, integración y seguridad. Una prueba por cada operación protegida del contrato OpenAPI. |
| Probar casos correctos e incorrectos | Cada grupo mezcla ambos; la suite de seguridad es casi toda de casos incorrectos y de permisos (sección 4.2 del plan de pruebas). |
| Revisar validación de entradas | Auditoría con valores extremos, tipos incorrectos, campos extra, cuerpos grandes e inyección SQL → defecto D-01 corregido. |
| Revisar almacenamiento de contraseñas y datos sensibles | Todas las contraseñas son hash bcrypt en la base, incluidos los datos de prueba; la API nunca las devuelve (pruebas en `seguridad.test.js`). |
| Revisar variables de entorno y secretos | `.env` fuera del repositorio; defecto D-04 corregido (en producción no se arranca con secretos de ejemplo); prueba que escanea el repositorio. |
| Agregar documentación OpenAPI/Swagger | Ya existía; se actualizó con la nueva respuesta 403 del login y el rango de ids, y se valida contra la API real. |
| Completar el README | Se agregaron despliegue, CORS, pruebas y la prueba de humo. |
| Preparar instrucciones de despliegue o ejecución | [`docs/despliegue.md`](../../docs/despliegue.md). |
| Prueba básica de carga o concurrencia | 50 usuarios sobre 2 endpoints (p95 de 130 ms y 97 ms, 0 errores) y 4 pruebas de concurrencia (8 reservas simultáneas del mismo horario, 30 registros iguales, 30 inicios de sesión, 200 lecturas). |
| Registrar defectos encontrados y correcciones | [`defectos.md`](defectos.md). |

## Criterios mínimos de aceptación

| Criterio | Cómo se cumple |
|---|---|
| Otra persona puede comprender la API sin leer el código | Swagger UI en `/docs` con ejemplos de petición, respuesta y error de cada operación; colección de Postman con 62 peticiones; formato de error único documentado. |
| Las pruebas incluyen errores y permisos, no solo el camino feliz | 18 pruebas de 403 por rol, 31 de 401 por operación, 5 de tokens manipulados, 15 de validación de entradas, 3 de cuentas bloqueadas, 4 de CORS. |
| La configuración sensible está separada del código | Todo sale de variables de entorno (`.env`); en producción es obligatorio configurar los secretos. |
| El sistema puede ejecutarse o desplegarse siguiendo instrucciones | [`docs/despliegue.md`](../../docs/despliegue.md); desplegado en modo `production` y verificado con `npm run humo` (9 de 9). |

## Resumen de resultados

| Medida | Resultado |
|---|---|
| Pruebas automáticas | **146 de 146** aprobadas (57 previas + 89 nuevas) |
| Cobertura de líneas | **99 %** (el RNF pide 60 %) |
| Contrato OpenAPI vs. API real | **20 de 20** |
| Colección Postman (Newman) | **62 peticiones, 93 aserciones, 0 fallidas** |
| Carga, 50 usuarios, `GET /recursos` | 557 req/s, **p95 130 ms**, 0 errores |
| Carga, 50 usuarios, `GET /reservas` | 657 req/s, **p95 97 ms**, 0 errores |
| Checklist de seguridad | **8 de 8** |
| Defectos | 5 corregidos, 1 aceptado y documentado |
| Prueba de humo en producción | **9 de 9** |

## Bitácora de cambios (semana 7)

| Semana | Cambio realizado | Motivo | Evidencia |
|---|---|---|---|
| 7 | Ids y `page` acotados al rango `INTEGER`; responden 400 | D-01: respondían 500 | `shared/validar.js`, `seguridad.test.js` |
| 7 | Una cuenta bloqueada no inicia sesión (403 `CUENTA_BLOQUEADA`) | D-02 | `services/usuarios/src/service.js`, `docs/openapi.yaml` |
| 7 | Política CORS con lista blanca (`CORS_ORIGINS`) | D-03 | `gateway/src/app.js`, `.env.example` |
| 7 | En producción no se arranca con secretos de ejemplo | D-04 | `shared/config.js` |
| 7 | `npm audit fix` en 3 dependencias | D-05 | `package.json`, `package-lock.json` |
| 7 | Nuevos scripts `npm run humo` y `RUTA`/`SALIDA` en `npm run carga` | Pruebas de humo y de carga repetibles | `scripts/` |
| 7 | Caso Postman «id fuera de rango → 400» (62 peticiones) | Cubrir D-01 | `postman/` |
| 7 | Nuevos documentos: plan de pruebas, checklist, defectos, despliegue | Entregables de la semana | `entregas/entrega-7/`, `docs/despliegue.md` |

## Evidencias

| Archivo | Contenido |
|---|---|
| [`evidencias/pruebas-automaticas.txt`](evidencias/pruebas-automaticas.txt) | Lista de las 146 pruebas y su resultado |
| [`evidencias/contrato-openapi.txt`](evidencias/contrato-openapi.txt) | Validación del contrato contra la API real |
| [`evidencias/newman-resultado.txt`](evidencias/newman-resultado.txt) | Ejecución de la colección de Postman |
| [`evidencias/carga-recursos.json`](evidencias/carga-recursos.json) · [`carga-reservas.json`](evidencias/carga-reservas.json) | Resultados de la prueba de carga |
| [`evidencias/prueba-de-humo.txt`](evidencias/prueba-de-humo.txt) | Prueba de humo del sistema desplegado en modo producción |
