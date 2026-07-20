#!/bin/bash
# Install weekly disk housekeeping cron (Sundays 03:15 UTC).
set -eu

DEPLOY_DIR="${1:-/root/KuraTe-platform}"
SCRIPT="$DEPLOY_DIR/scripts/disk-housekeeping.sh"
LOG="/var/log/KuraTe_housekeeping.log"
CRON_LINE="15 3 * * 0 root bash $SCRIPT $DEPLOY_DIR >> $LOG 2>&1"

if [ ! -f "$SCRIPT" ]; then
  echo "ERROR: $SCRIPT not found"
  exit 1
fi

chmod +x "$SCRIPT"

MARKER="# KuraTe-disk-housekeeping"
CRON_FILE="/etc/cron.d/KuraTe-housekeeping"

{
  echo "$MARKER"
  echo "SHELL=/bin/bash"
  echo "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
  echo "$CRON_LINE"
} > "$CRON_FILE"

chmod 644 "$CRON_FILE"
touch "$LOG"

echo "Installed $CRON_FILE"
echo "Log: $LOG"
echo "Runs: Sundays 03:15 UTC — LIGHT mode (no AGGRESSIVE prune)"
