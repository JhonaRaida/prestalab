# Entrega 6 — MVP Backend II

**Proyecto:** PrestaLab · Sistema de reserva y control de préstamo de equipo y espacios de laboratorio  
**Materia:** Arquitectura Orientada a Servicios · Ing. Luis Leonardo Mendoza Reséndiz  
**Equipo "Tranquilo nos la navegamos":** Jhonatan Uriel Morales Badillo, José Vidal López Salazar, David Sosa Gómez, Alejandro Ramírez Contreras  
**Repositorio:** <https://github.com/JhonaRaida/prestalab> · tag `entrega-6`

## Reporte breve

| | |
|---|---|
| **Entrega** | 6 — MVP Backend II (segunda implementación funcional y refinamiento) |
| **Objetivo de la semana** | Consolidar la autenticación basada en tokens JWT, control de acceso por roles (RBAC), implementación de las reglas de negocio en la gestión de préstamos/incidencias y validación con pruebas de integración. |
| **Qué se implementó** | Implementación completa del flujo de **Préstamos** e **Incidencias** con conexión directa a PostgreSQL, integración de middlewares de autorización basados en JWT por rol (Alumno, Docente, Encargado, Administrador), validación de reglas de negocio cruzadas (evitar préstamos sin reserva o con incidencias activas), colecciones de Postman actualizadas y pruebas unitarias/de integración automatizadas. |
| **Qué cambió respecto a la entrega anterior** | Se extendió el API Gateway con middlewares para verificación de tokens firmados y control de permisos en rutas protegidas. Se agregaron validaciones de estado para transiciones de préstamos (*pendiente*, *activo*, *finalizado*, *con_incidencia*). Se actualizaron los archivos de arquitectura en `docs/`. |
| **Problemas encontrados** | Durante las pruebas de carga y concurrencia, las peticiones que requerían validar la existencia de reservas activas generaban bloqueos menores en la base de datos debido a consultas no optimizadas en `prestamos_db`. |
| **Cómo se resolvieron** | Se agregaron índices compuestos en las columnas `usuario_id` y `estado` en PostgreSQL, y se optimizó la consulta en `repository.js` dentro del servicio de préstamos. |
| **Pendientes para la siguiente etapa** | Iniciar la integración con la interfaz de usuario (Frontend), configurar el despliegue en ambiente de staging y refinamiento de notificaciones por correo/eventos. |

## Implementación mínima

| Requisito | Dónde está |
|---|---|
| Autenticación JWT y Roles | Middleware en [`shared/auth.js`](../../shared/auth.js) e integración en [`gateway/src/index.js`](../../gateway/src/index.js) |
| Rutas, controladores, servicios y acceso a datos | Organización por servicio en `services/<servicio>/src/`. Ejemplo: Servicio de Préstamos en [`services/prestamos/src/`](../../services/prestamos/src/) |
| Reglas de negocio y validaciones | Esquemas Zod en controladores y reglas en [`services/prestamos/src/service.js`](../../services/prestamos/src/service.js) |
| Conexión con la base de datos | Base de datos PostgreSQL aislada por servicio mediante [`shared/db.js`](../../shared/db.js) |
| CRUD e Incidencias completas | Endpoints de **Préstamos** (`/prestamos`) e **Incidencias** (`/incidencias`) |
| Manejo global de errores | [`shared/errors.js`](../../shared/errors.js): Respuestas estandarizadas (400, 401, 403, 404, 500) |
| Colección de Postman actualizada | [`postman/PrestaLab.postman_collection.json`](../../postman/PrestaLab.postman_collection.json) con entornos e inicio de sesión automático |
| Documentación de arquitectura y cambios | [`docs/arquitectura.md`](../../docs/arquitectura.md) y [`docs/cambios.md`](../../docs/cambios.md) |

## Criterios mínimos de aceptación

| Criterio | Cómo se cumple |
|---|---|
| El proyecto puede ejecutarse siguiendo el README | El [`README.md`](../../README.md) principal incluye comandos para levantar todos los contenedores en Docker, correr migraciones y ejecutar la API. |
| Los endpoints funcionan contra datos persistentes | Las validaciones del ciclo completo (Reserva → Préstamo → Incidencia) se persistieron y verificaron en la instancia de PostgreSQL. |
| Control de acceso por roles funcional | Peticiones a rutas protegidas sin encabezado `Authorization` o con rol insuficiente responden **401 Unauthorized** o **403 Forbidden**. |
| Los cambios respecto a la entrega anterior están documentados | Cambios de API, esquemas de BD y middlewares descritos en [`docs/cambios.md`](../../docs/cambios.md). |

