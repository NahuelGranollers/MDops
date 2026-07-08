#!/usr/bin/env bash
set -euo pipefail

# Walk up until we find pnpm-workspace.yaml (workspace root)
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

# Ensure pnpm@10 is active and install workspace deps (include dev for prisma/build steps)
corepack prepare pnpm@10 --activate
pnpm -w install --include=dev --no-optional
