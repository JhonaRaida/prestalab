# Errores encontrados y corregidos — Entrega 7

**Proyecto:** PrestaLab · **Fecha:** 18 de noviembre de 2026

Los defectos se encontraron revisando la API en ejecución (peticiones manuales con `curl`) y comparándola contra el checklist de seguridad. Cada uno se reprodujo **antes** de corregirlo y se cubrió con una prueba automática que falla sin la corrección (18 pruebas fallaban con el código anterior; ahora las 146 pasan).

## Resumen

| ID | Severidad | Defecto | Estado | Commit |
|---|:---:|---|:---:|---|
| D-01 | Alta | Un id o una página fuera de rango provocaba un **500** en vez de un 400 | ✅ Corregido | `f06b192` |
| D-02 | Alta | Una **cuenta bloqueada podía iniciar sesión** | ✅ Corregido | `f06b192` |
| D-03 | Media | **No había manejo de CORS** | ✅ Corregido | `f06b192` |
| D-04 | Alta | **Secretos de relleno** en el código: sin `.env`, el sistema arrancaba con una clave conocida | ✅ Corregido | `f06b192` |
| D-05 | Alta | 3 dependencias de producción con vulnerabilidades conocidas (`body-parser`, `follow-redirects`, `http-proxy-middleware`) | ✅ Corregido | `f06b192` |
| D-06 | Alta (no alcanzable) | `zod` 3.x con aviso de memoria al validar colecciones enormes | ⚠️ Riesgo aceptado | — |

## D-01 — Id o página fuera de rango provocaba un 500

- **Cómo se encontró:** al probar entradas extremas contra el sistema en marcha.
- **Reproducción:** `GET /api/v1/recursos/99999999999999999999` → **500 `ERROR_INTERNO`**. Lo mismo con `/usuarios/…`, `/reservas/…`, `/prestamos/…`, `/laboratorios/…` y con `?page=99999999999999999999` en `/recursos`, `/usuarios`, `/reservas`, `/notificaciones` e `/incidencias`.
- **Causa:** la validación aceptaba cualquier entero positivo, pero las llaves de la base de datos son `INTEGER` de PostgreSQL (máximo 2 147 483 647). Un valor mayor hacía fallar la consulta SQL, y el error llegaba al manejador genérico como un fallo del servidor. Con `page` enorme, el `OFFSET` calculado ya no era un número válido para SQL.
- **Por qué importa:** un cliente que manda un dato inválido recibe «error del servidor», se llenan los registros con falsos errores 500 y es más difícil distinguir fallas reales.
- **Corrección:** `shared/validar.js` acota los ids a 2 147 483 647 (`idEntero` e `idRuta`) y `page` a 1 000 000. Responde **400 `VALIDACION_FALLIDA`** con el campo y el problema. Contrato actualizado (descripción de la respuesta 400).
- **Verificación:** `seguridad.test.js` → *las entradas se validan* (15 pruebas); caso Postman «Recurso con id fuera de rango → 400»; `npm run humo`. El id máximo válido (2 147 483 647) sigue respondiendo 404.

## D-02 — Una cuenta bloqueada podía iniciar sesión

- **Cómo se encontró:** se bloqueó una cuenta como administrador y se intentó iniciar sesión con ella.
- **Reproducción:** `PATCH /usuarios/5 {"estado":"bloqueado"}` y luego `POST /sesiones` con esa cuenta → **201** con un token nuevo.
- **Causa:** `estado = 'bloqueado'` solo se consultaba al crear una reserva; el inicio de sesión no lo revisaba.
- **Por qué importa:** bloquear una cuenta (por abuso o por baja) no impedía seguir entrando al sistema y consultar información.
- **Corrección:** `services/usuarios/src/service.js` rechaza el inicio de sesión con **403 `CUENTA_BLOQUEADA`**. La comprobación va **después** de verificar la contraseña: quien no conoce la contraseña sigue viendo 401, así no se revela qué cuentas están bloqueadas. Contrato actualizado con la nueva respuesta 403 del login.
- **Verificación:** `seguridad.test.js` → *Cuentas bloqueadas* (3 pruebas: bloqueada → 403; contraseña incorrecta → 401; desbloqueada → 201).
- **Alcance:** el token que la persona ya tenía antes de ser bloqueada sigue valiendo hasta que expire (máx. 1 h); ver limitación L-01 en el [checklist de seguridad](checklist-seguridad.md).

