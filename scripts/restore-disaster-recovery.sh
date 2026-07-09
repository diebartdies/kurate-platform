#!/bin/bash
# Disaster Recovery Restore — FullMinent Platform
# Usage: bash scripts/restore-disaster-recovery.sh <VM_IP> <encrypted_archive_path>
#
# Example:
#   bash scripts/restore-disaster-recovery.sh 192.168.1.50 /tmp/FullMinent_server_state_2026-07-08_120000.tar.gz.enc
set -euo pipefail

VM_IP="${1:-}"
ARCHIVE="${2:-}"
PROJECT_DIR="/opt/FullMinent-platform"
DATE=$(date -u '+%Y-%m-%d_%H%M%S')
LOGFILE="/tmp/FullMinent-restore-${DATE}.log"

if [ -z "$VM_IP" ] || [ -z "$ARCHIVE" ]; then
    echo "Usage: $0 <VM_IP> <encrypted_archive_path>"
    echo "  e.g. $0 192.168.1.50 /tmp/FullMinent_server_state_2026-07-08_120000.tar.gz.enc"
    exit 1
fi

if [ ! -f "$ARCHIVE" ]; then
    echo "ERROR: Archive not found: $ARCHIVE"
    exit 1
fi

echo "=============================================="
echo " FullMinent — Disaster Recovery Restore"
echo " VM IP:     $VM_IP"
echo " Archive:   $ARCHIVE"
echo " Log:       $LOGFILE"
echo "=============================================="
echo ""

# ── Helper ──
log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOGFILE"; }
run() { log ">>> $*"; "$@" 2>&1 | tee -a "$LOGFILE"; }

# ── 1. Install sshpass if missing ──
if ! command -v sshpass &>/dev/null; then
    log "Installing sshpass..."
    apt-get update -qq && apt-get install -y -qq sshpass 2>/dev/null || \
        brew install sshpass 2>/dev/null || \
        log "WARN: sshpass not available — you may need to manually copy SSH key"
fi

# ── 2. SSH key trust ──
read -rsp "Enter root password for $VM_IP: " ROOT_PASS
echo ""
SSH_KEY="${HOME}/.ssh/id_ed25519"
[ ! -f "$SSH_KEY" ] && ssh-keygen -t ed25519 -f "$SSH_KEY" -N "" -q

log "Setting up SSH key trust for root@${VM_IP}..."
sshpass -p "$ROOT_PASS" ssh-copy-id -o StrictHostKeyChecking=accept-new "root@${VM_IP}" 2>&1 | tee -a "$LOGFILE"
ROOT_PASS=""  # clear from memory

# ── 3. SCP archive to VM ──
ARCHIVE_BASENAME=$(basename "$ARCHIVE")
log "Copying archive to VM..."
scp -q "$ARCHIVE" "root@${VM_IP}:~/${ARCHIVE_BASENAME}"
scp -q "$0" "root@${VM_IP}:~/restore-helper.sh" 2>/dev/null || true

