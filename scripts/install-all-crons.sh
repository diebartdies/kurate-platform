#!/bin/bash
# KuraTe Platform — One-shot installer for all scheduled tasks
# Purpose: Sets up everything on first deploy: MongoDB backup cron, SSL cert renewal,
# and git backup push. Run this once on a fresh server after deploying the project.
# Project: KuraTe — Professional services marketplace (kurate.drsrv.net.ar)
#
# Usage: bash scripts/install-all-crons.sh [/root/KuraTe-platform]

set -eu

DEPLOY_DIR="${1:-/root/KuraTe-platform}"
cd "$DEPLOY_DIR"

echo "=== KuraTe — Installing all scheduled tasks ==="

echo ""
echo "[1/3] Daily MongoDB backup..."
bash "$DEPLOY_DIR/scripts/install-daily-backup-cron.sh" "$DEPLOY_DIR"

echo ""
echo "[2/3] SSL cert renewal timer..."
bash "$DEPLOY_DIR/scripts/certbot/install-systemd.sh" "$DEPLOY_DIR"

echo ""
echo "[3/3] Git backup push..."
bash "$DEPLOY_DIR/scripts/install-git-backup-cron.sh" "$DEPLOY_DIR"

echo ""
echo "=== All scheduled tasks installed ==="
echo ""
echo "  03:00 UTC — MongoDB backup"
echo "  04:15 UTC — SSL cert renewal"
echo "  06:00 UTC — Git backup push"
echo "  18:00 UTC — Git backup push"