## D-03 — No había manejo de CORS

- **Cómo se encontró:** el checklist exige «manejo de CORS acorde al proyecto» y el código no tenía ninguno. Una petición *preflight* (`OPTIONS`) desde un navegador respondía 401 porque pasaba por la autenticación.
- **Causa:** no se había definido una política.
- **Por qué importa:** sin política, cualquier futuro front-end del proyecto no podría usar la API desde un navegador, y la solución rápida habitual (permitir `*`) sería insegura con tokens `Bearer`.
- **Corrección:** `gateway/src/app.js` incorpora `cors` con **lista blanca** configurable (`CORS_ORIGINS`, separada por comas), **vacía por defecto**. Va antes del límite de peticiones y de la autenticación. No se usa `*`, no se permiten credenciales y solo se exponen las cabeceras necesarias (`x-request-id`, `Location`, `RateLimit-*`). Documentado en `.env.example`.
- **Verificación:** `seguridad.test.js` → *CORS* (4 pruebas).

## D-04 — Secretos de relleno en el código

- **Cómo se encontró:** revisión de `shared/config.js` por el punto «no existen secretos reales dentro del repositorio / la configuración sensible está separada del código».
- **Causa:** si faltaba `JWT_SECRET` o `SERVICE_TOKEN`, el código usaba `'cambia-este-secreto-en-.env'`, un valor que está publicado en el repositorio. Quien lo supiera podía fabricar un token de **administrador** válido contra un despliegue mal configurado.
- **Corrección:** `shared/config.js` → `validarSecretos()`: con `NODE_ENV=production` (que ya fija el `Dockerfile`) el proceso **termina con un mensaje claro** si alguno de los dos secretos falta, es un valor de ejemplo (`cambia-este…`) o mide menos de 16 caracteres. En desarrollo y pruebas se siguen permitiendo los valores de relleno. `.env.example` explica cómo generar un secreto bueno.
- **Verificación:** `seguridad.test.js` → *Secretos y configuración* (la validación rechaza 5 configuraciones inseguras y acepta una buena). Verificado a mano: `NODE_ENV=production` con el secreto de ejemplo → `Error: Configuración insegura: JWT_SECRET no está configurado…`.
- **Efecto para el equipo:** quien levante Docker **debe** editar `JWT_SECRET` y `SERVICE_TOKEN` en `.env` (el README ya lo pedía en el Paso 3; ahora es obligatorio).

## D-05 — Dependencias de producción con vulnerabilidades

- **Cómo se encontró:** `npm audit --omit=dev` → 4 vulnerabilidades altas.
- **Corrección:** `npm audit fix` (sin `--force`, sin cambios incompatibles) actualizó `body-parser` 2.4.0, `http-proxy-middleware` 3.0.11 y `follow-redirects`. Tras actualizar se volvieron a pasar las 146 pruebas, el contrato y Newman.
- **Resultado:** `npm audit --omit=dev` queda con 1 aviso (D-06).

## D-06 — `zod` 3.x (riesgo aceptado)

- **Hallazgo:** `npm audit` reporta que Zod < 4.6.6 puede agotar memoria al validar *colecciones* con restricciones y tamaño enorme.
- **Por qué no se corrige ahora:** la corrección exige Zod 4, que cambia la forma de los mensajes de error (`required_error`, `invalid_type_error`) usada en todos los controladores y en el formato de error de la API; es un cambio de riesgo alto para una semana antes de la entrega final.
- **Por qué no es alcanzable:** ningún esquema de PrestaLab usa `z.array`, `z.set` ni `z.record`, y el cuerpo de las peticiones está limitado a 100 KB.
- **Pendiente sugerido:** migrar a Zod 4 después de la entrega final.

## Observaciones que no son defectos

- El mensaje `database "prestalab" does not exist` al arrancar Docker es la revisión de salud de PostgreSQL; ya estaba documentado en el README.
- `npm audit` reporta además avisos de herramientas de desarrollo (`jest`, `minimatch`); no entran a la imagen de producción (`npm ci --omit=dev`).
