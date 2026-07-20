param(
    [Parameter(Mandatory)]
    [string]$VmIp,

    [Parameter(Mandatory)]
    [string]$ArchivePath
)

$ErrorActionPreference = "Stop"
$DATE = Get-Date -Format "yyyy-MM-dd_HHmmss"
$LOGFILE = "$env:USERPROFILE\Desktop\KuraTe-restore-$DATE.log"
$REMOTE_LOG = "/tmp/KuraTe-restore-vm-$DATE.log"
$SCRIPT = "$env:TEMP\KuraTe-restore-remote.sh"

function log { param([string]$msg) $msg | Tee-Object -FilePath $LOGFILE -Append | Write-Host }

if (-not (Test-Path $ArchivePath)) { Write-Host "ERROR: Archive not found: $ArchivePath"; exit 1 }

Write-Host "=============================================="
Write-Host " KuraTe — Disaster Recovery Restore"
Write-Host " VM:        $VmIp"
Write-Host " Archive:   $ArchivePath"
Write-Host " Local log: $LOGFILE"
Write-Host "=============================================="
Write-Host ""

# Write the remote bash script (no $ expansion issues since we write to file)
@'
#!/bin/bash
set -euo pipefail

ARCHIVE="$1"
GITHUB_TOKEN="$2"
REMOTE_LOG="$3"
BACKUP_FILE="${4:-}"
STAGING="/root/staging"
PROJECT_DIR="/opt/KuraTe-platform"
REPO_URL="https://${GITHUB_TOKEN}@github.com/diebartdies/KuraTe-platform.git"
GITHUB_TOKEN=""

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$REMOTE_LOG"; }
run() { log ">>> $*"; "$@" 2>&1 | tee -a "$REMOTE_LOG"; }

log "=== KuraTe Disaster Recovery Restore ==="
log "Archive: $ARCHIVE"
log "Log:     $REMOTE_LOG"
log ""

# 1. Install Docker
log "Step 1/10: Docker"
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sh /tmp/get-docker.sh
    apt-get install -y -qq docker-compose-plugin
fi

# 2. Decrypt
log "Step 2/10: Decrypt"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -in "$ARCHIVE" -out /root/server_state.tar.gz

# 3. Extract
log "Step 3/10: Extract"
rm -rf "$STAGING"
tar xzf /root/server_state.tar.gz -C /root/
rm -f /root/server_state.tar.gz
cat "$STAGING/MANIFEST.txt"

# 4. Clone repo
log "Step 4/10: Clone repo"
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR" && git pull 2>&1 | tee -a "$REMOTE_LOG"
else
    git clone "$REPO_URL" "$PROJECT_DIR" 2>&1 | tee -a "$REMOTE_LOG"
fi
REPO_URL=""

# 5. Restore .env
log "Step 5/10: .env"
cp "$STAGING/env-file.txt" "$PROJECT_DIR/.env"
chmod 600 "$PROJECT_DIR/.env"

# 6. Restore certs
log "Step 6/10: Certs"
if [ -d "$STAGING/certs/live" ]; then
    mkdir -p "$PROJECT_DIR/certbot/conf"
    cp -a "$STAGING/certs/live" "$PROJECT_DIR/certbot/conf/"
    [ -d "$STAGING/certs/archive" ] && cp -a "$STAGING/certs/archive" "$PROJECT_DIR/certbot/conf/"
fi
if [ -d "$STAGING/certbot-renewal-hooks" ]; then
    mkdir -p "$PROJECT_DIR/certbot/conf/renewal-hooks"
    cp -a "$STAGING/certbot-renewal-hooks/"* "$PROJECT_DIR/certbot/conf/renewal-hooks/" 2>/dev/null || true
fi

# 7. Restore volumes
log "Step 7/10: Volumes"
for vol_tar in "$STAGING/volumes/"*.tar.gz; do
    [ -f "$vol_tar" ] || continue
    vol_name=$(basename "$vol_tar" .tar.gz)
    log "  Volume: $vol_name"
    docker volume create "$vol_name" 2>/dev/null || true
    docker run --rm -v "${vol_name}:/target" -v "$STAGING/volumes:/source" alpine \
        tar xzf "/source/$(basename "$vol_tar")" -C /target 2>/dev/null || true
done

