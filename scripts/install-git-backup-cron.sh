#!/bin/bash
# Install twice-daily GitHub backup cron (06:00 and 18:00 UTC).
set -eu

DEPLOY_DIR="${1:-/root/FullMinent-platform}"
SCRIPT="$DEPLOY_DIR/scripts/git-backup-push.sh"
LOG="/var/log/FullMinent_git_backup.log"
CRON_LINE="0 6,18 * * * root bash $SCRIPT $DEPLOY_DIR >> $LOG 2>&1"

if [ ! -f "$SCRIPT" ]; then
  echo "ERROR: $SCRIPT not found"
  exit 1
fi

chmod +x "$SCRIPT"

MARKER="# FullMinent-git-backup"
CRON_FILE="/etc/cron.d/FullMinent-git-backup"

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
echo "Runs: daily at 06:00 and 18:00 UTC"
echo ""
echo "One-off test:"
echo "  bash $SCRIPT $DEPLOY_DIR"
echo ""
echo "If prod must overwrite GitHub on conflict, edit $CRON_FILE and add:"
echo "  GIT_BACKUP_FORCE=1 before bash on the cron line"
