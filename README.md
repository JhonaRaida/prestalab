# PrestaLab

Sistema de reserva y control de préstamo de equipo y espacios de laboratorio, construido con Arquitectura Orientada a Servicios: un **API Gateway** y **cinco servicios** (Usuarios, Inventario, Reservas, Notificaciones y Reportes) con **PostgreSQL**.

Proyecto Integrador de Arquitectura Orientada a Servicios · Ingeniería en Software · Politécnica Santa Rosa
**Equipo "Tranquilo nos la navegamos":** Jhonatan Uriel Morales Badillo, José Vidal López Salazar, David Sosa Gómez, Alejandro Ramírez Contreras
**Docente:** Ing. Luis Leonardo Mendoza Reséndiz

Este archivo explica cómo **instalar y ejecutar** el proyecto. La documentación técnica está en [`docs/`](docs/) y los documentos y evidencias de cada entrega en [`entregas/`](entregas/).

---

## 1. Requisitos

- **Git**
- **Docker** con Docker Compose (ya incluye Node.js y PostgreSQL, no hace falta instalarlos aparte):
  - **Windows / Mac:** instala [Docker Desktop](https://www.docker.com/products/docker-desktop/) y ábrelo antes de empezar.
  - **Linux (Ubuntu / Pop!_OS):**
    ```bash
    sudo apt update
    sudo apt install -y docker.io docker-compose-v2
    sudo docker run hello-world      # debe decir "Hello from Docker!"
    ```
    En Linux escribe `sudo` antes de cada comando `docker`.

## 2. Instalación

```bash
git clone https://github.com/JhonaRaida/prestalab.git
cd prestalab
cp .env.example .env          # Windows PowerShell: copy .env.example .env
```

Abre `.env` y cambia `JWT_SECRET` y `SERVICE_TOKEN` por textos largos y aleatorios. El archivo `.env` nunca se sube al repositorio (ya está en `.gitignore`).

## 3. Ejecución

```bash
docker compose up --build
```

La primera vez tarda unos minutos. El sistema está listo cuando aparece:

```
[gateway] escuchando en el puerto 8080
```

Deja esa terminal abierta. Las siguientes veces basta con `docker compose up`.

Al arrancar se crean solas las 4 bases de datos, sus tablas y los datos de prueba.

### Comprobar que funciona

- <http://localhost:8080/health> → el Gateway y los 5 servicios responden `"ok"`.
- <http://localhost:8080/docs> → documentación interactiva de la API (Swagger).

### Apagar

`Ctrl + C` en la terminal donde corre, o `docker compose down`.
Para borrar también los datos y empezar de cero: `docker compose down -v`.

## 4. Cuentas de prueba

Contraseña de todas: **`Prestalab123`**

| Correo | Rol |
|---|---|
| `admin@prestalab.mx` | administrador |
| `encargado1@prestalab.mx` | encargado (Laboratorios de Cómputo y de Redes) |
| `encargado2@prestalab.mx` | encargado (Laboratorio de Electrónica) |
| `docente@prestalab.mx` | docente |
| `alumno1@prestalab.mx`, `alumno2@prestalab.mx` | alumno |

## 5. Probar la API

### Con Postman

1. **File → Import** y selecciona los **dos archivos** de la carpeta `postman/`: `PrestaLab.postman_collection.json` y `PrestaLab.postman_environment.json`. No abras la carpeta como carpeta local, porque Postman la convierte a su formato y borra los `.json`.
2. Arriba a la derecha elige el entorno **PrestaLab local**.
3. Abre cualquier petición y pulsa **Send**. No hace falta iniciar sesión antes: si falta el token de la cuenta que usa la petición o ya venció (dura 1 hora), la colección inicia sesión sola.
4. Para correr las 61 peticiones de una vez: clic derecho en la colección → **Run collection**.

### Desde la terminal (Newman)

Con el sistema corriendo, en otra terminal:

```bash
npx -p newman -p newman-reporter-htmlextra newman run postman/PrestaLab.postman_collection.json \
  -e postman/PrestaLab.postman_environment.json -r cli,htmlextra \
  --reporter-htmlextra-export reporte-postman.html
```

Muestra el resultado de cada petición y genera `reporte-postman.html` para verlo en el navegador.

### Con Swagger

1. Entra a <http://localhost:8080/docs>.
2. Ejecuta `POST /sesiones` con `{"correo":"alumno1@prestalab.mx","contrasena":"Prestalab123"}` y copia el `tokenAcceso`.
3. Pulsa **Authorize**, pega el token y prueba cualquier endpoint.

## 6. Ver la base de datos

En otra terminal, dentro de la carpeta del proyecto:

```bash
docker compose exec postgres psql -U prestalab -d postgres -c "\l"        # las 4 bases
docker compose exec postgres psql -U prestalab -d reservas_db -c "\dt"    # tablas de una base
docker compose cp db/verificar.sql postgres:/tmp/verificar.sql
docker compose exec postgres psql -U prestalab -d postgres -f /tmp/verificar.sql   # consultas y pruebas
```

## 7. Ejecutar sin Docker (opcional)

Necesitas **Node.js 20 o superior** y **PostgreSQL 14 o superior** corriendo.

```bash
npm install
cp .env.example .env     # edita DB_USER, DB_PASSWORD, JWT_SECRET y SERVICE_TOKEN
npm run db:crear         # crea las 4 bases
npm start                # arranca el Gateway y los 5 servicios
```

Pruebas automáticas: `npm test` (necesitan PostgreSQL y las bases creadas, pero no que el sistema esté corriendo).

## 8. Problemas comunes

| Mensaje | Qué hacer |
|---|---|
| `Cannot connect to the Docker daemon` | Abre Docker Desktop (o en Linux usa `sudo`). |
| `permission denied` en Linux | Te faltó `sudo` antes de `docker`. |
| `service "postgres" is not running` | El sistema está apagado: corre `docker compose up` primero. |
| `database "prestalab" does not exist` | No es una falla: es la revisión automática de Docker. Se puede ignorar. |
| Puerto 8080 ocupado | Cambia `PORT_GATEWAY` en `.env` o cierra el programa que lo usa. |
| Cambié `DB_USER`/`DB_PASSWORD` y Docker sigue fallando | El volumen conserva la configuración vieja: `docker compose down -v` y vuelve a levantar. |
| 401 `TOKEN_INVALIDO` | El token dura 1 hora: vuelve a iniciar sesión (la colección de Postman lo hace sola). |
| 429 `DEMASIADAS_PETICIONES` | Es el límite del Gateway (a propósito). Espera un minuto. |
| `password authentication failed` (sin Docker) | `DB_USER` / `DB_PASSWORD` de `.env` no coinciden con tu PostgreSQL. |

## 9. Más información

| Documento | Contenido |
|---|---|
| [`docs/arquitectura.md`](docs/arquitectura.md) | Servicios, estructura del código, decisiones de diseño, limitaciones y pruebas avanzadas |
| [`docs/cambios.md`](docs/cambios.md) | Cambios respecto al diseño de entregas anteriores |
| [`docs/openapi.yaml`](docs/openapi.yaml) | Contrato de la API (también en <http://localhost:8080/docs>) |
| [`entregas/`](entregas/) | Documentos, reportes y evidencias de cada entrega |
