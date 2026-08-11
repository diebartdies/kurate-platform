#!/bin/bash
# Deploy KuraTe on Maldovas server (91.208.206.35)
# First-time setup: certbot + Docker stack
set -eu

DEPLOY_DIR="/root/KuraTe-platform"
DOMAIN="kurate.drsrv.net.ar"
EMAIL="admin@drsrv.net.ar"

echo "============================================"
echo "KuraTe Deploy - Maldovas (91.208.206.35)"
echo "============================================"

# 1. System updates
echo "[1/8] System updates..."
apt-get update -qq
apt-get install -y -qq curl git ufw > /dev/null 2>&1

# 2. Install Docker if not present
echo "[2/8] Checking Docker..."
if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi
echo "Docker: $(docker --version)"

# 3. Install Docker Compose plugin if not present
echo "[3/8] Checking Docker Compose..."
if ! docker compose version >/dev/null 2>&1; then
  echo "Installing Docker Compose plugin..."
  apt-get install -y -qq docker-compose-plugin > /dev/null 2>&1
fi
echo "Compose: $(docker compose version)"

# 4. Firewall
echo "[4/8] Configuring firewall..."
ufw allow 22/tcp > /dev/null 2>&1 || true
ufw allow 80/tcp > /dev/null 2>&1 || true
ufw allow 443/tcp > /dev/null 2>&1 || true
ufw --force enable > /dev/null 2>&1 || true

# 5. Create deploy directory
echo "[5/8] Setting up deploy directory..."
mkdir -p "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR/certbot/conf"
mkdir -p "$DEPLOY_DIR/certbot/www"
mkdir -p "$DEPLOY_DIR/nginx/conf.d"
mkdir -p "$DEPLOY_DIR/scripts"
mkdir -p "$DEPLOY_DIR/backups"

# 6. Initial nginx (HTTP only) for certbot challenge
echo "[6/8] Starting nginx for certbot challenge..."
cat > /tmp/nginx-init.conf <<'NGINX'
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;
    keepalive_timeout 65;
    include /etc/nginx/conf.d/*.conf;
}
NGINX

cat > /tmp/default-init.conf <<'DEFAULT'
server {
    listen 80;
    server_name kurate.drsrv.net.ar;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://app:5001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
DEFAULT

cp /tmp/nginx-init.conf "$DEPLOY_DIR/nginx.conf"
cp /tmp/default-init.conf "$DEPLOY_DIR/nginx/conf.d/default.conf"

# Start nginx temporarily for certbot
docker run -d --name KuraTe_nginx_init \
  -p 80:80 \
  -v "$DEPLOY_DIR/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$DEPLOY_DIR/nginx/conf.d:/etc/nginx/conf.d:ro" \
  -v "$DEPLOY_DIR/certbot/www:/var/www/certbot:ro" \
  nginx:alpine > /dev/null 2>&1 || true

# 7. Certbot SSL
echo "[7/8] Setting up SSL with certbot..."
if [ ! -f "$DEPLOY_DIR/certbot/conf/live/$DOMAIN/fullchain.pem" ]; then
  echo "Requesting SSL certificate for $DOMAIN..."
  docker run --rm \
    -v "$DEPLOY_DIR/certbot/conf:/etc/letsencrypt" \
    -v "$DEPLOY_DIR/certbot/www:/var/www/certbot" \
    certbot/certbot certonly --webroot \
    -w /var/www/certbot \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    --force-renewal
  echo "SSL certificate obtained."
else
  echo "SSL certificate already exists."
fi

# Stop init nginx
docker stop KuraTe_nginx_init 2>/dev/null || true
docker rm KuraTe_nginx_init 2>/dev/null || true

# 8. Restore MongoDB dump if available
echo "[8/8] Checking for MongoDB dump..."
DUMP_FILE=$(find /tmp -maxdepth 1 -name "kurate_*.gz" 2>/dev/null | head -1)
if [ -n "$DUMP_FILE" ]; then
  echo "Found dump: $DUMP_FILE"
  echo "After app starts, restore with:"
  echo "  docker exec -i KuraTe_mongo mongorestore --gzip --archive < $DUMP_FILE"
fi

echo ""
echo "============================================"
echo "Setup complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Upload project files to $DEPLOY_DIR"
echo "  2. Run: bash $DEPLOY_DIR/scripts/deploy-restart.sh $DEPLOY_DIR"
echo "  3. Verify: curl -I https://$DOMAIN"
