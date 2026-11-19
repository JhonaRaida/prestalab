# Plan y evidencia de pruebas — Entrega 7

**Proyecto:** PrestaLab · **Fecha de ejecución:** 18 de noviembre de 2026 · **Versión probada:** rama `entrega-7`

## 1. Objetivo y alcance

Demostrar que la API de PrestaLab funciona **no solo cuando todo sale bien**, sino también cuando el usuario no tiene permiso, manda datos incorrectos o varias personas usan el sistema al mismo tiempo. Se prueban el API Gateway, los 5 servicios y la base de datos juntos (pruebas de integración), más las reglas críticas por separado (pruebas unitarias).

Fuera de alcance: interfaz gráfica (el proyecto es solo backend), envío real de correo (está simulado) y pruebas de penetración con herramientas externas.

## 2. Estrategia

| Nivel | Qué se prueba | Herramienta | Dónde |
|---|---|---|---|
| Unitarias | Validación de entradas, JWT, formato de error y que un 500 no revele detalles | Jest | `test/unit.test.js` |
| Integración (funcionales) | Cada requisito funcional contra PostgreSQL real: registro, roles, CRUD, traslape, entrega/devolución, sanciones, reportes, tolerancia a fallos | Jest + Supertest | `test/e2e.test.js` |
| Seguridad y calidad | Checklist de seguridad, casos negativos, permisos, entradas hostiles, CORS, cuentas bloqueadas, concurrencia | Jest + Supertest | `test/seguridad.test.js` |
| Contrato | Las respuestas reales cumplen los esquemas de `docs/openapi.yaml` | Ajv | `npm run contrato` |
| Colección | 62 peticiones con casos positivos y negativos, 93 aserciones | Postman / Newman | `postman/` |
| Carga | 50 usuarios concurrentes sobre dos endpoints (RNF: p95 < 500 ms) | Script propio | `npm run carga` |
| Humo | 9 comprobaciones de solo lectura tras desplegar | Script propio | `npm run humo` |

**Criterio de aprobación:** 0 pruebas fallidas, cobertura de líneas ≥ 60 % (RNF), contrato 100 % válido y p95 < 500 ms sin errores en la prueba de carga.

**Principio de diseño de las pruebas de seguridad:** no se escribieron a mano 31 pruebas de «sin token → 401». El archivo `test/seguridad.test.js` **lee `docs/openapi.yaml`** y genera una prueba por cada operación protegida del contrato. Si alguien agrega un endpoint y olvida protegerlo, la prueba falla.

## 3. Cómo ejecutarlas

```bash
# Necesitan PostgreSQL con las bases creadas (npm run db:crear). No necesitan el sistema corriendo.
npm test                       # unitarias + integración + seguridad, con cobertura

# Las siguientes necesitan el sistema corriendo (npm start o docker compose up)
npm run contrato               # el contrato OpenAPI contra la API real
npx -p newman newman run postman/PrestaLab.postman_collection.json -e postman/PrestaLab.postman_environment.json
npm run humo                   # prueba de humo
LIMITE_GENERAL_MIN=1000000 npm start    # (en otra terminal) arrancar sin el límite de peticiones, solo para medir carga
npm run carga                  # carga sobre GET /recursos
RUTA='/reservas?limit=20' npm run carga
```

## 4. Resultados

### 4.1 Pruebas automáticas (`npm test`)

**146 de 146 aprobadas · 3 suites · 0 fallidas.** Detalle de cada prueba en [`evidencias/pruebas-automaticas.txt`](evidencias/pruebas-automaticas.txt).

| Suite | Grupo | Pruebas |
|---|---|---:|
| `unit.test.js` | Validación, JWT, formato de error | 8 |
| `e2e.test.js` | RF-01 registro e inicio de sesión | 7 |
| | Gateway y seguridad (RNF) | 8 |
| | RF-02 usuarios y roles | 4 |
| | RF-03 inventario (CRUD) | 5 |
| | RF-04 disponibilidad y RF-05 reservas | 12 |
| | RF-06 entrega y devolución, RF-07 incidencias y sanción | 7 |
| | RF-10 reportes | 3 |
| | RNF tolerancia a fallos | 3 |
| `seguridad.test.js` | Contraseñas y datos sensibles | 3 |
| | Secretos y configuración | 4 |
| | Autenticación: 31 operaciones protegidas sin token + contrato con 2 públicas | 32 |
| | Tokens manipulados (`alg: none`, otro secreto, expirado, sin Bearer, basura) | 5 |
| | Autorización: 403 por rol y por dueño del registro | 18 |
| | Validación de entradas, inyección SQL, cuerpos grandes (D-01) | 15 |
| | Errores sin información interna | 2 |
| | CORS (D-03) | 4 |
| | Cuentas bloqueadas (D-02) | 3 |
| | Concurrencia | 3 |
| | **Total** | **146** |

**Cobertura:** 94.72 % de sentencias · 83.23 % de ramas · 97.13 % de funciones · **99 % de líneas** (el RNF pide 60 %).

**Las pruebas nuevas detectan los defectos.** Al ejecutar `seguridad.test.js` contra el código *anterior* a las correcciones, **18 de las 89 pruebas fallan**; con las correcciones, las 89 pasan. Así se comprueba que no son pruebas que «siempre pasan».

### 4.2 Casos de error y de permisos (no solo «camino feliz»)

