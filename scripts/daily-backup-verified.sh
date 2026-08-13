#!/bin/bash
# Verified daily MongoDB backup with integrity checks and dramatic-change alerts.
# Runs at 03:00 UTC via cron.
set -euo pipefail

BACKUP_DIR=/root/KuraTe-platform/backups
LOG=/var/log/KuraTe_daily_backup.log
STATE_FILE="$BACKUP_DIR/.last_doc_counts.json"
ALERT_EMAIL="admin@drsrv.net.ar"
MIN_BACKUP_SIZE=1024  # bytes — smaller than this = suspicious
DROP_THRESHOLD=50     # percent — alert if any key collection drops more than this

mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/mongo_$DATE.gz"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

send_alert() {
    local subject="$1"
    local body="$2"
    # Send via local mail (if available) or log a clear warning
    if command -v mail &>/dev/null; then
        echo "$body" | mail -s "$subject" "$ALERT_EMAIL" 2>/dev/null || true
    fi
    # Also log prominently
    log "ALERT: $subject"
    log "ALERT BODY: $body"
}

# --- Step 1: Snapshot current document counts ---
log "Snapshotting document counts..."
COUNTS=$(docker exec KuraTe_mongo mongo -u kurateApp -p Kurate2026Secure! --authenticationDatabase admin KuraTe --quiet --eval '
    var cols = ["users","services","provinces","cities","feedbacks","activitylogs"];
    var result = {};
    cols.forEach(function(c) { result[c] = db[c].count(); });
    printjson(result);
' 2>/dev/null | tail -n +2)

if [ -z "$COUNTS" ]; then
    send_alert "KuraTe Backup WARNING: Could not snapshot document counts" \
        "Failed to query MongoDB document counts at $DATE."
    log "ERROR: Could not snapshot document counts"
else
    log "Current counts: $COUNTS"
fi

# --- Step 2: Create backup ---
log "Creating backup..."
docker exec KuraTe_mongo mongodump --archive --gzip 2>/dev/null > "$BACKUP_FILE"

BACKUP_SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE" 2>/dev/null || echo 0)
BACKUP_SIZE_KB=$((BACKUP_SIZE / 1024))
log "Backup created: $BACKUP_SIZE_KB KB"

# --- Step 3: Verify backup size ---
if [ "$BACKUP_SIZE" -lt "$MIN_BACKUP_SIZE" ]; then
    send_alert "KuraTe Backup CRITICAL: Backup too small" \
        "Backup file $BACKUP_FILE is only $BACKUP_SIZE bytes (minimum: $MIN_BACKUP_SIZE). The database may be empty or mongodump failed."
    log "CRITICAL: Backup too small ($BACKUP_SIZE bytes)"
fi

# --- Step 4: Verify backup integrity (gzip valid + cross-check with live counts) ---
docker cp "$BACKUP_FILE" KuraTe_mongo:/tmp/verify_backup.gz
GZIP_OK=$(docker exec KuraTe_mongo sh -c 'gunzip -t /tmp/verify_backup.gz 2>&1 && echo "OK" || echo "FAIL"')
docker exec KuraTe_mongo rm -f /tmp/verify_backup.gz

if [ "$GZIP_OK" != "OK" ]; then
    send_alert "KuraTe Backup CRITICAL: Corrupt gzip archive" \
        "Backup file $BACKUP_FILE failed gzip integrity check."
    log "CRITICAL: Corrupt gzip archive"
else
    log "Gzip integrity: OK"
fi

# Cross-check: live doc count vs backup file size ratio
if [ -n "$COUNTS" ]; then
    TOTAL_LIVE=$(echo "$COUNTS" | grep -oP ':\s*\K\d+' | paste -sd+ | bc 2>/dev/null || echo 0)
    log "Live total documents: $TOTAL_LIVE"
    if [ "$TOTAL_LIVE" -gt 0 ] && [ "$BACKUP_SIZE" -lt 2048 ]; then
        send_alert "KuraTe Backup WARNING: Backup suspiciously small for $TOTAL_LIVE documents" \
            "Live DB has $TOTAL_LIVE documents but backup is only $BACKUP_SIZE bytes."
        log "WARNING: Backup too small for $TOTAL_LIVE documents"
    fi
fi

# --- Step 5: Compare with previous document counts ---
if [ -f "$STATE_FILE" ] && [ -n "$COUNTS" ]; then
    PREV_COUNTS=$(cat "$STATE_FILE")
    log "Comparing with previous: $PREV_COUNTS"

    # Parse JSON counts and compare
    ALERT_LINES=""
    for COL in users services provinces cities feedbacks; do
        CURR=$(echo "$COUNTS" | grep -oP "\"$COL\" : \K\d+" || echo "0")
        PREV=$(echo "$PREV_COUNTS" | grep -oP "\"$COL\" : \K\d+" || echo "0")

        if [ "$PREV" -gt 0 ] && [ "$CURR" -gt 0 ]; then
            DIFF=$(( PREV - CURR ))
            if [ "$DIFF" -gt 0 ]; then
                PCT=$(( DIFF * 100 / PREV ))
                if [ "$PCT" -ge "$DROP_THRESHOLD" ]; then
                    ALERT_LINES="${ALERT_LINES}  - $COL: $PREV → $CURR (↓${PCT}%)\n"
                fi
            fi
        fi

        # Also alert if current is 0 but previous was not
        if [ "$CURR" -eq 0 ] && [ "$PREV" -gt 0 ]; then
            ALERT_LINES="${ALERT_LINES}  - $COL: $PREV → 0 (COLLECTION EMPTIED!)\n"
        fi
    done

    if [ -n "$ALERT_LINES" ]; then
        send_alert "KuraTe DATA LOSS ALERT: Dramatic drop in collections" \
            "The following collections lost >${DROP_THRESHOLD}% of documents since last backup:\n\n$(echo -e "$ALERT_LINES")\n\nPrevious ($PREV_COUNTS)\nCurrent ($COUNTS)\n\nCheck the database immediately."
    else
        log "All collections within normal range"
    fi
fi

# --- Step 6: Save current counts for next comparison ---
if [ -n "$COUNTS" ]; then
    echo "$COUNTS" > "$STATE_FILE"
    log "Saved document counts to $STATE_FILE"
fi

# --- Step 7: Cleanup old backups (keep 14 days) ---
DELETED=$(find "$BACKUP_DIR" -name "mongo_*.gz" -mtime +14 -delete -print | wc -l)
log "Cleaned up $DELETED old backups"

log "Backup complete: $BACKUP_FILE ($BACKUP_SIZE_KB KB)"
