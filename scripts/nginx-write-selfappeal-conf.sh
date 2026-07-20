#!/bin/bash
# Writes nginx/conf.d/KuraTe.ssl.conf when alias TLS material exists on the host.
set -eu

DEPLOY_DIR="${1:-/root/KuraTe-platform}"
CONF_D="$DEPLOY_DIR/nginx/conf.d"
KuraTe_SSL="$CONF_D/KuraTe.ssl.conf"
KuraTe_DIR="$DEPLOY_DIR/certbot/conf/live/KuraTe.drsrv.net.ar"

mkdir -p "$CONF_D"
rm -f "$KuraTe_SSL"

if [ ! -f "$KuraTe_DIR/fullchain.pem" ] || [ ! -f "$KuraTe_DIR/privkey.pem" ]; then
  echo "INFO: KuraTe TLS missing in $KuraTe_DIR - alias HTTPS vhost omitted."
  echo "      Run scripts/upload-ssl-certs-to-prod.bat from Windows (keeps both sex + self certs)."
  exit 0
fi

cat > "$KuraTe_SSL" <<'EOF'
# Auto-generated — KuraTe.drsrv.net.ar (alias outreach domain)
server {
    listen 443 ssl;
    server_name KuraTe.drsrv.net.ar;

    ssl_certificate /etc/nginx/certs-live/KuraTe.drsrv.net.ar/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs-live/KuraTe.drsrv.net.ar/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Robots-Tag "noindex, nofollow" always;

    location = /robots.txt {
        default_type text/plain;
        return 200 "User-agent: *\nDisallow: /\n";
    }

    location = /sitemap.xml {
        return 404;
    }

    location / {
        set $backend http://app:5000;
        proxy_pass $backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

echo "OK: wrote $KuraTe_SSL"
