#!/bin/bash
BACKUP_DIR=/root/KuraTe-platform/backups
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)
docker exec KuraTe_mongo mongodump --archive --gzip 2>/dev/null > "$BACKUP_DIR/mongo_$DATE.gz"
find "$BACKUP_DIR" -name "mongo_*.gz" -mtime +7 -delete
echo "[$DATE] Backup done: $(ls -lh "$BACKUP_DIR/mongo_$DATE.gz" | awk '{print $5}')"
