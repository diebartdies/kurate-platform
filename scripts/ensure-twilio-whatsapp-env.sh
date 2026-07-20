#!/usr/bin/env bash
# Run on Moldova prod: bash scripts/ensure-twilio-whatsapp-env.sh [E164_digits]
set -euo pipefail

ROOT="${1:-/root/KuraTe-platform}"
NUMBER="${2:-15559340276}"
ENV_FILE="$ROOT/.env"

cd "$ROOT"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

# Strip Windows CRLF from .env (common when edited from Windows)
sed -i 's/\r$//' "$ENV_FILE"

if grep -q '^TWILIO_WHATSAPP_FROM_NUMBER=' "$ENV_FILE"; then
  sed -i "s/^TWILIO_WHATSAPP_FROM_NUMBER=.*/TWILIO_WHATSAPP_FROM_NUMBER=$NUMBER/" "$ENV_FILE"
  echo "Updated TWILIO_WHATSAPP_FROM_NUMBER"
else
  printf '\nTWILIO_WHATSAPP_FROM_NUMBER=%s\n' "$NUMBER" >> "$ENV_FILE"
  echo "Added TWILIO_WHATSAPP_FROM_NUMBER"
fi

if ! grep -q '^TWILIO_SENDER_BYPASS=' "$ENV_FILE"; then
  echo 'TWILIO_SENDER_BYPASS=false' >> "$ENV_FILE"
fi

docker compose up -d --force-recreate app

echo "Checking Twilio WhatsApp API mode inside container..."
docker exec KuraTe_app node -e "
const tw = require('./services/twilioWhatsAppService');
console.log('isApiModeEnabled:', tw.isApiModeEnabled());
console.log('getConfigError:', tw.getConfigError() || '(none)');
"
