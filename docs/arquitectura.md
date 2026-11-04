# Arquitectura de PrestaLab

Documento técnico del sistema. Para instalarlo y ejecutarlo, revisa el [`README.md`](../README.md).

## 1. Servicios

Una arquitectura SOA con **un API Gateway y cinco servicios**, cada uno con su responsabilidad y (salvo Reportes) su propia base de datos dentro de una sola instancia de PostgreSQL:

```
                       ┌──────────────┐
  Cliente / Postman ──▶│ API Gateway  │  :8080  (único puerto público)
                       │ JWT · límite │
                       └──────┬───────┘
        ┌───────────┬─────────┼──────────┬────────────┐
        ▼           ▼         ▼          ▼            ▼
   Usuarios y   Inventario  Reservas y  Notifica-   Reportes
   Autenticación   :3002    Préstamos   ciones      (solo lectura,
      :3001                   :3003       :3004      sin BD) :3005
        │           │          │           │
   usuarios_db  inventario_db reservas_db notificaciones_db      (PostgreSQL 16)
```

| Servicio | Responsabilidad | Requisitos |
|---|---|---|
| **Gateway** | Entrada única, valida el JWT, reenvía identidad y rol, limita peticiones (429), asigna `idPeticion`, responde 503 si un servicio no contesta, sirve `/docs` | RNF seguridad, tolerancia |
| **Usuarios y Autenticación** | Registro, inicio de sesión (JWT + bcrypt), roles, estado de cuenta, sanciones | RF-01, RF-02, RF-07 |
| **Inventario** | Laboratorios, categorías, recursos y su estado (activo / mantenimiento / baja) | RF-03 |
| **Reservas y Préstamos** | Disponibilidad, reservas, entrega y devolución, incidencias, sanción por retraso, tarea programada | RF-04 al RF-09 |
| **Notificaciones** | Confirmaciones, recordatorios y avisos de retraso (el correo se **simula** en consola) | RF-08 |
| **Reportes** | Uso, ocupación y retrasos; combina datos de Reservas e Inventario | RF-10 |

Stack: Node.js 22 + Express 5, PostgreSQL 16 (`pg` con SQL parametrizado, sin ORM), JWT + bcrypt, Zod, `http-proxy-middleware`, OpenAPI 3 + Swagger UI, Jest + Supertest, Docker Compose.

## 2. Estructura del repositorio

```
prestalab/
├── gateway/src/            API Gateway (app.js, rutas.js, index.js)
├── services/
│   ├── usuarios/src/       routes.js → controller.js → service.js → repository.js (+ app.js, index.js)
│   ├── inventario/src/     (misma estructura)
│   ├── reservas/src/       (misma estructura; incluye la tarea programada)
│   ├── notificaciones/src/ (misma estructura)
│   └── reportes/src/       (sin repository: no tiene BD)
├── shared/                 config, errores, validación (Zod), JWT, cliente HTTP entre servicios, acceso a BD
├── db/
│   ├── init/               crea las 4 bases (lo usa Docker la primera vez)
│   ├── <servicio>/001_esquema.sql      tablas, llaves, índices y restricciones
│   ├── <servicio>/002_datos_prueba.sql datos de prueba (se cargan solos si la tabla está vacía)
│   └── instalar.sql · reiniciar.sql · verificar.sql   instalación manual con psql, borrado y consultas de verificación
├── docs/                   este documento, cambios, contrato OpenAPI, modelo y diagramas de datos
├── postman/                colección y entorno de Postman
├── scripts/                crear-bases, iniciar-todo, carga, validar-contrato, generar-postman, extraer-modelo, generar-er
├── test/                   unit.test.js y e2e.test.js
├── entregas/               documentos, reportes y evidencias de cada entrega
└── Dockerfile · docker-compose.yml · .env.example
```

Cada servicio separa **rutas** (qué URL y qué rol), **controladores** (validan la entrada y arman la respuesta HTTP), **servicios** (reglas de negocio) y **repositorio** (SQL). Ningún servicio lee la base de otro: lo que necesita lo pide por HTTP.

Ejemplo, crear un recurso:

```
POST /api/v1/recursos
  └─ gateway/            valida el token y reenvía al servicio de Inventario
     └─ routes.js        define la ruta y qué rol puede usarla
        └─ controller.js valida los datos de entrada (400 si algo falta)
           └─ service.js aplica las reglas (laboratorio válido, código no repetido)
              └─ repository.js guarda en PostgreSQL (inventario_db)
```

Los errores tienen un formato único (`shared/errors.js`): 400 validación, 401 token, 403 permiso, 404 no existe, 409 conflicto, 422 regla de negocio, 429 límite, 500 error interno sin detalles, 503 servicio caído.

## 3. Decisiones de diseño

