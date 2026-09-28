#!/bin/bash
BACKUP_DIR=/root/KuraTe-platform/backups
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/mongo_$DATE.gz"
docker exec KuraTe_mongo mongodump --archive --gzip --uri='mongodb://kurateApp:Kurate2026Secure!@localhost:27017/KuraTe?authSource=admin' > "$OUT" 2>/tmp/kurate_backup_err.log
if [ ! -s "$OUT" ]; then
  echo "[$DATE] FAILED backup (empty file). Error:"
  tail -5 /tmp/kurate_backup_err.log
  rm -f "$OUT"
  exit 1
fi
find "$BACKUP_DIR" -name "mongo_*.gz" -mtime +7 -delete
echo "[$DATE] Backup done: $(ls -lh "$OUT" | awk '{print $5}')"
