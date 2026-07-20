#!/bin/bash
# Capture full server state for bare-metal rebuild.
# Run once on the VPS and scp the tarball off-server for safe keeping.
#
# Usage:
#   bash scripts/capture-server-state.sh [/root/KuraTe-platform]
#
# Output: /root/KuraTe_server_state_<date>.tar.gz.enc
#   (encrypted with a passphrase you provide)
set -euo pipefail

DEPLOY_DIR="${1:-/root/KuraTe-platform}"
SNAPSHOT_DIR="/tmp/KuraTe-snapshot-$$"
STAGING="$SNAPSHOT_DIR/staging"
DATE=$(date -u '+%Y-%m-%d_%H%M%S')
OUTFILE="/root/KuraTe_server_state_${DATE}.tar.gz"

mkdir -p "$STAGING"

echo "==================================================="
echo " KuraTe — Full Server State Capture"
echo " Date: $DATE"
echo " Host: $(hostname)"
echo " IP:   $(curl -s ifconfig.me || echo 'unknown')"
echo "==================================================="
echo ""

# ── 1. Installed system packages ──
echo "[1/14] System packages..."
dpkg --get-selections > "$STAGING/dpkg-selections.txt"
dpkg -l > "$STAGING/dpkg-list.txt" 2>/dev/null || true

# ── 2. UFW / iptables ──
echo "[2/14] Firewall rules..."
ufw status verbose > "$STAGING/ufw-status.txt" 2>/dev/null || echo "ufw not available" > "$STAGING/ufw-status.txt"
iptables-save > "$STAGING/iptables-save.txt" 2>/dev/null || echo "iptables-save failed" > "$STAGING/iptables-save.txt"
ip6tables-save > "$STAGING/ip6tables-save.txt" 2>/dev/null || true

# ── 3. Docker daemon config ──
echo "[3/14] Docker config..."
mkdir -p "$STAGING/etc-docker"
cp -a /etc/docker "$STAGING/etc-docker/" 2>/dev/null || echo "no /etc/docker" > "$STAGING/etc-docker/MISSING"
docker info > "$STAGING/docker-info.txt" 2>/dev/null || echo "docker not available" > "$STAGING/docker-info.txt"

# ── 4. Systemd overrides (certbot) ──
echo "[4/14] Systemd overrides..."
mkdir -p "$STAGING/systemd"
for d in certbot.service.d certbot.timer.d; do
  if [ -d "/etc/systemd/system/$d" ]; then
    cp -a "/etc/systemd/system/$d" "$STAGING/systemd/"
  fi
done
# Also capture the timer status
systemctl cat certbot.service 2>/dev/null > "$STAGING/systemd/certbot.service.resolved" || true
systemctl cat certbot.timer 2>/dev/null > "$STAGING/systemd/certbot.timer.resolved" || true
systemctl list-timers --no-pager 2>/dev/null > "$STAGING/systemd/timers.txt" || true

# ── 5. Cron jobs ──
echo "[5/14] Cron jobs..."
mkdir -p "$STAGING/cron"
cp -a /etc/cron.d/ "$STAGING/cron/" 2>/dev/null || echo "no /etc/cron.d" > "$STAGING/cron/MISSING"
# Also capture crontab
crontab -l > "$STAGING/cron/root-crontab.txt" 2>/dev/null || true

# ── 6. Logrotate config ──
echo "[6/14] Logrotate..."
mkdir -p "$STAGING/logrotate"
cp -a /etc/logrotate.d/ "$STAGING/logrotate/" 2>/dev/null || echo "no /etc/logrotate.d" > "$STAGING/logrotate/MISSING"

# ── 7. Docker inventory (SKIP volume export — images built fresh from repo) ──
echo "[7/14] Docker inventory..."
docker images --digests --no-trunc > "$STAGING/docker-images.txt" 2>/dev/null || true
docker ps -a --no-trunc > "$STAGING/docker-ps.txt" 2>/dev/null || true
docker volume ls > "$STAGING/docker-volumes.txt" 2>/dev/null || true
docker network ls > "$STAGING/docker-networks.txt" 2>/dev/null || true
docker system df > "$STAGING/docker-system-df.txt" 2>/dev/null || true
if command -v docker >/dev/null 2>&1 && [ -f "$DEPLOY_DIR/docker-compose.yml" ]; then
  (cd "$DEPLOY_DIR" && docker compose config 2>/dev/null) > "$STAGING/docker-compose-resolved.yml" || true
fi

# ── 8. Swap & fstab ──
echo "[8/14] Swap & fstab..."
cp /etc/fstab "$STAGING/fstab" 2>/dev/null || true
swapon --show > "$STAGING/swapon.txt" 2>/dev/null || true
cat /proc/swaps > "$STAGING/proc-swaps.txt" 2>/dev/null || true

# ── 9. Environment / locale ──
echo "[9/14] Environment & locale..."
env > "$STAGING/env.txt" 2>/dev/null || true
cat /etc/default/locale > "$STAGING/locale.txt" 2>/dev/null || true
locale > "$STAGING/locale-all.txt" 2>/dev/null || true
cat /etc/timezone > "$STAGING/timezone.txt" 2>/dev/null || true
hostnamectl > "$STAGING/hostnamectl.txt" 2>/dev/null || true

