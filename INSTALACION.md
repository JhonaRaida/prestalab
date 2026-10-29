# Guía rápida de instalación (equipo)

Pasos para levantar PrestaLab en tu computadora con Docker. No necesitas instalar Node.js ni PostgreSQL: Docker trae todo.
Para más detalle (sin Docker, pruebas, Postman) revisa el `README.md`.

## 1. Lo que necesitas

- **Git** y una cuenta de **GitHub** con acceso al repositorio (pídele a Jhonatan que te agregue como colaborador).
- **Docker**:
  - **Windows / Mac:** instala [Docker Desktop](https://www.docker.com/products/docker-desktop/) y ábrelo antes de empezar.
  - **Linux (Ubuntu / Pop!_OS):**
    ```bash
    sudo apt update
    sudo apt install -y docker.io docker-compose-v2
    sudo docker run hello-world      # debe decir "Hello from Docker!"
    ```
    En Linux escribe `sudo` antes de cada comando `docker`.

## 2. Descargar el proyecto

El repositorio es privado, así que primero inicia sesión en GitHub desde la terminal:

```bash
gh auth login                        # si no tienes gh: sudo apt install -y gh  (Windows: winget install GitHub.cli)
git clone https://github.com/JhonaRaida/prestalab.git
cd prestalab
```

## 3. Crear tu archivo de configuración

```bash
cp .env.example .env                 # Windows PowerShell: copy .env.example .env
```

Abre `.env` y cambia `JWT_SECRET` y `SERVICE_TOKEN` por cualquier texto largo (por ejemplo `miClaveSuperLarga123abc...`).
**Nunca subas tu `.env` al repositorio** (ya está en `.gitignore`).

## 4. Levantar el sistema

```bash
docker compose up --build
```

La primera vez tarda unos minutos. Está listo cuando aparece:

```
[gateway] escuchando en el puerto 8080
```

Deja esa terminal abierta. Las siguientes veces basta con `docker compose up`.

## 5. Comprobar que funciona

- <http://localhost:8080/health> → los 5 servicios deben decir `"ok"`.
- <http://localhost:8080/docs> → documentación interactiva (Swagger) para probar la API.

Cuentas de prueba (contraseña de todas: `Prestalab123`):

| Correo | Rol |
|---|---|
| `admin@prestalab.mx` | administrador |
| `encargado1@prestalab.mx` | encargado |
| `docente@prestalab.mx` | docente |
| `alumno1@prestalab.mx` | alumno |

## 6. Ver la base de datos (Entrega 4)

En otra terminal, dentro de la carpeta `prestalab`:

```bash
docker compose exec postgres psql -U prestalab -d postgres -c "\l"        # las 4 bases
docker compose exec postgres psql -U prestalab -d reservas_db -c "\dt"    # tablas de una base
docker compose cp db/verificar.sql postgres:/tmp/verificar.sql
docker compose exec postgres psql -U prestalab -d postgres -f /tmp/verificar.sql   # consultas y pruebas
```

## 7. Apagar

`Ctrl + C` en la terminal donde corre, o `docker compose down`.
Para borrar también los datos y empezar de cero: `docker compose down -v`.

## Problemas comunes

| Mensaje | Qué hacer |
|---|---|
| `Cannot connect to the Docker daemon` | Abre Docker Desktop (o en Linux usa `sudo`). |
| `service "postgres" is not running` | El sistema está apagado: corre `docker compose up` primero. |
| `database "prestalab" does not exist` | No es una falla: es la revisión automática de Docker. Se puede ignorar. |
| Puerto 8080 ocupado | Cambia `PORT_GATEWAY` en `.env` o cierra el programa que lo usa. |
| `permission denied` en Linux | Te faltó `sudo` antes de `docker`. |
