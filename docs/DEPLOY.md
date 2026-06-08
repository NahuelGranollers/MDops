# Guia De Despliegue

## Variables criticas

- `DATABASE_URL`: conexion PostgreSQL interna.
- `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`: usa valores largos y aleatorios.
- `PUBLIC_APP_URL`: dominio publico.
- `CORS_ORIGIN`: dominio permitido para la API.
- `DEFAULT_TIMEZONE`: por defecto `Europe/Madrid`.
- `REST_CONFLICT_MODE`: `warn` o `block`.

## Produccion Basica

```bash
cp .env.example .env
docker compose --profile prod up -d --build
docker compose exec api pnpm prisma migrate deploy
docker compose exec api pnpm prisma db seed
```

## HTTPS

Caddy gestiona certificados automaticamente cuando `PUBLIC_APP_URL` apunta a un dominio real y los puertos 80/443 estan abiertos.

## Volumenes

- `postgres_data`: base de datos.
- `uploads_data`: adjuntos.
- `caddy_data`: certificados.

## Comprobaciones

```bash
docker compose ps
docker compose logs -f api
curl http://localhost:4000/health
```