# ── 10. Network config ──
echo "[10/14] Network..."
cat /etc/hostname > "$STAGING/hostname.txt" 2>/dev/null || true
cat /etc/hosts > "$STAGING/hosts.txt" 2>/dev/null || true
ip addr > "$STAGING/ip-addr.txt" 2>/dev/null || true
ip route > "$STAGING/ip-route.txt" 2>/dev/null || true
resolvectl status > "$STAGING/resolvectl.txt" 2>/dev/null || true
cat /etc/resolv.conf > "$STAGING/resolv.conf" 2>/dev/null || true
ss -tlnp > "$STAGING/ss-listening.txt" 2>/dev/null || true

# ── 11. SSH config (keys excluded — only config) ──
echo "[11/14] SSH config..."
mkdir -p "$STAGING/ssh"
cp /etc/ssh/sshd_config "$STAGING/ssh/" 2>/dev/null || true
cp /etc/ssh/ssh_config "$STAGING/ssh/" 2>/dev/null || true
# List authorized keys (not their content)
if [ -f /root/.ssh/authorized_keys ]; then
  wc -l /root/.ssh/authorized_keys > "$STAGING/ssh/authorized_keys_count.txt" 2>/dev/null || true
  head -1 /root/.ssh/authorized_keys > "$STAGING/ssh/authorized_keys_sample.txt" 2>/dev/null || true
fi

# ── 12. Project .env (redact secrets for safety, but include structure) ──
echo "[12/14] Environment file..."
if [ -f "$DEPLOY_DIR/.env" ]; then
  # Full copy (encrypted in final step)
  cp "$DEPLOY_DIR/.env" "$STAGING/env-file.txt"
  # Also a redacted version for quick reference
  sed 's/=.*/=REDACTED/' "$DEPLOY_DIR/.env" > "$STAGING/env-file-redacted.txt" 2>/dev/null || true
fi

# ── 13. Latest MongoDB dump (SKIPPED — daily backup exists; use that for restore) ──
echo "[13/14] MongoDB backup... SKIPPED (daily backup covers this)"
BACKUP_DIR="/root/KuraTe_backups"

# ── 14. Certbot config & certs (live PEMs + renewal hooks) ──
echo "[14/14] Certbot state..."
if [ -d "$DEPLOY_DIR/certbot/conf" ]; then
  cp -a "$DEPLOY_DIR/certbot/conf/renewal-hooks" "$STAGING/certbot-renewal-hooks" 2>/dev/null || true
  # Include the live PEMs (needed for SSL restore)
  mkdir -p "$STAGING/certs"
  cp -aL "$DEPLOY_DIR/certbot/conf/live" "$STAGING/certs/" 2>/dev/null || true
  # Include archive if it exists
  [ -d "$DEPLOY_DIR/certbot/conf/archive" ] && cp -a "$DEPLOY_DIR/certbot/conf/archive" "$STAGING/certs/" 2>/dev/null || true
fi

# Also capture the cert issue/renew scripts from the repo
if [ -d "$DEPLOY_DIR/scripts/certbot" ]; then
  cp -a "$DEPLOY_DIR/scripts/certbot" "$STAGING/certbot-scripts"
fi

# ── Manifest ──
echo ""
echo "--- Manifest ---"
(cd "$STAGING" && find . -type f | sort) | tee "$STAGING/MANIFEST.txt"

# ── Package ──
echo ""
echo "--- Packaging ---"
cd "$SNAPSHOT_DIR"
tar czf "$OUTFILE" staging/

# ── Encrypt ──
echo ""
echo "Encrypting with AES-256..."
echo "─────────────────────────────────────────────────"
echo " Enter a strong passphrase to encrypt the archive."
echo " THIS PASSPHRASE IS THE SINGLE POINT OF FAILURE."
echo " Store it in your password manager IMMEDIATELY."
echo "─────────────────────────────────────────────────"
if command -v openssl >/dev/null 2>&1; then
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
    -in "$OUTFILE" -out "${OUTFILE}.enc"
  rm -f "$OUTFILE"
  FINAL="${OUTFILE}.enc"
else
  echo "WARN: openssl not found — archive is UNENCRYPTED!"
  FINAL="$OUTFILE"
fi

# ── Summary ──
echo ""
echo "==================================================="
echo " Server state captured"
echo "==================================================="
FILESIZE=$(stat -c%s "$FINAL" 2>/dev/null || stat -f%z "$FINAL" 2>/dev/null)
echo " Output: $FINAL"
echo " Size:   $(( FILESIZE / 1024 / 1024 )) MB"
echo ""
echo " Download it with:"
echo "   scp root@91.208.206.35:$FINAL ./"
echo ""
echo " To restore (on a fresh server):"
echo "   1. openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \\"
echo "        -in KuraTe_server_state_${DATE}.tar.gz.enc \\"
echo "        -out KuraTe_server_state_${DATE}.tar.gz"
echo "   2. tar xzf KuraTe_server_state_${DATE}.tar.gz"
echo "   3. Follow ansible/deploy.yml to provision base OS"
echo "   4. Restore .env from env-file.txt"
echo "   5. Restore certs from certs/"
echo "   6. Restore systemd overrides from systemd/"
echo "   7. Restore cron files from cron/"
echo "   8. git clone && docker compose up --build (app built fresh)"
echo "   9. Restore MongoDB from daily backup (see scripts/restore-disaster-recovery.ps1)"
echo "==================================================="

# ── Cleanup ──
rm -rf "$SNAPSHOT_DIR"
