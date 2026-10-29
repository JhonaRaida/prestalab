# PrestaLab

Sistema de control de reservas y préstamos de equipo y espacios de laboratorio.
Proyecto Integrador de **Arquitectura Orientada a Servicios**, Ingeniería en Software, Politécnica Santa Rosa.

**Equipo "Tranquilo nos la navegamos":** Jhonatan Uriel Morales Badillo, José Vidal López Salazar, David Sosa Gómez, Alejandro Ramírez Contreras.
**Docente:** Ing. Luis Leonardo Mendoza Reséndiz.

---

## 1. ¿Qué es esto?

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

---

## 2. Cómo ejecutarlo (elige UNA opción)

### Opción A — Con Docker (la recomendada, es el RNF de portabilidad)

Necesitas **Docker Desktop** (o Docker Engine + Compose) y **Git**.

1. Clona el repositorio y entra a la carpeta:
   ```bash
   git clone https://github.com/JhonaRaida/prestalab.git
   cd prestalab
   ```
2. Crea tu archivo de configuración a partir del ejemplo:
   ```bash
   cp .env.example .env          # en Windows PowerShell: copy .env.example .env
   ```
3. **Abre `.env` y cambia** `JWT_SECRET` y `SERVICE_TOKEN` por cadenas largas y aleatorias (nunca subas `.env` a GitHub; ya está en `.gitignore`).
4. Levanta todo:
   ```bash
   docker compose up --build
   ```
   La primera vez tarda unos minutos (descarga imágenes e instala dependencias). Está listo cuando veas `[gateway] escuchando en el puerto 8080`.
5. Comprueba que todo está sano: abre <http://localhost:8080/health>. Debe decir `"ok"` en los cinco servicios.
6. Abre la documentación interactiva: <http://localhost:8080/docs>.

Para detener: `Ctrl + C`, o `docker compose down`. Para borrar también los datos: `docker compose down -v`.

### Opción B — Sin Docker (para desarrollar)

Necesitas **Node.js 20 o superior** y **PostgreSQL 14 o superior** instalado y corriendo.