# 8. MongoDB — restore from daily backup
log "Step 8/10: MongoDB"
if [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
    cd "$PROJECT_DIR"
    docker compose up -d mongo 2>/dev/null || true
    sleep 3
    for i in $(seq 1 10); do
        docker exec KuraTe_mongo mongo --eval "db.adminCommand('ping')" 2>/dev/null && break
        sleep 2
    done
    docker exec -i KuraTe_mongo sh -c 'mongorestore --archive --gzip --nsInclude=KuraTe.* --drop' \
        < "$BACKUP_FILE" 2>&1 | tee -a "$REMOTE_LOG" || \
        log "  WARN: mongorestore failed"
elif [ -f "$STAGING/latest-mongodb-dump.archive" ]; then
    log "  Found dump in snapshot archive (legacy mode)"
    cd "$PROJECT_DIR"
    docker compose up -d mongo 2>/dev/null || true
    sleep 3
    for i in $(seq 1 10); do
        docker exec KuraTe_mongo mongo --eval "db.adminCommand('ping')" 2>/dev/null && break
        sleep 2
    done
    docker exec -i KuraTe_mongo sh -c 'mongorestore --archive --gzip --nsInclude=KuraTe.* --drop' \
        < "$STAGING/latest-mongodb-dump.archive" 2>&1 | tee -a "$REMOTE_LOG" || \
        log "  WARN: mongorestore failed"
else
    log "  No backup file provided — skipping MongoDB restore."
    log "  Restore manually: scp backup to VM then:"
    log "    docker exec -i KuraTe_mongo sh -c 'mongorestore --archive --gzip --nsInclude=KuraTe.* --drop' < backup.archive"
fi

# 9. docker compose up
log "Step 9/10: docker compose up"
cd "$PROJECT_DIR"
docker compose up -d --build 2>&1 | tee -a "$REMOTE_LOG"

# 10. Verify
log "Step 10/10: Verify"
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

echo ""
log "=== Restore Complete ==="
echo "   3. Follow ansible/deploy.yml to provision base OS"
echo "   4. Restore .env from env-file.txt"
echo "   5. Restore certs from certs/"
echo "   6. Restore systemd overrides from systemd/"
echo "   7. Restore cron files from cron/"
echo "   8. git clone && docker compose up --build (app built fresh)"
echo "   9. Restore MongoDB from daily backup (see backup files)"
'@ | Set-Content -Path $SCRIPT -Encoding ASCII

# ── SCP files to VM ──
$archiveBasename = Split-Path $ArchivePath -Leaf
log "Uploading script + archive to VM..."
scp -q "$SCRIPT" "root@${VmIp}:/root/restore-remote.sh"
scp -q "$ArchivePath" "root@${VmIp}:/root/${archiveBasename}"

# ── Prompt for GitHub token ──
$secureToken = Read-Host -Prompt "Enter GitHub token" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
$githubToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)

# ── 4. Pick a MongoDB backup to restore ──
$backupFiles = @(Get-ChildItem -Path "$PSScriptRoot\.." -Filter "KuraTe_backup_*.archive" | Sort-Object LastWriteTime -Descending)
$restoreBackup = ""

if ($backupFiles.Count -gt 0) {
    Write-Host "`nAvailable MongoDB backups:" -ForegroundColor Cyan
    for ($i = 0; $i -lt $backupFiles.Count; $i++) {
        $mark = "  "
        if ($i -eq 0) { $mark = ">>" }
        Write-Host " [$($i+1)] $mark $($backupFiles[$i].Name) ($([math]::Round($backupFiles[$i].Length/1KB)) KB)"
    }
    Write-Host " [0] Skip (don't restore MongoDB)"
    $choice = Read-Host "Select backup to restore [default: 1 - latest]"
    if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }
    $idx = [int]$choice - 1
    if ($idx -ge 0 -and $idx -lt $backupFiles.Count) {
        $restoreBackup = $backupFiles[$idx].FullName
        log "Selected backup: $(Split-Path $restoreBackup -Leaf)"
    } else {
        log "Skipping MongoDB restore."
    }
} else {
    log "No local backups found — skipping MongoDB restore."
}

# ── 5. SCP backup to VM (if selected) ──
$backupArg = ""
if ($restoreBackup -ne "") {
    log "Uploading backup to VM..."
    scp -q "$restoreBackup" "root@${VmIp}:/root/latest-mongodb-dump.archive"
    $backupArg = "/root/latest-mongodb-dump.archive"
}

# ── SSH remote execution ──
log "Running restore on VM (this may take 10-20 min)..."
ssh -tt "root@${VmIp}" "bash /root/restore-remote.sh /root/${archiveBasename} '$githubToken' $REMOTE_LOG '$backupArg'"

$githubToken = $null
[GC]::Collect()

log "Done. Remote log: ssh root@${VmIp} 'cat $REMOTE_LOG | tail -30'"
