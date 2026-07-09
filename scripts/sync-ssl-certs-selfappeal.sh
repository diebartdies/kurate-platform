#!/bin/bash
# Sync FullMinent TLS files into certbot layout (Linux / server-side).
set -euo pipefail

SOURCE_DIR="${FullMinent_CERTS_DIR:-/root/Certs-Selfapeal}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-$SCRIPT_DIR/../certbot/conf/live/FullMinent.drsrv.net.ar}"

mkdir -p "$TARGET_DIR"

CHAIN_SRC="$SOURCE_DIR/selfa.chain"
KEY_SRC="$SOURCE_DIR/selfa.key"
CERT_SRC="$SOURCE_DIR/selfa.cert"
CA_SRC="$SOURCE_DIR/selfa.CA"
FULLCHAIN="$TARGET_DIR/fullchain.pem"
PRIVKEY="$TARGET_DIR/privkey.pem"

if [[ ! -f "$KEY_SRC" ]]; then
  echo "ERROR: Missing $KEY_SRC" >&2
  exit 1
fi

if [[ -f "$CHAIN_SRC" ]]; then
  cp -f "$CHAIN_SRC" "$FULLCHAIN"
elif [[ -f "$CERT_SRC" && -f "$CA_SRC" ]]; then
  echo "Building fullchain from selfa.cert + selfa.CA"
  cat "$CERT_SRC" "$CA_SRC" > "$FULLCHAIN"
else
  echo "ERROR: Need selfa.chain or selfa.cert+selfa.CA in $SOURCE_DIR" >&2
  exit 1
fi

cp -f "$KEY_SRC" "$PRIVKEY"
CERT_COUNT=$(grep -c 'BEGIN CERTIFICATE' "$FULLCHAIN" || true)
echo "OK: $FULLCHAIN ($CERT_COUNT cert(s) in chain)"
echo "OK: $PRIVKEY"

if command -v openssl >/dev/null 2>&1; then
  SUBJECT=$(openssl x509 -in "$FULLCHAIN" -noout -subject 2>/dev/null || true)
  if [[ -n "$SUBJECT" ]]; then
    echo "$SUBJECT"
    if [[ "$SUBJECT" != *FullMinent* ]]; then
      echo "WARN: subject does not mention FullMinent — browser may warn on FullMinent.drsrv.net.ar" >&2
    fi
  fi
fi