1. `npm install`
2. `cp .env.example .env` y edita `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `SERVICE_TOKEN`.
3. Crea las cuatro bases (el usuario de `.env` debe poder crear bases de datos):
   ```bash
   npm run db:crear
   ```
4. Arranca el Gateway y los cinco servicios:
   ```bash
   npm start
   ```
   (Cada servicio sigue siendo independiente y se comunica por HTTP; `npm start` solo los abre juntos. También puedes arrancarlos por separado con `npm run start:usuarios`, `start:inventario`, `start:reservas`, `start:notificaciones`, `start:reportes`, `start:gateway`.)
5. Abre <http://localhost:8080/docs>.

Las tablas se crean solas al arrancar (scripts en `db/`) y, si la base está vacía, se cargan los **datos de prueba**.

---

## 3. Cuentas de demostración

Contraseña de todas: **`Prestalab123`**

| Correo | Rol | Notas |
|---|---|---|
| `admin@prestalab.mx` | administrador | todo |
| `encargado1@prestalab.mx` | encargado | Laboratorios de Cómputo y de Redes |
| `encargado2@prestalab.mx` | encargado | Laboratorio de Electrónica |
| `docente@prestalab.mx` | docente | hasta 5 reservas vigentes |
| `alumno1@prestalab.mx`, `alumno2@prestalab.mx` | alumno | hasta 2 reservas vigentes |

Datos de prueba: 6 usuarios, 3 laboratorios, 6 categorías y 12 recursos.

---

## 4. Cómo probarlo

### 4.1 Swagger UI (lo más rápido)
1. Entra a <http://localhost:8080/docs>.
2. Ejecuta `POST /sesiones` con `{"correo":"alumno1@prestalab.mx","contrasena":"Prestalab123"}` y copia el `tokenAcceso`.
3. Pulsa **Authorize** (arriba a la derecha), pega el token y ya puedes probar cualquier endpoint.

### 4.2 Postman
1. Importa `postman/PrestaLab.postman_collection.json` (y, si quieres, `PrestaLab.postman_environment.json`).
2. Pulsa **Run collection** y ejecútala completa **de arriba hacia abajo**: son 61 peticiones con 91 verificaciones que recorren el flujo completo (registrarse → reservar → entregar → devolver dañado → incidencia → reportes) y los errores 400, 401, 403, 404, 409 y 422. Encadena tokens e ids solas con variables.
3. Si cambiaste el puerto, edita la variable `baseUrl`.

### 4.3 Pruebas automáticas
Necesitan PostgreSQL y las bases creadas (`npm run db:crear`, o `docker compose up -d postgres` con el puerto publicado). **No** necesitan que el sistema esté corriendo: levantan sus propios servicios en puertos 4001–4005 y 4080.
```bash
npm test
```
57 pruebas: registro y login, autorización por rol, validaciones, CRUD, traslape, 8 reservas simultáneas del mismo horario (solo una gana), límite por rol, entrega/devolución, sanción automática, tarea programada, reportes y **tolerancia a fallos** (se apagan servicios a propósito). Cobertura medida: **92 %** (el RNF pide 60 %).

### 4.4 Contrato OpenAPI vs. realidad
Con el sistema corriendo:
```bash
npm run contrato
```
Valida que las respuestas reales cumplen los esquemas de `docs/openapi.yaml` (20 de 20).

### 4.5 Prueba de carga (RNF: p95 < 500 ms con 50 usuarios)
El Gateway limita las peticiones (429) para frenar abusos, así que para medir rendimiento hay que quitar ese límite **solo en la prueba**:
```bash
LIMITE_GENERAL_MIN=1000000 npm start     # en una terminal
npm run carga                            # en otra
```
Resultado de referencia (50 usuarios, 15 s, todo en una laptop/VM de 2 núcleos): ~530 peticiones/s, **p95 ≈ 130 ms**, 0 errores.

### 4.6 Demostrar la tolerancia a fallos (para la defensa)
Con Docker, mientras el sistema corre:
```bash
docker compose stop notificaciones     # las reservas SIGUEN funcionando (aviso "no bloqueante")
docker compose stop inventario         # crear reservas y consultar recursos responde 503 SERVICIO_NO_DISPONIBLE, pero Usuarios y Reservas siguen vivos
docker compose start inventario        # todo se recupera solo
```
Revisa también `GET /health`, que muestra qué servicio está caído.

---

## 5. Estructura del repositorio

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
│   ├── <servicio>/001_esquema.sql      tablas, llaves, índices y restricciones (Entrega 4)
│   ├── <servicio>/002_datos_prueba.sql datos de prueba (54 registros; se cargan solos si la tabla está vacía)
│   └── instalar.sql · reiniciar.sql · verificar.sql   instalación manual con psql, borrado y consultas de verificación
├── docs/openapi.yaml       contrato de la API (Entrega 3), también visible en /docs
├── docs/                   modelo-datos.json, diagrama-er.png, servicios-datos.png, evidencia-bd.txt (Entrega 4)
├── postman/                colección y entorno
├── scripts/                crear-bases, iniciar-todo, carga, validar-contrato, generar-postman, extraer-modelo.js (catálogo → modelo-datos.json), generar-er.py (necesita python3 + graphviz)
├── test/                   unit.test.js y e2e.test.js
├── Dockerfile · docker-compose.yml · .env.example
```

Cada servicio separa **rutas** (qué URL y qué rol), **controladores** (validan la entrada y arman la respuesta HTTP), **servicios** (reglas de negocio) y **repositorio** (SQL). Ningún servicio lee la base de otro: lo que necesita lo pide por HTTP.

### Base de datos a mano (Entrega 4)

```
psql -U postgres -f db/instalar.sql     # crea las 4 bases, tablas y datos de prueba (corre desde cualquier carpeta)
psql -U postgres -f db/verificar.sql    # conteos, consultas de verificación y pruebas de restricciones (con ROLLBACK)
psql -U postgres -f db/reiniciar.sql    # borra las 4 bases para empezar de cero
```
Para arrancar los servicios **sin** datos de prueba: `DATOS_PRUEBA=off` en `.env`.

---

## 6. Decisiones de diseño que conviene saber explicar

