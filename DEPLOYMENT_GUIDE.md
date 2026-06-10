# Guia de despliegue: GitHub Pages + Vercel + Supabase

Configuracion objetivo:

- Repositorio: `NahuelGranollers/MDops`
- Rama: `main`
- Frontend: `https://nahuelgranollers.github.io/MDops/`
- API Vercel: `https://m-dops-api.vercel.app`
- Supabase project ref: `uvkkmqxnxpnnffxwevuw`
- Supabase URL: `https://uvkkmqxnxpnnffxwevuw.supabase.co`

## GitHub Pages

El workflow `.github/workflows/deploy-pages.yml` ya compila con:

```env
NEXT_PUBLIC_API_URL=https://m-dops-api.vercel.app/api
NEXT_PUBLIC_BASE_PATH=/MDops
```

No hace falta crear secrets de GitHub para esos dos valores porque son publicos.

En GitHub, revisa:

1. `Settings > Pages`
2. `Build and deployment > Source`: `GitHub Actions`
3. Ejecuta el workflow `Deploy Next.js site to Pages` o haz push a `main`.

## Vercel

Configura estas variables en el proyecto Vercel:

```env
NODE_ENV=production
PUBLIC_APP_URL=https://nahuelgranollers.github.io/MDops
CORS_ORIGIN=https://nahuelgranollers.github.io
UPLOAD_DIR=/tmp

DATABASE_URL=postgresql://postgres:[PASSWORD_REAL]@db.uvkkmqxnxpnnffxwevuw.supabase.co:5432/postgres

JWT_ACCESS_SECRET=[string_largo_aleatorio]
JWT_REFRESH_SECRET=[otro_string_largo_aleatorio]

SUPABASE_URL=https://uvkkmqxnxpnnffxwevuw.supabase.co
```

Recomendado para Vercel serverless: usa la connection string de Supabase `Transaction pooler`, puerto `6543`, y anade:

```txt
?pgbouncer=true&connection_limit=1
```

Si configuras Supabase Storage para adjuntos, anade tambien:

```env
SUPABASE_SERVICE_ROLE_KEY=[service_role_key_privada]
```

No pongas `sb_publishable_...` como `SUPABASE_SERVICE_ROLE_KEY`; esa clave es publica y no da permisos de servidor.

## Supabase

La app usa Prisma para la base de datos. Despues de configurar `DATABASE_URL`, ejecuta una vez:

```bash
pnpm db:migrate
pnpm db:seed
```

El seed crea usuarios iniciales con password `2001`. Cambia esas contrasenas al entrar en produccion.

Para adjuntos persistentes en Supabase Storage:

1. Crea un bucket llamado `md-ops-uploads`.
2. Si quieres URLs publicas de adjuntos, haz el bucket publico.
3. Configura en Vercel `SUPABASE_SERVICE_ROLE_KEY`.

Nota: los adjuntos de eventos ya pueden subirse a Supabase Storage si existe `SUPABASE_SERVICE_ROLE_KEY`. Los avatares todavia usan `/uploads` local; con Vercel se guardan en `/tmp`, por lo que no son persistentes tras reinicios o redeploys.

## SMTP y mapas

Solo son necesarios si quieres activar esas funciones:

```env
EMAIL_NOTIFICATIONS_ENABLED=true
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
SMTP_FROM_NAME=MD Ops
SMTP_REPLY_TO=

MAPS_PROVIDER=google
GOOGLE_MAPS_API_KEY=
```
