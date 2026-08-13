#!/bin/bash
# Standalone database health check — run anytime to verify data integrity.
# Usage: bash check-db-health.sh [--prod]
set -euo pipefail

ALERT_EMAIL="admin@drsrv.net.ar"
DROP_THRESHOLD=50
STATE_FILE="/root/KuraTe-platform/backups/.last_doc_counts.json"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

send_alert() {
    local subject="$1"
    local body="$2"
    if command -v mail &>/dev/null; then
        echo "$body" | mail -s "$subject" "$ALERT_EMAIL" 2>/dev/null || true
    fi
    log "ALERT: $subject — $body"
}

log "=== KuraTe Database Health Check ==="

# Get document counts
COUNTS=$(docker exec KuraTe_mongo mongo -u kurateApp -p Kurate2026Secure! --authenticationDatabase admin KuraTe --quiet --eval '
    var cols = ["users","services","provinces","cities","feedbacks","activitylogs"];
    var result = {};
    cols.forEach(function(c) { result[c] = db[c].count(); });
    printjson(result);
' 2>/dev/null | tail -n +2)

if [ -z "$COUNTS" ]; then
    log "ERROR: Could not query MongoDB"
    exit 1
fi

log "Current counts: $COUNTS"

# Check minimum thresholds (absolute)
ISSUES=""
for COL in users services provinces cities; do
    CURR=$(echo "$COUNTS" | grep -oP "\"$COL\" : \K\d+" || echo "0")
    case $COL in
        users)     MIN=10 ;;
        services)  MIN=50 ;;
        provinces) MIN=20 ;;
        cities)    MIN=100 ;;
    esac
    if [ "$CURR" -lt "$MIN" ]; then
        ISSUES="${ISSUES}  - $COL: $CURR (minimum expected: $MIN)\n"
    fi
done

# Compare with last known good state
if [ -f "$STATE_FILE" ]; then
    PREV_COUNTS=$(cat "$STATE_FILE")
    log "Comparing with previous: $PREV_COUNTS"

    for COL in users services provinces cities feedbacks; do
        CURR=$(echo "$COUNTS" | grep -oP "\"$COL\" : \K\d+" || echo "0")
        PREV=$(echo "$PREV_COUNTS" | grep -oP "\"$COL\" : \K\d+" || echo "0")

        if [ "$PREV" -gt 0 ] && [ "$CURR" -gt 0 ]; then
            DIFF=$(( PREV - CURR ))
            if [ "$DIFF" -gt 0 ]; then
                PCT=$(( DIFF * 100 / PREV ))
                if [ "$PCT" -ge "$DROP_THRESHOLD" ]; then
                    ISSUES="${ISSUES}  - $COL: $PREV → $CURR (↓${PCT}%)\n"
                fi
            fi
        fi

        if [ "$CURR" -eq 0 ] && [ "$PREV" -gt 0 ]; then
            ISSUES="${ISSUES}  - $COL: $PREV → 0 (COLLECTION EMPTIED!)\n"
        fi
    done
else
    log "No previous state file found — skipping comparison"
fi

# Check latest backup size
LATEST_BACKUP=$(ls -t /root/KuraTe-platform/backups/mongo_*.gz 2>/dev/null | head -1)
if [ -n "$LATEST_BACKUP" ]; then
    BACKUP_SIZE=$(stat -c%s "$LATEST_BACKUP" 2>/dev/null || stat -f%z "$LATEST_BACKUP" 2>/dev/null || echo 0)
    BACKUP_AGE=$(( ($(date +%s) - $(stat -c%Y "$LATEST_BACKUP" 2>/dev/null || stat -f%m "$LATEST_BACKUP" 2>/dev/null || echo 0)) / 3600 ))
    log "Latest backup: $(basename $LATEST_BACKUP) — ${BACKUP_SIZE} bytes, ${BACKUP_AGE}h ago"

    if [ "$BACKUP_SIZE" -lt 1024 ]; then
        ISSUES="${ISSUES}  - Latest backup is suspiciously small: ${BACKUP_SIZE} bytes\n"
    fi
    if [ "$BACKUP_AGE" -gt 48 ]; then
        ISSUES="${ISSUES}  - Latest backup is ${BACKUP_AGE} hours old (>48h)\n"
    fi
else
    ISSUES="${ISSUES}  - No backup files found!\n"
fi

# Report
echo ""
if [ -n "$ISSUES" ]; then
    log "ISSUES FOUND:"
    echo -e "$ISSUES"
    send_alert "KuraTe DB Health Check: Issues Found" "$(echo -e "$ISSUES")"
    exit 1
else
    log "ALL CHECKS PASSED"
    exit 0
fi
