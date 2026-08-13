#!/bin/bash
# KuraTe Event Monitor — runs every 5 minutes via cron.
# Tracks: database changes, auth failures, container health, disk space.
# Logs to /var/log/KuraTe_monitor.log and stores state for change detection.
set -euo pipefail

LOG="/var/log/KuraTe_monitor.log"
STATE_DIR="/root/KuraTe-platform/backups/.monitor"
mkdir -p "$STATE_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }
alert() {
    local level="$1" msg="$2"
    log "[$level] $msg"
    # Write to alert file for dashboard visibility
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $msg" >> "$STATE_DIR/alerts.log"
    # Keep last 500 alerts
    tail -500 "$STATE_DIR/alerts.log" > "$STATE_DIR/alerts.log.tmp" && mv "$STATE_DIR/alerts.log.tmp" "$STATE_DIR/alerts.log"
}

# --- 1. MongoDB health ---
MONGO_OK=true
if ! docker exec KuraTe_mongo mongo -u kurateApp -p Kurate2026Secure! --authenticationDatabase admin KuraTe --quiet --eval 'db.adminCommand({ping:1})' &>/dev/null; then
    alert "CRITICAL" "MongoDB ping failed"
    MONGO_OK=false
fi

if $MONGO_OK; then
    # Document counts
    COUNTS=$(docker exec KuraTe_mongo mongo -u kurateApp -p Kurate2026Secure! --authenticationDatabase admin KuraTe --quiet --eval '
        var cols = ["users","services","provinces","cities","feedbacks"];
        var r = {};
        cols.forEach(function(c){ r[c] = db[c].count(); });
        printjson(r);
    ' 2>/dev/null | tail -n +2)

    if [ -n "$COUNTS" ]; then
        CURR_FILE="$STATE_DIR/last_counts.json"
        if [ -f "$CURR_FILE" ]; then
            PREV=$(cat "$CURR_FILE")
            for COL in users services provinces cities feedbacks; do
                CURR=$(echo "$COUNTS" | grep -oP "\"$COL\" : \K\d+" || echo "0")
                OLD=$(echo "$PREV" | grep -oP "\"$COL\" : \K\d+" || echo "0")
                if [ "$OLD" -gt 0 ] && [ "$CURR" -gt 0 ]; then
                    DIFF=$(( OLD - CURR ))
                    if [ "$DIFF" -gt 0 ]; then
                        PCT=$(( DIFF * 100 / OLD ))
                        if [ "$PCT" -ge 20 ]; then
                            alert "WARNING" "Collection $COL dropped ${PCT}% ($OLD → $CURR)"
                        fi
                    fi
                fi
                if [ "$CURR" -eq 0 ] && [ "$OLD" -gt 0 ]; then
                    alert "CRITICAL" "Collection $COL is now EMPTY (was $OLD)"
                fi
            done
        fi
        echo "$COUNTS" > "$CURR_FILE"
    fi
fi

# --- 2. Docker container health ---
for CONTAINER in KuraTe_mongo KuraTe_app KuraTe_web KuraTe_nginx; do
    STATUS=$(docker inspect --format='{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo "missing")
    RESTARTS=$(docker inspect --format='{{.RestartCount}}' "$CONTAINER" 2>/dev/null || echo "0")
    LAST_RESTART_FILE="$STATE_DIR/${CONTAINER}_restarts"

    if [ "$STATUS" != "running" ]; then
        alert "CRITICAL" "Container $CONTAINER is $STATUS"
    fi

    if [ -f "$LAST_RESTART_FILE" ]; then
        LAST_RESTARTS=$(cat "$LAST_RESTART_FILE")
        if [ "$RESTARTS" -gt "$LAST_RESTARTS" ]; then
            DIFF=$(( RESTARTS - LAST_RESTARTS ))
            alert "WARNING" "Container $CONTAINER restarted $DIFF time(s) (total: $RESTARTS)"
        fi
    fi
    echo "$RESTARTS" > "$LAST_RESTART_FILE"
done

# --- 3. Disk space ---
DISK_PCT=$(df / | awk 'NR==2 {gsub(/%/,""); print $5}')
if [ "$DISK_PCT" -ge 90 ]; then
    alert "CRITICAL" "Disk usage at ${DISK_PCT}%"
elif [ "$DISK_PCT" -ge 80 ]; then
    alert "WARNING" "Disk usage at ${DISK_PCT}%"
fi

# --- 4. MongoDB backup freshness ---
LATEST_BACKUP=$(ls -t /root/KuraTe-platform/backups/mongo_*.gz 2>/dev/null | head -1)
if [ -n "$LATEST_BACKUP" ]; then
    BACKUP_AGE=$(( ($(date +%s) - $(stat -c%Y "$LATEST_BACKUP")) / 3600 ))
    if [ "$BACKUP_AGE" -gt 36 ]; then
        alert "WARNING" "Latest backup is ${BACKUP_AGE}h old"
    fi
else
    alert "CRITICAL" "No backup files found"
fi

# --- 5. App error log check ---
APP_ERRORS=$(docker logs KuraTe_app --since 5m 2>&1 | grep -ci "requires authentication\|ECONNREFUSED\|unauthorized" || true)
if [ "$APP_ERRORS" -gt 0 ]; then
    alert "WARNING" "App logged $APP_ERRORS auth/connection errors in last 5min"
fi

log "Monitor check complete — $(date '+%H:%M:%S')"

# Ensure alerts file exists
touch "$STATE_DIR/alerts.log"
