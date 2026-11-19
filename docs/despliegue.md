# Despliegue de PrestaLab

Procedimiento reproducible para poner PrestaLab en marcha en un servidor o en una computadora, y comprobar que quedó bien. Para la instalación paso a paso en una computadora de desarrollo, revisa el [`README.md`](../README.md).

Hay dos formas de desplegar. **La recomendada es Docker Compose** (un solo comando, una sola configuración).

| | Opción A: Docker Compose (recomendada) | Opción B: sin Docker |
|---|---|---|
| Qué necesita | Docker | Node.js 20 o superior y PostgreSQL 14 o superior |
| Qué levanta | PostgreSQL 16 + Gateway + 5 servicios | Los procesos de Node; la base de datos es la que ya tengas |
| Cuándo | Servidor o demostración | Servidor sin Docker |

## 1. Configuración (`.env`)

Ambas opciones leen un archivo `.env` junto a `package.json`. Se crea a partir del ejemplo:

```bash
cp .env.example .env
```

| Variable | ¿Obligatoria? | Para qué sirve |
|---|:---:|---|
| `JWT_SECRET` | **Sí** | Clave con la que se firman los inicios de sesión. |
| `SERVICE_TOKEN` | **Sí** | Clave que los servicios se piden entre sí; evita saltarse el Gateway. |
| `DB_USER`, `DB_PASSWORD` | Sí | Usuario y contraseña de PostgreSQL. Cámbialos en un servidor real. |
| `DB_HOST`, `DB_PORT` | Opción B | Dónde está PostgreSQL (Docker ya lo pone). |
| `PORT_GATEWAY` | No (8080) | Único puerto que se publica al exterior. |
| `CORS_ORIGINS` | No (vacío) | Sitios web autorizados a llamar la API desde un navegador, separados por coma. |
| `DATOS_PRUEBA` | No (`on`) | Ponlo en `off` en un despliegue real para no cargar los usuarios de demostración. |
| `JWT_EXPIRA_SEGUNDOS` | No (3600) | Duración de la sesión. |
| `LIMITE_SESIONES_MIN`, `LIMITE_GENERAL_MIN` | No (20 / 600) | Límite de peticiones por minuto y por IP. |

### Secretos

`JWT_SECRET` y `SERVICE_TOKEN` **no pueden ser los de ejemplo**. En producción (`NODE_ENV=production`, que es lo que usa Docker) el sistema se niega a arrancar si faltan, son los de ejemplo o miden menos de 16 caracteres, y lo dice así:

```
Error: Configuración insegura: JWT_SECRET no está configurado, es el valor de ejemplo o tiene menos de 16 caracteres. Edita el archivo .env
```

Para generar uno bueno (corre el comando dos veces, uno para cada variable):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Nunca subas el archivo `.env` al repositorio (ya está en `.gitignore`).

## 2. Opción A — Docker Compose

```bash
git clone https://github.com/JhonaRaida/prestalab.git
cd prestalab
cp .env.example .env          # y edita JWT_SECRET y SERVICE_TOKEN (sección 1)
docker compose up --build -d  # -d = en segundo plano
docker compose ps             # los 7 contenedores deben estar "healthy" o "running"
```

- La primera vez se crean solas las 4 bases de datos, sus tablas y (si `DATOS_PRUEBA` no es `off`) los datos de prueba.
- Solo el Gateway se publica (puerto 8080). Los servicios y la base de datos quedan en la red interna de Docker.
- Los datos viven en el volumen `pgdata` y se conservan al reiniciar.

Comandos de operación:

| Acción | Comando |
|---|---|
| Ver registros de todo | `docker compose logs -f` |
| Ver los de un servicio | `docker compose logs -f reservas` |
| Apagar (conserva los datos) | `docker compose down` |
| Apagar y **borrar los datos** | `docker compose down -v` |
| Actualizar a una versión nueva | `git pull && docker compose up --build -d` |

## 3. Opción B — Sin Docker

Con Node.js 20+ y PostgreSQL ya instalados y corriendo:

```bash
git clone https://github.com/JhonaRaida/prestalab.git
cd prestalab
npm ci --omit=dev
cp .env.example .env          # edita DB_*, JWT_SECRET y SERVICE_TOKEN
npm run db:crear              # crea las 4 bases (o: psql -U <usuario> -d postgres -f db/instalar.sql)
NODE_ENV=production npm start # arranca el Gateway y los 5 servicios
```

En Windows (PowerShell), la última línea es:

```powershell
$env:NODE_ENV="production"; npm start
```

Para dejarlo como servicio permanente conviene un administrador de procesos (por ejemplo `pm2 start npm --name prestalab -- start`) o un servicio `systemd`.

## 4. HTTPS

