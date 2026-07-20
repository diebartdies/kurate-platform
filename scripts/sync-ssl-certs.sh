#!/bin/bash
# Sync Let's Encrypt source files into the names nginx/docker expect.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$(cd "$SCRIPT_DIR/../certbot/conf/live/KuraTe.drsrv.net.ar" && pwd)"

CHAIN_SRC="$CERT_DIR/KuraTe.chain"
KEY_SRC="$CERT_DIR/KuraTe.key"
FULLCHAIN="$CERT_DIR/fullchain.pem"
PRIVKEY="$CERT_DIR/privkey.pem"

if [[ ! -f "$CHAIN_SRC" ]]; then
  echo "ERROR: Missing $CHAIN_SRC" >&2
  exit 1
fi
if [[ ! -f "$KEY_SRC" ]]; then
  echo "ERROR: Missing $KEY_SRC" >&2
  exit 1
fi

cp -f "$FULLCHAIN" "$FULLCHAIN.selfsigned.bak" 2>/dev/null || true
cp -f "$PRIVKEY" "$PRIVKEY.selfsigned.bak" 2>/dev/null || true
cp -f "$CHAIN_SRC" "$FULLCHAIN"
cp -f "$KEY_SRC" "$PRIVKEY"

CERT_COUNT=$(grep -c 'BEGIN CERTIFICATE' "$FULLCHAIN" || true)
echo "OK: $FULLCHAIN ($CERT_COUNT cert(s) in chain)"
echo "OK: $PRIVKEY"
echo "Run: docker restart KuraTe_nginx"
