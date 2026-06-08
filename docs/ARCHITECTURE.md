# Arquitectura

La aplicacion separa dominio operativo, API, UI y despliegue.

## Backend

Fastify se organiza por modulos:

- `auth`: login, refresh, sesion y RBAC.
- `events`: CRUD de bolos, duplicado y conflictos.
- `availability`: solicitudes, aprobacion y rechazo.
- `notifications`: avisos in-app.
- `audit`: trazabilidad.
- `maps`: capa provider intercambiable.
- `realtime`: SSE para sincronizacion.
- `exports`: CSV inicial.

La validacion vive en `packages/shared` para reutilizar reglas entre frontend y backend.

## Regla De Descanso

`detectRestConflicts` recibe ventanas de trabajo por usuario, ordena por inicio y compara `next.startsAt - current.endsAt`. Esto soporta eventos nocturnos porque usa fechas absolutas.

## Seguridad

- Hash de password con bcrypt.
- JWT access corto y refresh tokens revocables.
- RBAC con permisos granulares.
- Rate limiting por minuto.
- Helmet, CORS configurable y validacion Zod.
- Soft delete en bolos y usuarios.

## Realtime

SSE se eligio porque es simple, estable detras de proxies y suficiente para avisar cambios de agenda. Para escalar a varias replicas, el emisor puede conectarse a PostgreSQL LISTEN/NOTIFY o Redis sin cambiar la API publica `/api/stream`.