PrestaLab **no termina HTTPS por sí mismo**. En un servidor real debe ir detrás de un *proxy inverso* con certificado (Nginx, Caddy, Traefik o el balanceador de la nube) que reenvíe al puerto 8080. El Gateway ya confía en un proxy (`trust proxy`) para leer la IP real del cliente y envía la cabecera `Strict-Transport-Security`.

Ejemplo mínimo con Caddy (obtiene el certificado solo):

```
prestalab.ejemplo.mx {
    reverse_proxy localhost:8080
}
```

## 5. Comprobar que quedó bien

```bash
curl http://localhost:8080/health      # {"gateway":"ok","servicios":{... todos "ok"}}
npm run humo                           # 9 comprobaciones de solo lectura
```

`npm run humo` revisa: salud del Gateway y de los 5 servicios, documentación en `/docs`, que una ruta protegida sin token responde 401, que se puede iniciar sesión y consultar, que una entrada inválida da 400 (no 500), que las rutas internas no están publicadas, las cabeceras de seguridad y que CORS no está abierto. Con `DATOS_PRUEBA=off` no existen las cuentas de demostración; indica una cuenta real:

```bash
CORREO=admin@miinstitucion.mx CONTRASENA='...' BASE_URL=https://prestalab.ejemplo.mx npm run humo
```

## 6. Respaldo y restauración de la base de datos

PrestaLab usa 4 bases (`usuarios_db`, `inventario_db`, `reservas_db`, `notificaciones_db`). Respaldo de cada una:

```bash
# Con Docker
docker compose exec -T postgres pg_dump -U prestalab -Fc usuarios_db > usuarios_db.dump
# Sin Docker
pg_dump -h localhost -U prestalab -Fc usuarios_db -f usuarios_db.dump
```

Restauración en una base vacía:

```bash
createdb -h localhost -U prestalab usuarios_db
pg_restore -h localhost -U prestalab -d usuarios_db usuarios_db.dump
```

(Repite para las otras tres.) El procedimiento se verificó restaurando `usuarios_db` en una base nueva: 248 usuarios en el original y 248 en la copia.

Para empezar de cero sin Docker: `psql -U <usuario> -d postgres -f db/reiniciar.sql` y luego `db/instalar.sql`.

## 7. Revertir una actualización

```bash
git log --oneline -5                   # elige la versión anterior (o una etiqueta: git tag)
git checkout entrega-6                 # ejemplo: volver a la versión de la Entrega 6
docker compose up --build -d
```

Las tablas se crean con `CREATE … IF NOT EXISTS`, así que arrancar una versión anterior sobre la misma base de datos no la borra.

## 8. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| El proceso termina con «Configuración insegura» | `JWT_SECRET` o `SERVICE_TOKEN` siguen siendo los de ejemplo o son muy cortos. Edita `.env` (sección 1). |
| `ECONNREFUSED` o «password authentication failed» | PostgreSQL no está corriendo o `DB_USER`/`DB_PASSWORD` no coinciden. Con Docker, si los cambiaste después de la primera vez: `docker compose down -v` y vuelve a levantar. |
| `/health` responde 503 | Algún servicio está caído; el cuerpo dice cuál. Revisa `docker compose logs <servicio>`. |
| 429 `DEMASIADAS_PETICIONES` | Es el límite de peticiones. Espera un minuto; para medir rendimiento se sube con `LIMITE_GENERAL_MIN`. |
| El navegador bloquea la llamada (CORS) | Agrega el origen del sitio a `CORS_ORIGINS` y reinicia el Gateway. |
| Puerto 8080 ocupado | Cambia `PORT_GATEWAY` en `.env`. |

## 9. Evidencia de despliegue

El 18 de noviembre de 2026 se desplegó la rama `entrega-7` **sin Docker** (Opción B), en modo `production`, con PostgreSQL 16 y un `.env` con secretos generados:

```
$ NODE_ENV=production npm start
[usuarios] escuchando en el puerto 3001
[inventario] escuchando en el puerto 3002
[notificaciones] escuchando en el puerto 3004
[reservas] escuchando en el puerto 3003
[reportes] escuchando en el puerto 3005
[gateway] escuchando en el puerto 8080
PrestaLab listo → http://localhost:8080/docs
```

`npm run humo` → **9 de 9 pasos correctos** (salida en [`entregas/entrega-7/evidencias/prueba-de-humo.txt`](../entregas/entrega-7/evidencias/prueba-de-humo.txt)), y la negativa a arrancar con secretos de ejemplo se comprobó a mano.

> **Pendiente para el equipo:** la Opción A (`docker compose up --build`) no pudo ejecutarse donde se preparó esta entrega porque no había servicio de Docker disponible; `docker-compose.yml` sí se validó con `docker compose config`. Antes de entregar conviene correrla en una computadora con Docker Desktop y agregar la captura de `docker compose ps` en `entregas/entrega-7/evidencias/`.