## Evidencias

Capturas tomadas en Postman con el entorno desplegado en Docker y persistencia en PostgreSQL. Se probó el ciclo de vida de **Préstamos** e **Incidencias**. Todas las imágenes se ubican en la carpeta [`evidencias/`](evidencias/).

| # | Evidencia que se pide | Petición | Resultado |
|---|---|---|---|
| 1 | Registrar entrega de préstamo | `POST /prestamos` | 201 Created |
| 2 | Consultar préstamos activos | `GET /prestamos?estado=activo` | 200 OK |
| 3 | Consultar préstamo por ID | `GET /prestamos/12` | 200 OK |
| 4 | Finalizar préstamo (Devolución) | `PUT /prestamos/12/devolucion` | 200 OK |
| 5 | Registrar incidencia en devolución | `POST /incidencias` | 201 Created |
| 6 | Error de autenticación (sin token) | `GET /prestamos` sin Header | 401 Unauthorized |
| 7 | Error de autorización (rol Alumno) | `DELETE /recursos/1` con rol alumno | 403 Forbidden |

### 1. Registrar entrega de préstamo

El encargado de laboratorio confirma la entrega del equipo al usuario. Responde **201 Created** registrando la fecha/hora de inicio y marcando el estado del préstamo como `activo`.

![Registrar entrega de préstamo](evidencias/1-crear-prestamo.png)

### 2. Consultar préstamos activos

Consulta de la lista de préstamos filtrados por estado `activo`. Responde **200 OK** con los registros asociados al laboratorio del encargado.

![Consultar préstamos activos](evidencias/2-consultar-prestamos.png)

### 3. Consultar préstamo por ID

Consulta del detalle de un préstamo específico. Responde **200 OK** con los datos del recurso, usuario responsable y horarios asignados.

![Consultar préstamo por ID](evidencias/3-consultar-un-prestamo.png)

### 4. Finalizar préstamo (Devolución)

Se registra el retorno del equipo en buenas condiciones. Responde **200 OK** actualizando el estado del préstamo a `finalizado` y liberando el recurso.

![Finalizar préstamo](evidencias/4-finalizar-prestamo.png)

### 5. Registrar incidencia en devolución

Si el equipo presenta daños o retardo, se registra una incidencia ligada al préstamo. Responde **201 Created** y cambia el estado del préstamo a `con_incidencia`.

![Registrar incidencia](evidencias/5-registrar-incidencia.png)

### 6. Error de autenticación (sin token)

Intento de acceso a un endpoint protegido sin enviar el token JWT en las cabeceras. Responde **401 Unauthorized** con el código `TOKEN_REQUERIDO`.

![Error de autenticación](evidencias/6-error-autenticacion.png)

### 7. Error de autorización (rol Alumno)

Intento por parte de un usuario con rol `alumno` de acceder a un endpoint restringido exclusivamente a `encargado` o `admin`. Responde **403 Forbidden** con el código `ACCESO_DENEGADO`.

![Error de autorización](evidencias/7-error-autorizacion.png)

### Ejecución completa de la colección

[`evidencias/reporte-postman.html`](evidencias/reporte-postman.html): Resultado de la ejecución automatizada de la colección con Newman para la Entrega 6.

## Evidencias complementarias

Secuencia de flujo de negocio completo (Reserva → Préstamo → Incidencia) y verificación en base de datos guardada en [`evidencias/evidencias-crud.json`](evidencias/evidencias-crud.json).

### Comprobación en Base de Datos

Consulta directa a `prestamos_db` tras registrar una devolución con incidencia:

```sql
prestamos_db=> SELECT id, usuario_id, recurso_id, estado, observacion FROM prestamos WHERE id = 12;
 id | usuario_id | recurso_id |     estado      |            observacion            
----+------------+------------+-----------------+-----------------------------------
 12 |          4 |          1 | con_incidencia  | Cable de alimentación dañado.
(1 row)
