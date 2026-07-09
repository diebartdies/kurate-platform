#!/usr/bin/env bash
# Enable whatsapp-web.js (QR link) so cold invitations work without Meta template approval.
# Run on prod: bash scripts/enable-webjs-outreach.sh
set -euo pipefail

ROOT="${1:-/root/FullMinent-platform}"
ENV_FILE="$ROOT/.env"

cd "$ROOT"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

sed -i 's/\r$//' "$ENV_FILE"

if grep -q '^WHATSAPP_USE_WEBJS=' "$ENV_FILE"; then
  sed -i 's/^WHATSAPP_USE_WEBJS=.*/WHATSAPP_USE_WEBJS=true/' "$ENV_FILE"
  echo "Set WHATSAPP_USE_WEBJS=true"
else
  printf '\n# Immediate WhatsApp outreach via QR (no Meta template)\nWHATSAPP_USE_WEBJS=true\n' >> "$ENV_FILE"
  echo "Added WHATSAPP_USE_WEBJS=true"
fi

docker compose up -d --force-recreate app

echo ""
echo "=== WebJS outreach mode active ==="
echo "Next steps in Admin panel:"
echo "  1. WhatsApp config → Register number on WhatsApp → scan QR on the origin phone"
echo "  2. Invitations → select leads or Apply to all pending"
echo ""
echo "Checking container..."
docker exec FullMinent_app node -e "
const tw = require('./services/twilioWhatsAppService');
const ps = require('./services/whatsappPlatformService');
console.log('WHATSAPP_USE_WEBJS:', process.env.WHATSAPP_USE_WEBJS || '(unset)');
console.log('Twilio API mode:', tw.isApiModeEnabled());
console.log('Cold outreach block:', tw.getColdOutreachBlockReason() || '(none — link WhatsApp via QR)');
ps.getRegistrationStatus().then((s) => {
  console.log('WhatsApp status:', JSON.stringify({
    phase: s.phase,
    transport: s.transport,
    connected: s.connected,
    sessionSaved: s.sessionSaved,
    lastError: s.lastError || null
  }));
}).catch((e) => console.error(e.message));
"
