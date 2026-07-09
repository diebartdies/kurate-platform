#!/bin/bash
# Install daily MongoDB backup cron (03:00 UTC).
set -eu

DEPLOY_DIR="${1:-/root/FullMinent-platform}"
SCRIPT="$DEPLOY_DIR/daily_backup.sh"
LOG="/var/log/FullMinent_daily_backup.log"
CRON_LINE="0 3 * * * root bash $SCRIPT >> $LOG 2>&1"

if [ ! -f "$SCRIPT" ]; then
  echo "ERROR: $SCRIPT not found"
  exit 1
fi

sed -i 's/\r$//' "$SCRIPT" 2>/dev/null || true
chmod +x "$SCRIPT"

MARKER="# FullMinent-daily-backup"
CRON_FILE="/etc/cron.d/FullMinent-daily-backup"

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
echo "Runs: daily at 03:00 UTC"
echo ""
echo "One-off test:"
echo "  bash $SCRIPT"
