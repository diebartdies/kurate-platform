#!/bin/bash
# Server disk housekeeping for FullMinent production.
# Safe defaults: never removes Docker volumes (mongo data preserved).
#
# Usage:
#   bash scripts/disk-housekeeping.sh [/root/FullMinent-platform]
#   AGGRESSIVE=1 bash scripts/disk-housekeeping.sh   # also prune unused images + build cache
#   MIN_FREE_GB=5 bash scripts/disk-housekeeping.sh  # warn/abort thresholds
#
# Installed weekly via: bash scripts/install-housekeeping-cron.sh

set -eu

DEPLOY_DIR="${1:-/root/FullMinent-platform}"
MIN_FREE_GB="${MIN_FREE_GB:-5}"
CRITICAL_FREE_GB="${CRITICAL_FREE_GB:-2}"
AGGRESSIVE="${AGGRESSIVE:-0}"

free_gb() {
  df / | awk 'NR==2 {printf "%d", $4/1024/1024}'
}

echo "==================================================="
echo "FullMinent disk housekeeping"
echo "Deploy dir: $DEPLOY_DIR"
echo "Mode: $([ "$AGGRESSIVE" = "1" ] && echo AGGRESSIVE || echo LIGHT)"
echo "==================================================="

echo ""
echo "Disk before:"
df -h / | tail -1

if command -v docker >/dev/null 2>&1; then
  echo ""
  echo "--- Docker (before) ---"
  docker system df 2>/dev/null || true

  echo ""
  avail_before="$(free_gb)"
  if [ "$AGGRESSIVE" = "1" ] || [ "$avail_before" -lt "$MIN_FREE_GB" ]; then
    if [ "$AGGRESSIVE" = "1" ]; then
      echo "Pruning Docker build cache (AGGRESSIVE)..."
    else
      echo "Pruning Docker build cache (disk below ${MIN_FREE_GB}GB — need space for build)..."
    fi
    docker builder prune -af 2>/dev/null || true
  else
    echo "Keeping Docker build cache (Chromium layer ~20min to rebuild). Use AGGRESSIVE=1 to force prune."
  fi

  echo "Pruning stopped containers..."
  docker container prune -f 2>/dev/null || true

  echo "Pruning dangling images..."
  docker image prune -f 2>/dev/null || true

  if [ "$AGGRESSIVE" = "1" ]; then
    echo "Pruning unused images (AGGRESSIVE)..."
    docker image prune -af 2>/dev/null || true
  fi

  echo ""
  echo "--- Docker (after) ---"
  docker system df 2>/dev/null || true
else
  echo "WARN: docker not found — skipping Docker cleanup"
fi

echo ""
echo "Trimming systemd journal (max 200M)..."
journalctl --vacuum-size=200M 2>/dev/null || true

echo "Cleaning apt cache..."
apt-get clean -y 2>/dev/null || apt clean 2>/dev/null || true

if [ -d "$DEPLOY_DIR" ]; then
  echo "Removing stale deploy artifacts in project dir..."
  rm -f "$DEPLOY_DIR/upload_package.tar.gz" 2>/dev/null || true
  find "$DEPLOY_DIR" -maxdepth 1 -name 'FullMinent_backup_*.archive' -mtime +14 -delete 2>/dev/null || true
fi

if [ -d /var/snap/docker ] && command -v snap >/dev/null 2>&1 && snap list docker >/dev/null 2>&1; then
  snap_docker_mb="$(du -sm /var/snap/docker 2>/dev/null | awk '{print $1}')"
  if [ "${snap_docker_mb:-0}" -gt 1024 ] && [ "$(command -v docker || true)" = "/usr/bin/docker" ]; then
    echo ""
    echo "NOTE: /var/snap/docker uses >1GB but active docker is /usr/bin/docker."
    echo "      Reclaim space with: snap remove docker --purge"
  fi
fi

echo ""
echo "Disk after:"
df -h / | tail -1

avail="$(free_gb)"
echo ""
echo "Free space: ${avail}GB (warn below ${MIN_FREE_GB}GB, abort below ${CRITICAL_FREE_GB}GB)"

if [ "$avail" -lt "$CRITICAL_FREE_GB" ]; then
  echo "ERROR: critically low disk — free at least ${CRITICAL_FREE_GB}GB before building."
  echo "Try: AGGRESSIVE=1 bash $DEPLOY_DIR/scripts/disk-housekeeping.sh"
  exit 1
fi

if [ "$avail" -lt "$MIN_FREE_GB" ]; then
  echo "WARN: disk space is low. Builds may fail or be very slow."
fi

echo "Housekeeping complete."