- **Sin traslapes garantizado por la base de datos.** `reservas` tiene una restricción `EXCLUDE USING gist (recurso_id WITH =, tstzrange(inicio, fin) WITH &&)` para reservas vigentes. Aunque dos peticiones lleguen al mismo milisegundo, PostgreSQL rechaza la segunda y la API responde `409 RESERVA_TRASLAPADA`. El límite de reservas por usuario se protege con un `pg_advisory_xact_lock` dentro de la transacción.
- **Devolución transaccional.** Registrar la devolución actualiza préstamo y reserva, crea incidencias, pone el recurso en mantenimiento (Inventario) y crea la sanción (Usuarios). Si Inventario o Usuarios no responden, **se revierte todo** y se responde 503; se puede reintentar sin dejar datos a medias.
- **Notificaciones no bloquea.** Si el servicio de avisos cae, la reserva se crea igual (solo se registra una advertencia).
- **Borrado lógico.** Un recurso con historial no se borra: `DELETE` lo marca como `baja`. Una reserva tampoco se borra: se cancela.
- **Seguridad.** Contraseñas con bcrypt; JWT de 1 h (configurable con `JWT_EXPIRA_SEGUNDOS`); los servicios solo aceptan peticiones con el `X-Service-Token` interno, así que no se puede saltar el Gateway; el Gateway ignora cualquier `X-User-*` que mande el cliente; las rutas `/internal/v1` no se publican; el login no revela si falló el correo o la contraseña; los errores 500 no muestran detalles internos; límite de peticiones y cabeceras de `helmet`.
- **Reglas de negocio parametrizables** por variables de entorno: tolerancia (15 min), días de sanción (3), cancelar hasta 1 h antes, etc. (`shared/config.js`).
- **Tarea programada** (cada 60 s en el servicio de Reservas): cancela reservas no presentadas pasada la tolerancia, envía recordatorios 60 min antes y avisos cuando un préstamo se pasa de su hora.

## 4. Limitaciones actuales

- El **envío de correo** es simulado: el aviso se imprime en la consola del servicio y la notificación se guarda como `enviada`. Para usar correo real basta con cambiar la función `enviar` de `services/notificaciones/src/service.js` por un envío SMTP.
- Los datos de prueba usan una contraseña conocida, por lo que **no** son para producción.
- Por ahora no hay interfaz gráfica: el alcance del proyecto es el backend y su API.

## 5. Pruebas avanzadas

### Pruebas automáticas

Necesitan PostgreSQL y las bases creadas (`npm run db:crear`, o `docker compose up -d postgres` con el puerto publicado). **No** necesitan que el sistema esté corriendo: levantan sus propios servicios en los puertos 4001–4005 y 4080.

```bash
npm test
```

57 pruebas: registro y login, autorización por rol, validaciones, CRUD, traslape, 8 reservas simultáneas del mismo horario (solo una gana), límite por rol, entrega/devolución, sanción automática, tarea programada, reportes y **tolerancia a fallos** (se apagan servicios a propósito). Cobertura medida: **92 %** (el RNF pide 60 %).

### Contrato OpenAPI contra la API real

Con el sistema corriendo:

```bash
npm run contrato
```

Valida que las respuestas reales cumplen los esquemas de `docs/openapi.yaml` (20 de 20).

### Prueba de carga (RNF: p95 < 500 ms con 50 usuarios)

El Gateway limita las peticiones (429) para frenar abusos, así que para medir rendimiento hay que quitar ese límite **solo en la prueba**:

```bash
LIMITE_GENERAL_MIN=1000000 npm start     # en una terminal (en PowerShell: $env:LIMITE_GENERAL_MIN=1000000; npm start)
npm run carga                            # en otra
```

Resultado de referencia (50 usuarios, 15 s, laptop/VM de 2 núcleos): ~530 peticiones/s, **p95 ≈ 130 ms**, 0 errores.

### Tolerancia a fallos

Con Docker, mientras el sistema corre:

```bash
docker compose stop notificaciones     # las reservas SIGUEN funcionando (aviso "no bloqueante")
docker compose stop inventario         # crear reservas y consultar recursos responde 503, pero Usuarios y Reservas siguen vivos
docker compose start inventario        # todo se recupera solo
```

`GET /health` muestra qué servicio está caído.

### Base de datos sin Docker

```bash
psql -U postgres -f db/instalar.sql     # crea las 4 bases, tablas y datos de prueba
psql -U postgres -f db/verificar.sql    # conteos, consultas de verificación y pruebas de restricciones (con ROLLBACK)
psql -U postgres -f db/reiniciar.sql    # borra las 4 bases para empezar de cero
```

Para arrancar los servicios **sin** datos de prueba: `DATOS_PRUEBA=off` en `.env`.

## 6. Flujo de trabajo en Git

El equipo trabaja con commits pequeños y mensajes claros. Cada entrega se marca con una etiqueta (`entrega-1` a `entrega-8`) y sus documentos están en `entregas/entrega-N/`.

Para marcar una entrega nueva:

```bash
git tag entrega-5 && git push --tags
```

El archivo `.env` y las contraseñas reales nunca se suben al repositorio.
