#!/bin/bash
# KuraTe Platform — Issue or re-issue a Let's Encrypt certificate
# Purpose: Uses certbot with HTTP-01 webroot challenge to obtain a TLS certificate.
# The webroot path is the certbot/www directory that nginx serves via /.well-known/acme-challenge/.
# If a cert already exists for the domain, it backs up the old one before re-issuing.
# Project: KuraTe — Professional services marketplace (kurate.drsrv.net.ar)
#
# Usage: bash scripts/certbot/issue-domain.sh kurate.drsrv.net.ar [email]

set -eu

DOMAIN="${1:-}"
EMAIL="${2:-carlonid@hotmail.com}"

if [ -z "$DOMAIN" ]; then
  echo "Usage: $0 <domain> [email]"
  exit 1
fi

DEPLOY_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
WEBROOT="$DEPLOY_DIR/certbot/www"
CONF_DIR="$DEPLOY_DIR/certbot/conf"
WORK_DIR="$DEPLOY_DIR/certbot/work"
LOGS_DIR="$DEPLOY_DIR/certbot/logs"

mkdir -p "$WEBROOT" "$WORK_DIR" "$LOGS_DIR" "$CONF_DIR/backup-manual"

LIVE_DIR="$CONF_DIR/live/$DOMAIN"
if [ -d "$LIVE_DIR" ]; then
  echo "Backing up existing cert for $DOMAIN..."
  BACKUP="$CONF_DIR/backup-manual/$DOMAIN-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP"
  cp -r "$LIVE_DIR" "$BACKUP/"
fi

rm -rf "$CONF_DIR/archive/$DOMAIN" "$CONF_DIR/renewal/$DOMAIN.conf" 2>/dev/null || true

echo "Issuing cert for $DOMAIN (webroot: $WEBROOT)..."
CERTBOT_BIN=$(which certbot 2>/dev/null || echo /usr/local/bin/certbot)
$CERTBOT_BIN certonly --webroot \
  -w "$WEBROOT" \
  -d "$DOMAIN" \
  --config-dir "$CONF_DIR" \
  --work-dir "$WORK_DIR" \
  --logs-dir "$LOGS_DIR" \
  --email "$EMAIL" \
  --agree-tos --no-eff-email \
  --non-interactive

echo "Cert issued for $DOMAIN."

# Copy to KurateCerts so nginx can read them
CERTBOT_LIVE="$CONF_DIR/live/$DOMAIN"
KURATE_CERTS="$DEPLOY_DIR/KurateCerts"
if [ -f "$CERTBOT_LIVE/fullchain.pem" ] && [ -f "$CERTBOT_LIVE/privkey.pem" ]; then
  cp "$CERTBOT_LIVE/fullchain.pem" "$KURATE_CERTS/fullchain.pem"
  cp "$CERTBOT_LIVE/privkey.pem"   "$KURATE_CERTS/privkey.pem"
  echo "Copied cert to $KURATE_CERTS"
fi

echo "Reloading nginx..."
cd "$DEPLOY_DIR" && docker compose exec nginx nginx -s reload || \
  docker compose up -d --force-recreate nginx

echo "Done."
