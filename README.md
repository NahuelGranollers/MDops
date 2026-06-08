# MD Ops

MD Ops es una plataforma self-hosted para gestionar bolos, horarios, disponibilidad, logistica, avisos y auditoria de un equipo tecnico.

## Arquitectura Elegida

- Frontend: Next.js + TypeScript. Permite una UI responsive, rapida y preparada para futuras rutas moviles o PWA.
- Backend: Fastify + TypeScript. API ligera, mantenible, con validacion Zod, rate limiting, headers seguros y estructura modular.
- Base de datos: PostgreSQL + Prisma. Modelo relacional robusto, migraciones claras e indices para agenda, usuarios y auditoria.
- Auth: JWT access + refresh tokens self-hosted, RBAC granular con roles y permisos. Evita depender de un BaaS y deja camino abierto a Keycloak si el equipo crece.
- Realtime: SSE desde backend. Simple para self-hosting, compatible con proxy, suficiente para autosincronizar agenda, disponibilidad y avisos. El bus interno puede evolucionar a PostgreSQL LISTEN/NOTIFY sin cambiar el frontend.
- Mapas: provider abstracto. Ahora incluye provider mock editable; la interfaz queda preparada para Google Places u otro proveedor.
- Deploy: Docker Compose con Postgres, API, Web y Caddy opcional como reverse proxy.

## Arbol De Carpetas

```text
md-ops/
  apps/
    api/
      prisma/schema.prisma
      prisma/seed.ts
      src/auth
      src/events
      src/availability
      src/users
      src/notifications
      src/maps
      src/realtime
      src/exports
      src/audit
      src/settings
      src/tests
    web/
      src/app
      src/components
      src/lib
  packages/shared/
  infra/caddy/
  scripts/
  docs/
  docker-compose.yml
  .env.example
```

## Esquema De Datos

Entidades principales:

- `Tenant`: empresa/equipo. Deja multitenancy ligera lista.
- `User`, `Role`, `Permission`, `UserRole`, `RolePermission`: auth y RBAC.
- `Event`: bolo con ciudad, local, hotel, notas visibles/internas, estado, tags y soft delete.
- `Logistics`: datos de salida, furgo, horarios estimados, contacto y presupuesto.
- `EventAssignment`: personas asignadas, rol operativo y estado de confirmacion.
- `AvailabilityRequest` y `AvailabilityStatusHistory`: indisponibilidad y trazabilidad de resolucion.
- `Notification`: avisos in-app.
- `AuditLog`: cambios relevantes con antes/despues.
- `Attachment`: documentos vinculables a bolos.
- `Place`: cache de lugares y coordenadas.
- `ReadReceipt`, `Comment`, `ConflictLog`, `Setting`: lectura, comentarios, conflictos y configuracion.

## Endpoints Principales

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- `GET /api/events`
- `POST /api/events`
- `PUT /api/events/:id`
- `POST /api/events/:id/duplicate`
- `DELETE /api/events/:id`
- `GET /api/availability`
- `POST /api/availability`
- `POST /api/availability/:id/resolve`
- `GET /api/users`
- `POST /api/users`
- `GET /api/notifications`
- `GET /api/audit`
- `GET /api/exports/events.csv`
- `GET /api/places/search?q=...`
- `GET /api/stream`

## Instalacion Local

Requisitos:

- Node.js 22 o superior.
- Docker Desktop en Windows/macOS, o Docker Engine en Linux. En Windows, `dev-lan.bat` intenta instalar Docker Desktop automaticamente con `winget` si falta.
- pnpm 9.15.4 o Corepack disponible para usar la version fijada en `package.json`. En Windows, `dev-lan.bat` intenta preparar Node.js/pnpm automaticamente si faltan.

1. Copia variables:

```bash
cp .env.example .env
```

2. Activa pnpm con Corepack, o instala pnpm globalmente si tu instalacion de Node no trae Corepack:

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
# Alternativa:
npm install -g pnpm@9.15.4
```

3. Arranca servicios:

```bash
docker compose up -d --build postgres
corepack pnpm install
corepack pnpm db:generate
corepack pnpm db:dev
corepack pnpm db:seed
corepack pnpm dev
```

Si Docker falla descargando desde Docker Hub con `context deadline exceeded`, `dev-lan.bat` cambia automaticamente a este mirror publico de AWS ECR y reintenta:

```env
POSTGRES_IMAGE=public.ecr.aws/docker/library/postgres:16-alpine
```

Para hacerlo a mano:

```bash
docker compose up -d postgres
```

Tambien puedes usar un PostgreSQL local y ajustar `DATABASE_URL` en `.env` a tu host/puerto.

Para desarrollo local fuera de Docker, `DATABASE_URL` debe apuntar a `localhost`, por ejemplo:

```env
POSTGRES_PORT=55432
DATABASE_URL=postgresql://md_ops:md_ops_dev_password@localhost:55432/md_ops?schema=public
```

Dentro de Docker, el compose inyecta automaticamente una URL interna con host `postgres`.

Si Docker esta bloqueado pero tienes PostgreSQL instalado en Windows, puedes usar una instancia aislada del proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-local-postgres.ps1
```

Y en `.env`:

```env
DATABASE_URL=postgresql://md_ops:md_ops_dev_password@localhost:55432/md_ops?schema=public
```

### Correo gratuito por SMTP

MD Ops envia emails desde los avisos internos cuando hay SMTP configurado. Los avisos salen en HTML con resumen visual del bolo, horarios, logistica y equipo, manteniendo texto plano como respaldo. Sin SMTP, la app sigue funcionando y deja el intento en `logs/session-*.jsonl`.

