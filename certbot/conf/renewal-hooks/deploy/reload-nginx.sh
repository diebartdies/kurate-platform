#!/bin/bash
# KuraTe Platform — Certbot deploy hook: copy renewed cert to KurateCerts + reload nginx
# Purpose: After certbot renews a cert, copy the new fullchain.pem and privkey.pem
# to KurateCerts/ (which nginx reads from at /etc/nginx/certs/), then hot-reload nginx.
# Project: KuraTe — Professional services marketplace (kurate.drsrv.net.ar)

DEPLOY_DIR="/root/KuraTe-platform"
CERTBOT_LIVE="$DEPLOY_DIR/certbot/conf/live/kurate.drsrv.net.ar"
KURATE_CERTS="$DEPLOY_DIR/KurateCerts"

if [ -f "$CERTBOT_LIVE/fullchain.pem" ] && [ -f "$CERTBOT_LIVE/privkey.pem" ]; then
  cp "$CERTBOT_LIVE/fullchain.pem" "$KURATE_CERTS/fullchain.pem"
  cp "$CERTBOT_LIVE/privkey.pem"   "$KURATE_CERTS/privkey.pem"
  echo "[deploy-hook] Copied renewed cert to $KURATE_CERTS"
fi

cd "$DEPLOY_DIR" && docker compose exec nginx nginx -s reload
