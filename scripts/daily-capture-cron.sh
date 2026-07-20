#!/bin/bash
# Daily server state capture — run via cron
# Keeps last 7 encrypted archives, deletes older ones.
set -euo pipefail

CAPTURE_SCRIPT="/root/KuraTe-platform/scripts/capture-server-state.sh"
ARCHIVE_DIR="/root"
RETENTION_DAYS=7
LOGFILE="/var/log/KuraTe-daily-capture.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting daily capture..." >> "$LOGFILE"

# Run the capture script (it will prompt for passphrase — but we run non-interactive)
# Instead, call openssl directly with a passphrase file or env var.
# For cron, we store the passphrase in /root/.capture-passphrase (chmod 600).
if [ ! -f /root/.capture-passphrase ]; then
    echo "ERROR: /root/.capture-passphrase not found. Create it with: echo 'your-passphrase' > /root/.capture-passphrase && chmod 600 /root/.capture-passphrase" >> "$LOGFILE"
    exit 1
fi

PASSPHRASE=$(cat /root/.capture-passphrase)

# We need to run the capture script non-interactively.
# The capture script's openssl prompt is interactive.
# Let's run the steps directly instead of calling the script.
DEPLOY_DIR="/root/KuraTe-platform"
SNAPSHOT_DIR=$(mktemp -d)
STAGING="$SNAPSHOT_DIR/staging"
DATE=$(date -u '+%Y-%m-%d_%H%M%S')
OUTFILE="/root/KuraTe_server_state_${DATE}.tar.gz"
ENC_OUTFILE="${OUTFILE}.enc"

mkdir -p "$STAGING"

# 1. System packages
dpkg --get-selections > "$STAGING/dpkg-selections.txt"
dpkg -l > "$STAGING/dpkg-list.txt" 2>/dev/null || true

# 2. UFW
ufw status verbose > "$STAGING/ufw-status.txt" 2>/dev/null || echo "ufw not available" > "$STAGING/ufw-status.txt"

# 3. Docker config
mkdir -p "$STAGING/etc-docker"
cp -a /etc/docker "$STAGING/etc-docker/" 2>/dev/null || true
docker info > "$STAGING/docker-info.txt" 2>/dev/null || true

# 4. Systemd overrides
mkdir -p "$STAGING/systemd"
for d in certbot.service.d certbot.timer.d; do
  [ -d "/etc/systemd/system/$d" ] && cp -a "/etc/systemd/system/$d" "$STAGING/systemd/"
done
systemctl cat certbot.service 2>/dev/null > "$STAGING/systemd/certbot.service.resolved" || true
systemctl cat certbot.timer 2>/dev/null > "$STAGING/systemd/certbot.timer.resolved" || true
systemctl list-timers --no-pager 2>/dev/null > "$STAGING/systemd/timers.txt" || true

# 5. Cron
mkdir -p "$STAGING/cron"
cp -a /etc/cron.d/ "$STAGING/cron/" 2>/dev/null || true
crontab -l > "$STAGING/cron/root-crontab.txt" 2>/dev/null || true

# 6. Logrotate
mkdir -p "$STAGING/logrotate"
cp -a /etc/logrotate.d/ "$STAGING/logrotate/" 2>/dev/null || true

# 7. Docker inventory
docker images --digests --no-trunc > "$STAGING/docker-images.txt" 2>/dev/null || true
docker ps -a --no-trunc > "$STAGING/docker-ps.txt" 2>/dev/null || true
docker volume ls > "$STAGING/docker-volumes.txt" 2>/dev/null || true
docker network ls > "$STAGING/docker-networks.txt" 2>/dev/null || true
docker system df > "$STAGING/docker-system-df.txt" 2>/dev/null || true
if [ -f "$DEPLOY_DIR/docker-compose.yml" ]; then
  (cd "$DEPLOY_DIR" && docker compose config 2>/dev/null) > "$STAGING/docker-compose-resolved.yml" || true
fi

# 8. fstab / swap
cp /etc/fstab "$STAGING/fstab" 2>/dev/null || true
swapon --show > "$STAGING/swapon.txt" 2>/dev/null || true

# 9. Env / locale
env > "$STAGING/env.txt" 2>/dev/null || true
cat /etc/timezone > "$STAGING/timezone.txt" 2>/dev/null || true
hostnamectl > "$STAGING/hostnamectl.txt" 2>/dev/null || true

# 10. Network
cat /etc/hostname > "$STAGING/hostname.txt" 2>/dev/null || true
cat /etc/hosts > "$STAGING/hosts.txt" 2>/dev/null || true
ip addr > "$STAGING/ip-addr.txt" 2>/dev/null || true
ip route > "$STAGING/ip-route.txt" 2>/dev/null || true
ss -tlnp > "$STAGING/ss-listening.txt" 2>/dev/null || true

# 11. .env
[ -f "$DEPLOY_DIR/.env" ] && cp "$DEPLOY_DIR/.env" "$STAGING/env-file.txt"

# 12. Certs
if [ -d "$DEPLOY_DIR/certbot/conf" ]; then
  cp -a "$DEPLOY_DIR/certbot/conf/renewal-hooks" "$STAGING/certbot-renewal-hooks" 2>/dev/null || true
  mkdir -p "$STAGING/certs"
  cp -aL "$DEPLOY_DIR/certbot/conf/live" "$STAGING/certs/" 2>/dev/null || true
  [ -d "$DEPLOY_DIR/certbot/conf/archive" ] && cp -a "$DEPLOY_DIR/certbot/conf/archive" "$STAGING/certs/" 2>/dev/null || true
fi

# Manifest
(cd "$STAGING" && find . -type f | sort) > "$STAGING/MANIFEST.txt"

# Package & encrypt
cd "$SNAPSHOT_DIR"
tar czf "$OUTFILE" staging/
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
  -pass "pass:${PASSPHRASE}" \
  -in "$OUTFILE" -out "$ENC_OUTFILE"
rm -f "$OUTFILE"

# Cleanup snapshot dir
rm -rf "$SNAPSHOT_DIR"

# Retention: delete captures older than 7 days
find /root -maxdepth 1 -name "KuraTe_server_state_*.tar.gz.enc" -mtime +$RETENTION_DAYS -delete

SIZE=$(stat -c%s "$ENC_OUTFILE" 2>/dev/null || stat -f%z "$ENC_OUTFILE" 2>/dev/null)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Done: $(basename "$ENC_OUTFILE") ($(( SIZE / 1024 / 1024 )) MB)" >> "$LOGFILE"