- **Sin traslapes garantizado por la base de datos.** `reservas` tiene una restricción `EXCLUDE USING gist (recurso_id WITH =, tstzrange(inicio, fin) WITH &&)` para reservas vigentes. Aunque dos peticiones lleguen al mismo milisegundo, PostgreSQL rechaza la segunda y la API responde `409 RESERVA_TRASLAPADA`. El límite de reservas por usuario se protege con un `pg_advisory_xact_lock` dentro de la transacción.
- **Devolución transaccional.** Registrar la devolución actualiza préstamo y reserva, crea incidencias, pone el recurso en mantenimiento (Inventario) y crea la sanción (Usuarios). Si Inventario o Usuarios no responden, **se revierte todo** y se responde 503; se puede reintentar sin dejar datos a medias.
- **Notificaciones no bloquea.** Si el servicio de avisos cae, la reserva se crea igual (solo se registra una advertencia).
- **Seguridad.** Contraseñas con bcrypt; JWT de 1 h; los servicios solo aceptan peticiones con el `X-Service-Token` interno, así que no se puede saltar el Gateway; el Gateway ignora cualquier `X-User-*` que mande el cliente; las rutas `/internal/v1` no se publican; el login no revela si falló el correo o la contraseña; los errores 500 no muestran detalles internos; límite de peticiones y cabeceras de `helmet`.
- **Reglas de negocio parametrizables** por variables de entorno: tolerancia (15 min), días de sanción (3), cancelar hasta 1 h antes, etc. (`shared/config.js`).
- **Tarea programada** (cada 60 s en el servicio de Reservas): cancela reservas no presentadas pasada la tolerancia, envía recordatorios 60 min antes y avisos cuando un préstamo se pasa de su hora.

### Diferencias menores respecto al borrador de la Entrega 3 (ya sincronizadas en `docs/openapi.yaml` y en el Word)
1. `Recurso` incluye dos datos informativos: `tipo` y `encargadoId`.
2. Dos rutas internas de **solo lectura** para Reportes: `GET /internal/v1/catalogo` (Inventario) y `GET /internal/v1/reportes/datos` (Reservas).
3. Dos códigos de error 422 nuevos: `LABORATORIO_NO_VALIDO` y `CATEGORIA_NO_VALIDA`.
4. Las fechas se devuelven en UTC (`...Z`), que también es ISO 8601 con zona; el cliente puede enviar cualquier offset.
5. Extras fuera de `/api/v1`: `GET /health` y `GET /docs`.

---

## 7. Qué está simulado o pendiente (honestidad ante el docente)

- El **envío de correo** es simulado (se imprime en la consola del servicio y se guarda la notificación como `enviada`). Para uno real, solo hay que cambiar la función `enviar` de `services/notificaciones/src/service.js` por un envío SMTP.
- Los datos de prueba usan una contraseña conocida; **no** son para producción.
- No hay interfaz gráfica: el alcance del proyecto es el backend y su API.

---

## 8. Problemas comunes

| Síntoma | Causa y solución |
|---|---|
| `Cannot connect to the Docker daemon` | Abre Docker Desktop y espera a que diga "running". |
| Puerto 8080 u 5432 ocupado | Cambia `PORT_GATEWAY` en `.env` (o detén el otro programa). |
| `password authentication failed` (sin Docker) | `DB_USER` / `DB_PASSWORD` de `.env` no coinciden con tu PostgreSQL local. |
| `database "usuarios_db" does not exist` | Falta `npm run db:crear`. |
| Cambié `DB_USER`/`DB_PASSWORD` y Docker sigue fallando | El volumen conserva la configuración vieja: `docker compose down -v` y vuelve a levantar. |
| 429 `DEMASIADAS_PETICIONES` | Es el límite del Gateway (a propósito). Espera un minuto, o súbelo con `LIMITE_SESIONES_MIN` / `LIMITE_GENERAL_MIN`. |
| 401 `TOKEN_INVALIDO` después de un rato | El token dura 1 hora; vuelve a iniciar sesión. |
| Quiero empezar con datos limpios (sin Docker) | `npm run db:reiniciar` (borra y recrea las bases) y vuelve a `npm start`. |

---

## 9. Flujo de trabajo en Git (como pide el proyecto)

Commits pequeños con mensajes claros y una etiqueta por entrega:
```bash
git tag entrega-5 && git push --tags
```
Etiquetas sugeridas: `entrega-1` … `entrega-8`. Nunca subas `.env` ni contraseñas reales.
