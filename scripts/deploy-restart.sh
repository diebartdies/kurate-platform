#!/bin/bash
# Rebuild app container and restart nginx (called from upload_to_server.bat)
set -eu

DEPLOY_DIR="${1:-/root/KuraTe-platform}"
cd "$DEPLOY_DIR"

ensure_docker() {
  if [ -x /usr/bin/docker ]; then
    export PATH="/usr/bin:/usr/sbin:/bin:$PATH"
  fi
  unset DOCKER_HOST
  if [ ! -S /var/run/docker.sock ]; then
    echo "WARN: /var/run/docker.sock missing — restarting Docker..."
    systemctl restart docker.socket docker 2>/dev/null || systemctl restart docker
    sleep 3
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "ERROR: cannot reach Docker API (common after 'snap remove docker')."
    echo "Try: systemctl restart docker.socket docker && ls -la /var/run/docker.sock"
    exit 1
  fi
}

app_resolves_mongo() {
  docker exec KuraTe_app getent hosts mongo >/dev/null 2>&1
}

wait_for_mongo_healthy() {
  until docker inspect -f '{{.State.Health.Status}}' KuraTe_mongo 2>/dev/null | grep -qx healthy; do
    echo "Waiting for mongo 4.4 to become healthy..."
    sleep 3
  done
}

# Recreate all containers on one compose network (named volume KuraTe_mongo_data is kept).
reconcile_stack_network() {
  echo "WARN: app cannot resolve hostname 'mongo' — reconciling stack (DB volume preserved)..."
  $DC down
  $DC up -d --pull never mongo
  wait_for_mongo_healthy
  $DC build app
  $DC up -d --pull never app nginx
}

ensure_docker

bash "$DEPLOY_DIR/scripts/nginx-write-selfappeal-conf.sh" "$DEPLOY_DIR"

nginx_config_test() {
  echo "Testing nginx configuration..."
  local net=""
  if docker inspect KuraTe_app >/dev/null 2>&1; then
    net=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' KuraTe_app 2>/dev/null | head -1)
  fi
  local net_args=()
  if [ -n "$net" ]; then
    net_args=(--network "$net")
  else
    net_args=(--add-host app:127.0.0.1)
  fi
  if ! docker run --rm "${net_args[@]}" \
    -v "$DEPLOY_DIR/nginx.conf:/etc/nginx/nginx.conf:ro" \
    -v "$DEPLOY_DIR/nginx/conf.d:/etc/nginx/conf.d:ro" \
    -v "$DEPLOY_DIR/certbot/conf/live:/etc/nginx/certs-live:ro" \
    -v "$DEPLOY_DIR/certbot/conf/archive:/etc/nginx/archive:ro" \
    nginx:alpine nginx -t 2>&1; then
    echo "ERROR: nginx -t failed. Common fixes:"
    echo "  - grep certs-KuraTe nginx.conf (must be empty; redeploy latest nginx.conf)"
    echo "  - ls certbot/conf/live/KuraTe.drsrv.net.ar/fullchain.pem privkey.pem"
    echo "  - ls certbot/conf/live/KuraTe.drsrv.net.ar/fullchain.pem privkey.pem"
    return 1
  fi
}

if [ -f "$DEPLOY_DIR/scripts/disk-housekeeping.sh" ]; then
  echo "Running disk housekeeping before build..."
  bash "$DEPLOY_DIR/scripts/disk-housekeeping.sh" "$DEPLOY_DIR"
fi

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "ERROR: neither docker compose nor docker-compose is available"
  exit 1
fi

replace_app_container() {
  echo "Replacing KuraTe_app container..."
  docker kill KuraTe_app 2>/dev/null || true
  if ! docker rm -f KuraTe_app 2>/dev/null; then
    echo "WARN: docker rm failed (permission denied?) — restarting Docker daemon..."
    systemctl restart docker.socket docker 2>/dev/null || systemctl restart docker
    sleep 5
    docker rm -f KuraTe_app 2>/dev/null || true
  fi
  # Do not use --no-deps: app must join the compose network to resolve "mongo".
  $DC up -d --pull never app
}

echo "Using: $DC"
echo "Ensuring mongo 4.4 is running (no recreate, no pull)..."
$DC up -d --no-recreate --pull never mongo

echo "Building app image (Twilio npm installed when INSTALL_TWILIO=1, default on deploy)..."
mkdir -p "$DEPLOY_DIR/.cache"
BUILD_LOG="$DEPLOY_DIR/.cache/docker-build.log"
if ! $DC build app 2>&1 | tee "$BUILD_LOG"; then
  echo "ERROR: docker build failed. Tail of log:"
  tail -n 40 "$BUILD_LOG" || true
  exit 1
fi

if [ -f "$DEPLOY_DIR/scripts/parse-docker-build-timings.js" ] && [ -f "$BUILD_LOG" ]; then
  echo ""
  echo "=== Docker build timing summary ==="
  if command -v node >/dev/null 2>&1; then
    node "$DEPLOY_DIR/scripts/parse-docker-build-timings.js" "$BUILD_LOG" || true
  elif docker image inspect node:22-alpine >/dev/null 2>&1; then
    docker run --rm -v "$DEPLOY_DIR:/app" -w /app node:22-alpine \
      node scripts/parse-docker-build-timings.js .cache/docker-build.log || true
  else
    echo "(timing report skipped — no node on host; use: npm run docker:build-timings locally)"
  fi
fi

if ! replace_app_container; then
  echo "WARN: first app replace failed — retrying after Docker restart..."
  systemctl restart docker.socket docker 2>/dev/null || systemctl restart docker
  sleep 5
  $DC up -d --no-recreate --pull never mongo
  replace_app_container
fi

if ! app_resolves_mongo; then
  reconcile_stack_network
elif ! docker logs KuraTe_app 2>&1 | tail -20 | grep -q 'MongoDB Connected'; then
  echo "Waiting for app to connect to mongo..."
  sleep 15
  if ! docker logs KuraTe_app 2>&1 | tail -30 | grep -q 'MongoDB Connected'; then
    reconcile_stack_network
  fi
fi

recreate_nginx() {
  echo "Recreating nginx container (required after cert/config mount changes)..."
  nginx_config_test || return 1
  docker rm -f KuraTe_nginx 2>/dev/null || true
  $DC up -d --force-recreate --pull never nginx
}

if docker ps -a --format '{{.Names}}' | grep -qx KuraTe_nginx; then
  recreate_nginx || exit 1
else
  echo "Starting nginx..."
  recreate_nginx || exit 1
fi

echo "Containers:"
$DC ps

if app_resolves_mongo && docker logs KuraTe_app 2>&1 | tail -10 | grep -q 'MongoDB Connected'; then
  echo "OK: app resolves mongo and database is connected."
else
  echo "WARN: verify mongo connectivity: docker logs KuraTe_app --tail 20"
fi
