#!/usr/bin/env bash
# Set GOOGLE_CLIENT_ID on production and restart the app container.
# Usage (on server):
#   bash scripts/set-google-client-id.sh YOUR_ID.apps.googleusercontent.com
# Or from Windows after SSH:
#   cd /root/KuraTe-platform && bash scripts/set-google-client-id.sh "123...apps.googleusercontent.com"
set -euo pipefail

ROOT="${2:-/root/KuraTe-platform}"
CLIENT_ID="${1:-}"

if [[ -z "$CLIENT_ID" ]]; then
  echo "Usage: bash scripts/set-google-client-id.sh CLIENT_ID.apps.googleusercontent.com"
  echo "Example: bash scripts/set-google-client-id.sh 123456789-abc.apps.googleusercontent.com"
  exit 1
fi

if [[ "$CLIENT_ID" != *".apps.googleusercontent.com" ]]; then
  echo "ERROR: Client ID should end with .apps.googleusercontent.com"
  exit 1
fi

ENV_FILE="$ROOT/.env"
cd "$ROOT"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — create it first (copy from .env.example)."
  exit 1
fi

sed -i 's/\r$//' "$ENV_FILE"

if grep -q '^GOOGLE_CLIENT_ID=' "$ENV_FILE"; then
  sed -i "s|^GOOGLE_CLIENT_ID=.*|GOOGLE_CLIENT_ID=$CLIENT_ID|" "$ENV_FILE"
  echo "Updated GOOGLE_CLIENT_ID"
else
  printf '\n# Google Sign-In (OAuth Web client)\nGOOGLE_CLIENT_ID=%s\n' "$CLIENT_ID" >> "$ENV_FILE"
  echo "Added GOOGLE_CLIENT_ID"
fi

docker compose up -d --force-recreate app

echo "Verifying inside container..."
docker exec KuraTe_app node -e "
const id = process.env.GOOGLE_CLIENT_ID || '';
console.log('GOOGLE_CLIENT_ID:', id ? id.slice(0, 12) + '...' + id.slice(-20) : '(empty)');
if (!id) process.exit(1);
"

echo "OK — open https://KuraTe.drsrv.net.ar/api/v1/public/client-config and confirm googleClientId is set."
