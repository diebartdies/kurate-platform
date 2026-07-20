#!/bin/bash
# Stop nginx restart loop and apply latest certs-live layout on the server.
set -eu

DEPLOY_DIR="${1:-/root/KuraTe-platform}"
cd "$DEPLOY_DIR"

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
else
  DC="docker-compose"
fi

echo "==> Stopping nginx..."
docker stop KuraTe_nginx 2>/dev/null || true

if grep -q 'certs-KuraTe' "$DEPLOY_DIR/nginx.conf" 2>/dev/null; then
  echo "ERROR: nginx.conf on disk is STALE (references certs-KuraTe)."
  echo "       From Windows run: upload_to_server.bat"
  echo "       Or scp nginx.conf + docker-compose.yml to $DEPLOY_DIR/ then re-run this script."
  exit 1
fi

KuraTe_DIR="$DEPLOY_DIR/certbot/conf/live/KuraTe.drsrv.net.ar"
KuraTe_DIR="$DEPLOY_DIR/certbot/conf/live/KuraTe.drsrv.net.ar"

missing=0
if [ ! -f "$KuraTe_DIR/fullchain.pem" ] || [ ! -f "$KuraTe_DIR/privkey.pem" ]; then
  echo "ERROR: missing KuraTe TLS in $KuraTe_DIR (fullchain.pem + privkey.pem)"
  missing=1
fi
if [ ! -f "$KuraTe_DIR/fullchain.pem" ] || [ ! -f "$KuraTe_DIR/privkey.pem" ]; then
  echo "ERROR: missing KuraTe TLS in $KuraTe_DIR (fullchain.pem + privkey.pem)"
  missing=1
fi
if [ "$missing" -eq 1 ]; then
  echo "       From Windows run: scripts/upload-ssl-certs-to-prod.bat (uploads BOTH domains)"
  exit 1
fi

echo "==> OK: KuraTe + KuraTe TLS present on prod"
echo "==> Regenerating KuraTe vhost snippet..."
if [ -x "$DEPLOY_DIR/scripts/nginx-write-KuraTe-conf.sh" ]; then
  bash "$DEPLOY_DIR/scripts/nginx-write-KuraTe-conf.sh" "$DEPLOY_DIR"
else
  echo "ERROR: nginx-write-KuraTe-conf.sh not found"
  exit 1
fi

if [ ! -f "$DEPLOY_DIR/nginx/conf.d/KuraTe.ssl.conf" ]; then
  echo "ERROR: KuraTe.ssl.conf was not generated despite certs present"
  exit 1
fi

echo "==> Testing nginx configuration..."
net=""
if docker inspect KuraTe_app >/dev/null 2>&1; then
  net=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' KuraTe_app 2>/dev/null | head -1)
fi
net_args=()
if [ -n "$net" ]; then
  net_args=(--network "$net")
else
  net_args=(--add-host app:127.0.0.1)
fi

docker run --rm "${net_args[@]}" \
  -v "$DEPLOY_DIR/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$DEPLOY_DIR/nginx/conf.d:/etc/nginx/conf.d:ro" \
  -v "$DEPLOY_DIR/certbot/conf/live:/etc/nginx/certs-live:ro" \
  -v "$DEPLOY_DIR/certbot/conf/archive:/etc/nginx/archive:ro" \
  nginx:alpine nginx -t

if [ -f "$DEPLOY_DIR/docker-compose.override.yml" ]; then
  if grep -qE 'certs-KuraTe|/etc/nginx/certs:' "$DEPLOY_DIR/docker-compose.override.yml" 2>/dev/null; then
    echo "ERROR: docker-compose.override.yml overrides nginx with old cert mounts."
    echo "       Edit $DEPLOY_DIR/docker-compose.override.yml or remove stale volume lines."
    exit 1
  fi
fi

echo "==> Recreating nginx (docker restart keeps old cert volume mounts)..."
docker rm -f KuraTe_nginx 2>/dev/null || true
$DC up -d --force-recreate --pull never nginx

sleep 2
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'nginx|NAMES' || true
echo "==> Recent nginx logs:"
docker logs KuraTe_nginx --tail 8 2>&1 || true
echo "Done."
