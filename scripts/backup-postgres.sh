#!/usr/bin/env sh
set -eu

mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-md_ops}" "${POSTGRES_DB:-md_ops}" > "backups/md-ops-$STAMP.sql"
echo "Backup creado: backups/md-ops-$STAMP.sql"
