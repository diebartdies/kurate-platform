#!/bin/bash

DB_NAME="fullminent"
MONGO_CONTAINER="KuraTe_mongo"
BACKUP_DIR="/root/KuraTe_backups"
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="${DB_NAME}_${TIMESTAMP}.archive"
FULL_BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

echo "Starting daily MongoDB backup for database '$DB_NAME'..."
echo "Backup file: $FULL_BACKUP_PATH"

docker exec "$MONGO_CONTAINER" sh -c "mongodump --archive=/tmp/${BACKUP_FILE} --gzip --db ${DB_NAME}"

docker cp "${MONGO_CONTAINER}:/tmp/${BACKUP_FILE}" "$FULL_BACKUP_PATH"

docker exec "$MONGO_CONTAINER" rm "/tmp/${BACKUP_FILE}"

echo "Backup completed successfully to $FULL_BACKUP_PATH"

echo "Cleaning up old backups (older than $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -type f -name "${DB_NAME}_*.archive" -mtime +"$RETENTION_DAYS" -delete
echo "Old backups cleaned."

echo "Daily backup script finished."
