#!/bin/bash
# KuraTe Platform — Install certbot auto-renewal via systemd timer
# Purpose: Creates systemd drop-in overrides that make certbot renew certificates daily at 04:15 UTC.
# The timer has a 30-minute random jitter and persistent=true (runs missed jobs on boot).
# After renewal, the deploy hook (reload-nginx.sh) copies the new cert to KurateCerts/
# (which nginx reads from) and hot-reloads nginx to pick up the new SSL cert.
# Project: KuraTe — Professional services marketplace (kurate.drsrv.net.ar)
#
# Usage: bash scripts/certbot/install-systemd.sh [/root/KuraTe-platform]

set -eu

DEPLOY_DIR="${1:-/root/KuraTe-platform}"

# --- certbot.service override ---
SERVICE_DROP_DIR="/etc/systemd/system/certbot.service.d"
SERVICE_DROP="$SERVICE_DROP_DIR/kurate-platform.conf"

mkdir -p "$SERVICE_DROP_DIR"
cat > "$SERVICE_DROP" <<EOF
[Service]
ExecStart=
ExecStart=/usr/local/bin/certbot -q renew --no-random-sleep-on-renew \
  --config-dir $DEPLOY_DIR/certbot/conf \
  --work-dir $DEPLOY_DIR/certbot/work \
  --logs-dir $DEPLOY_DIR/certbot/logs \
  --deploy-hook $DEPLOY_DIR/certbot/conf/renewal-hooks/deploy/reload-nginx.sh
EOF

chmod 644 "$SERVICE_DROP"
echo "Installed $SERVICE_DROP"

# --- certbot.timer override ---
TIMER_DROP_DIR="/etc/systemd/system/certbot.timer.d"
TIMER_DROP="$TIMER_DROP_DIR/kurate-platform.conf"

mkdir -p "$TIMER_DROP_DIR"
cat > "$TIMER_DROP" <<EOF
[Timer]
OnCalendar=
OnCalendar=*-*-* 04:15:00
RandomizedDelaySec=1800
Persistent=true
EOF

chmod 644 "$TIMER_DROP"
echo "Installed $TIMER_DROP"

chmod +x "$DEPLOY_DIR/certbot/conf/renewal-hooks/deploy/reload-nginx.sh"

systemctl daemon-reload
systemctl enable certbot.timer
systemctl start certbot.timer

echo "certbot.timer is now: $(systemctl is-active certbot.timer)"
echo "Schedule:"
systemctl list-timers --all | grep certbot || true
