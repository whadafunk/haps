#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f ".env" ]; then
  if [ -z "${1:-}" ]; then
    echo "First run — provide the public URL this app will be served from."
    echo ""
    echo "  Usage: ./deploy.sh https://events.example.com"
    echo ""
    exit 1
  fi

  APP_URL="$1"
  DB_PASS="$(openssl rand -hex 24)"

  echo "Generating configuration..."
  cat > .env << EOF
# Auto-generated on first run — do not edit manually.
APP_URL=${APP_URL}
ORIGIN=${APP_URL}
PUBLIC_APP_URL=${APP_URL}
POSTGRES_PASSWORD=${DB_PASS}
DATABASE_URL=postgresql://haps:${DB_PASS}@db:5432/haps
SESSION_SECRET=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)
EOF
  echo "Configuration saved."
fi

git pull --ff-only
docker compose up --build -d
echo "Done. App is up."