| Situación | Resultado esperado | Prueba |
|---|---|---|
| Sin token, con token manipulado, expirado, `alg: none` o firmado con otro secreto | 401 `TOKEN_INVALIDO` | `seguridad` → autenticación |
| Alumno intenta operaciones de encargado o administrador (15 operaciones) | 403 `PERMISO_INSUFICIENTE` | `seguridad` → autorización |
| Alumno consulta o modifica a otro usuario; se sube el rol; se desbloquea solo | 403 | `seguridad` → autorización |
| Falsificar `X-User-Id` / `X-User-Rol` desde el cliente | Se ignoran: 403 | `e2e` → Gateway |
| Llamar a un servicio saltándose el Gateway | 401 | `e2e` → Gateway |
| Id o página fuera de rango, texto en lugar de número, `limit` = 0 o 1000 | 400 `VALIDACION_FALLIDA` | `seguridad` → entradas |
| Campos extra o tipos incorrectos (`rol` al registrarse, objetos en lugar de texto) | 400 | `seguridad` → entradas |
| Texto con `' OR '1'='1`, `DROP TABLE`, `%`, `_` | Se trata como texto; las tablas siguen existiendo | `seguridad` → entradas |
| Cuerpo de más de 100 KB, JSON roto | 400 y el servicio sigue vivo | `seguridad`, `e2e` |
| Cuenta bloqueada intenta iniciar sesión | 403 `CUENTA_BLOQUEADA` (con contraseña incorrecta: 401) | `seguridad` → bloqueadas |
| Reservar el mismo horario; 8 reservas simultáneas | 409 `RESERVA_TRASLAPADA`; solo una gana | `e2e` |
| Apagar un servicio a propósito | 503 `SERVICIO_NO_DISPONIBLE`; Notificaciones caído no bloquea | `e2e` → tolerancia |
| Origen no autorizado en CORS | Sin cabeceras `Access-Control-*` | `seguridad` → CORS |

### 4.3 Contrato OpenAPI

`npm run contrato`: **20 de 20 respuestas reales cumplen** los esquemas de `docs/openapi.yaml`. Salida en [`evidencias/contrato-openapi.txt`](evidencias/contrato-openapi.txt).

### 4.4 Colección de Postman (Newman)

**62 peticiones, 93 aserciones, 0 fallidas**, tiempo medio de respuesta 18 ms. Salida completa en [`evidencias/newman-resultado.txt`](evidencias/newman-resultado.txt). Se agregó el caso «Recurso con id fuera de rango → 400», que reproduce el defecto D-01.

### 4.5 Prueba de carga y concurrencia

Equipo de prueba: VM de 2 núcleos, con el Gateway, los 5 servicios y PostgreSQL en la misma máquina (por lo que son cifras conservadoras). 50 usuarios concurrentes durante 20 s, sistema en modo `production`. El límite de peticiones del Gateway se desactivó **solo para esta medición** (`LIMITE_GENERAL_MIN=1000000`).

| Endpoint | Peticiones | Req/s | Media | p50 | p95 | p99 | Máx | Errores |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `GET /recursos?limit=20` | 11 146 | 557 | 90 ms | 84 ms | **130 ms** | 178 ms | 261 ms | 0 |
| `GET /reservas?limit=20` | 13 147 | 657 | 76 ms | 75 ms | **97 ms** | 109 ms | 163 ms | 0 |

Ambos cumplen el RNF (**p95 < 500 ms**, todas las respuestas 200). Datos en [`evidencias/carga-recursos.json`](evidencias/carga-recursos.json) y [`evidencias/carga-reservas.json`](evidencias/carga-reservas.json).

**Concurrencia sobre escrituras** (en `npm test`, donde un error sería un dato corrupto, no solo lentitud):

- 8 reservas simultáneas del mismo horario → exactamente 1 se crea; el resto responde 409 (la base de datos lo garantiza con una restricción `EXCLUDE`).
- 30 registros simultáneos con el mismo correo → exactamente 1 se crea y 29 responden 409, **ninguno 500**.
- 30 inicios de sesión simultáneos → los 30 responden 201, cada uno con su token.
- 200 lecturas simultáneas de `GET /recursos` → las 200 responden 200.

### 4.6 Prueba de humo post-despliegue

`npm run humo` contra el sistema en modo `production`: **9 de 9 pasos correctos**. Salida en [`evidencias/prueba-de-humo.txt`](evidencias/prueba-de-humo.txt).

## 5. Trazabilidad con el checklist de seguridad

Cada punto del checklist está asociado a las pruebas que lo comprueban en [`checklist-seguridad.md`](checklist-seguridad.md). Los defectos hallados están en [`defectos.md`](defectos.md).

## 6. Limitaciones de las pruebas

- La **construcción de la imagen Docker** (`docker compose up --build`) no se ejecutó en el equipo donde se prepararon estas pruebas porque no tenía el servicio de Docker. El mismo código se ejecutó en modo `production` con `npm start`, y `docker-compose.yml` se validó con `docker compose config`. El equipo debe correr el procedimiento de [`docs/despliegue.md`](../../docs/despliegue.md) en su máquina y agregar la captura.
- La prueba de carga mide **lecturas**; las escrituras se verifican por concurrencia correcta (sección 4.5), no por volumen.
- El rendimiento depende de la máquina: las cifras son de referencia.