Variables en `.env`:

```env
EMAIL_NOTIFICATIONS_ENABLED=true
PUBLIC_APP_URL=http://localhost:3000
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu_correo@gmail.com
SMTP_PASSWORD=tu_password_de_aplicacion
SMTP_FROM=tu_correo@gmail.com
SMTP_FROM_NAME=MD Ops
SMTP_REPLY_TO=
```

Para Outlook/Hotmail normalmente usa `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587` y `SMTP_SECURE=false`. En Gmail suele hacer falta una password de aplicacion. En `Ajustes > Correo` puedes ver el estado y enviar una prueba a un email real.

3. Abre:

```text
http://localhost:3000
```

Credenciales iniciales:

- Admins: `admin`, `albert`, `lake` o `lago`, `ferran`
- Usuarios: `nahuel`, `dani`, `david` o `sancho`, `alex`, `xavi`

Password inicial: `2001`

### Autologin local

En desarrollo el autologin esta activo por defecto y entra con `admin`. Puedes cambiarlo o apagarlo en `.env`:

```env
AUTOLOGIN_ENABLED=true
AUTOLOGIN_IDENTIFIER=admin
AUTOLOGIN_ALLOW_PRODUCTION=false
```

`AUTOLOGIN_IDENTIFIER` acepta los mismos alias del login manual (`admin`, `albert`, `nahuel`, etc.). En `NODE_ENV=production` queda bloqueado salvo que actives explicitamente `AUTOLOGIN_ALLOW_PRODUCTION=true`.

## Version Portable LAN

Para crear un paquete portable:

```powershell
pnpm portable:build
```

El ZIP queda en `dist/md-ops-portable.zip`. Descomprimelo en cualquier Windows y ejecuta `MD-Ops-Portable.bat`; el lanzador intenta preparar Node.js, pnpm, Docker Desktop/PostgreSQL, migraciones y seed de forma automatica. Al arrancar muestra la URL local y la IP LAN para probar desde otro equipo o movil.

Logs:

- Arranque portable: `logs/portable-*.log`
- Sesion API, llamadas cliente y errores: `logs/session-*.jsonl`

## Despliegue En Servidor Linux

1. Instala Docker y Docker Compose.
2. Sube la carpeta `md-ops` al servidor.
3. Crea `.env` desde `.env.example` y cambia secretos, dominio y passwords.
4. Ejecuta:

```bash
docker compose --profile prod up -d --build
docker compose exec api pnpm prisma db seed
```

Puertos:

- Web interno: `3000`
- API interno: `4000`
- Caddy: `80/443`
- Postgres solo dentro de Docker por defecto

Para dominio y HTTPS, apunta tu DNS al servidor y usa el servicio `caddy` del compose. En producción cambia `PUBLIC_APP_URL` y `CORS_ORIGIN` a tu dominio real.

## Backups

Ejemplo:

```bash
./scripts/backup-postgres.sh
```

Guarda también el volumen `uploads_data` si usas adjuntos.

## Actualizacion

```bash
git pull
docker compose --profile prod up -d --build
docker compose exec api pnpm prisma migrate deploy
```

## Tests

```bash
corepack pnpm test
```

Incluye pruebas para:

- regla de descanso minimo cruzando medianoche
- aislamiento por usuario en conflictos
- deteccion de rol admin por RBAC, no por nombres

## Solucion De Problemas

Si aparece `docker: command not found`, Docker no esta instalado o no esta en el PATH. En Windows instala Docker Desktop, abre Docker Desktop una vez y vuelve a ejecutar el comando en una terminal nueva.

Si usas `dev-lan.bat` en Windows, el script intenta instalar Docker Desktop para el usuario actual con el instalador oficial, abrirlo y esperar a que el daemon este listo. Si eso falla, usa `winget` como alternativa. Si Windows pide reinicio tras la instalacion, reinicia y vuelve a ejecutar `dev-lan.bat`.

Si WSL no esta instalado, `dev-lan.bat` intenta habilitar WSL y Virtual Machine Platform desde una ventana de administrador. Windows puede requerir reinicio antes de poder instalar/arrancar Docker Desktop.

Si aparece `pnpm: command not found`, usa Corepack:

```bash
corepack enable
corepack pnpm install
```

Si aparece `"corepack" no se reconoce como un comando interno o externo`, ejecuta `dev-lan.bat`: en Windows intenta instalar Node.js LTS con `winget` y despues activar pnpm. Si `winget` no esta disponible, instala Node.js 22 o superior desde `https://nodejs.org/`. Si `node -v` funciona pero Corepack no existe, instala pnpm directamente:

```bash
npm install -g pnpm@9.15.4
pnpm install
pnpm db:generate
```

En Windows puede aparecer `EPERM: operation not permitted, open 'C:\Program Files\nodejs\pnpx'`. Significa que Corepack no puede crear accesos globales en la carpeta de Node. Tienes dos opciones:

- Abrir la terminal como administrador y ejecutar `corepack enable`.
- No activar accesos globales y usar siempre `corepack pnpm ...`, por ejemplo `corepack pnpm install`.

## Futuras Ampliaciones

- Cambiar `MockMapsProvider` por Google Places manteniendo el contrato `MapsProvider`.
- Sustituir bus SSE interno por PostgreSQL LISTEN/NOTIFY o Redis Pub/Sub si hay varias instancias API.
- Añadir email, Telegram, WhatsApp o push usando la tabla `Notification` como fuente unica.
- Activar almacenamiento S3 compatible para adjuntos si el volumen local se queda corto.
- Añadir vista calendario avanzada con drag and drop sobre la API actual.
