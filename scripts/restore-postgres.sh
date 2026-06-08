#!/usr/bin/env sh
set -eu

if [ $# -ne 1 ]; then
  echo "Uso: ./scripts/restore-postgres.sh backups/archivo.sql"
  exit 1
fi

docker compose exec -T postgres psql -U "${POSTGRES_USER:-md_ops}" "${POSTGRES_DB:-md_ops}" < "$1"