# ── 4. Run restore on VM ──
log "Connecting to VM to run restore..."
ssh -o StrictHostKeyChecking=accept-new "root@${VM_IP}" <<'EOSSH'
    set -euo pipefail
    DATE=$(date -u '+%Y-%m-%d_%H%M%S')
    LOGFILE="/tmp/FullMinent-restore-vm-${DATE}.log"

    log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOGFILE"; }
    run() { log ">>> $*"; "$@" 2>&1 | tee -a "$LOGFILE"; }

    # Find archive
    ARCHIVE=$(ls ~/FullMinent_server_state_*.tar.gz.enc 2>/dev/null | head -1)
    if [ -z "$ARCHIVE" ]; then
        echo "ERROR: No encrypted archive found in /root"
        exit 1
    fi
    log "Found archive: $ARCHIVE"
    DECRYPTED="/root/server_state_restore.tar.gz"
    STAGING="/root/staging"

    # ── 4a. Install Docker ──
    log "Installing Docker + Compose..."
    if ! command -v docker &>/dev/null; then
        curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
        sh /tmp/get-docker.sh 2>&1 | tee -a "$LOGFILE"
        apt-get install -y -qq docker-compose-plugin 2>&1 | tee -a "$LOGFILE"
    fi

    # ── 4b. Decrypt archive ──
    log "Decrypting archive..."
    rm -f "$DECRYPTED"
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
        -in "$ARCHIVE" -out "$DECRYPTED"
    log "Decrypted."

    # ── 4c. Extract ──
    log "Extracting..."
    rm -rf "$STAGING"
    tar xzf "$DECRYPTED" -C /root/
    rm -f "$DECRYPTED"
    log "Contents:"
    cat "$STAGING/MANIFEST.txt" | tee -a "$LOGFILE"

    # ── 4d. Git clone the project ──
    log "Setting up project directory..."
    read -rp "Enter GitHub repo URL (with token): " REPO_URL
    if [ -d "$PROJECT_DIR" ]; then
        log "Project directory exists — pulling latest..."
        cd "$PROJECT_DIR" && git pull 2>&1 | tee -a "$LOGFILE" || true
    else
        git clone "$REPO_URL" "$PROJECT_DIR" 2>&1 | tee -a "$LOGFILE"
    fi
    # Use environment variable instead
    export PROJECT_DIR="/opt/FullMinent-platform"

    # ── 4e. Restore .env ──
    log "Restoring .env..."
    cp "$STAGING/env-file.txt" "$PROJECT_DIR/.env"
    chmod 600 "$PROJECT_DIR/.env"
    log ".env restored (redacted for log):"
    sed 's/=.*/=REDACTED/' "$PROJECT_DIR/.env" | tee -a "$LOGFILE"

    # ── 4f. Restore SSL certs ──
    log "Restoring SSL certs..."
    if [ -d "$STAGING/certs/live" ]; then
        mkdir -p "$PROJECT_DIR/certbot/conf"
        cp -a "$STAGING/certs/live" "$PROJECT_DIR/certbot/conf/"
        [ -d "$STAGING/certs/archive" ] && cp -a "$STAGING/certs/archive" "$PROJECT_DIR/certbot/conf/"
        log "Certs restored."
    else
        log "WARN: No certs found in snapshot — SSL will need fresh certbot run."
    fi
    if [ -d "$STAGING/certbot-renewal-hooks" ]; then
        cp -a "$STAGING/certbot-renewal-hooks" "$PROJECT_DIR/certbot/conf/"
    fi
    if [ -d "$STAGING/certbot-scripts" ]; then
        cp -a "$STAGING/certbot-scripts" "$PROJECT_DIR/scripts/"
    fi

    # ── 4g. Restore systemd overrides ──
    log "Restoring systemd overrides..."
    if [ -d "$STAGING/systemd" ]; then
        for dir in certbot.service.d certbot.timer.d; do
            if [ -d "$STAGING/systemd/$dir" ]; then
                cp -a "$STAGING/systemd/$dir" "/etc/systemd/system/"
                log "  Restored $dir"
            fi
        done
        systemctl daemon-reload 2>/dev/null || true
    fi

    # ── 4h. Restore cron ──
    log "Restoring cron jobs..."
    if [ -d "$STAGING/cron/cron.d" ]; then
        cp -a "$STAGING/cron/cron.d/"* /etc/cron.d/ 2>/dev/null || true
        log "  Cron restored."
    fi
    if [ -f "$STAGING/cron/root-crontab.txt" ]; then
        crontab "$STAGING/cron/root-crontab.txt" 2>/dev/null || true
        log "  Root crontab restored."
    fi

    # ── 4i. Restore Docker named volumes ──
    log "Restoring Docker named volumes..."
    for vol_tar in "$STAGING/volumes/"*.tar.gz; do
        [ -f "$vol_tar" ] || continue
        vol_name=$(basename "$vol_tar" .tar.gz)
        log "  Creating and restoring volume: $vol_name"
        docker volume create "$vol_name" 2>/dev/null || true
        docker run --rm -v "${vol_name}:/target" -v "$STAGING/volumes:/source" alpine \
            tar xzf "/source/$(basename "$vol_tar")" -C /target 2>/dev/null || true
    done

    # ── 4j. Import MongoDB dump ──
    log "Importing MongoDB dump..."
    if [ -f "$STAGING/latest-mongodb-dump.archive" ]; then
        docker compose -f "$PROJECT_DIR/docker-compose.yml" up -d mongo 2>/dev/null || true
        sleep 3
        # Wait for mongo to be ready
        for i in $(seq 1 10); do
            docker exec FullMinent_mongo mongosh --eval "db.adminCommand('ping')" 2>/dev/null && break
            sleep 2
        done
        # Restore
        DUMP_SIZE=$(stat -c%s "$STAGING/latest-mongodb-dump.archive" 2>/dev/null || echo 0)
        log "  Dump size: $(( DUMP_SIZE / 1024 / 1024 )) MB"
        docker exec -i FullMinent_mongo sh -c 'mongorestore --archive --gzip --db FullMinent --drop' \
            < "$STAGING/latest-mongodb-dump.archive" 2>&1 | tee -a "$LOGFILE" || \
            log "  WARN: mongorestore failed — check MongoDB version (4.4 required)"
    else
        log "WARN: No MongoDB dump found in snapshot."
    fi

    # ── 4k. docker compose up ──
    log "Starting full stack..."
    cd "$PROJECT_DIR"
    docker compose up -d --build 2>&1 | tee -a "$LOGFILE"

    # ── 4l. Verify ──
    log "Waiting for app to be ready..."
    sleep 10
    for i in $(seq 1 12); do
        HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5000/ 2>/dev/null || echo "000")
        if [ "$HTTP_CODE" != "000" ]; then
            log "SUCCESS: App responds with HTTP $HTTP_CODE"
            break
        fi
        log "  Waiting... ($i/12)"
        sleep 5
    done

    # ── Summary ──
    echo ""
    echo "=============================================="
    echo " Restore Complete"
    echo "=============================================="
    echo " Project:  $PROJECT_DIR"
    echo " Log:      $LOGFILE"
    echo ""
    echo " Check status:  docker compose ps"
    echo " View logs:     docker compose logs -f"
    echo ""
    echo " If certs were restored, the site should be"
    echo " reachable via nginx on ports 80/443."
    echo " Otherwise, run:  docker compose logs nginx"
    echo "=============================================="
EOSSH

echo ""
log "Restore script finished. Check log on VM:"
echo "  ssh root@${VM_IP} 'cat /tmp/FullMinent-restore-vm-*.log | tail -50'"
