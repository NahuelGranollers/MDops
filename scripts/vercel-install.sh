#!/usr/bin/env bash
set -euo pipefail

CUR=$(pwd)
while [ "$CUR" != "/" ] && [ ! -f "$CUR/pnpm-workspace.yaml" ]; do
  CUR=$(dirname "$CUR")
done

if [ "$CUR" = "/" ]; then
  echo "workspace root not found, defaulting to current directory"
  CUR=$(pwd)
fi

echo "Found workspace root: $CUR"
cd "$CUR"

corepack prepare pnpm@9.15.4 --activate
pnpm -w install --include=dev --no-optional
