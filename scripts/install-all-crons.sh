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

# /etc/cron.d/* NO se ejecuta por el solo hecho de existir: hace falta el daemon
# cron. Una Ubuntu minimal (imagen cloud, container) suele no traerlo, y en ese
# caso los .cron.d quedan inertes SIN error visible: los backups "se configuran"
# y nunca corren. Paso explicito para no volver a caer en eso.
echo ""
echo "[0/4] Asegurando el servicio cron..."
if ! command -v cron >/dev/null 2>&1 && ! [ -x /usr/sbin/cron ]; then
  echo "  cron no esta instalado: instalando..."
  DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1 || true
  DEBIAN_FRONTEND=noninteractive apt-get install -y cron >/dev/null 2>&1 \
    || { echo "  ERROR: no se pudo instalar cron. Los crons no van a correr."; exit 1; }
fi
if command -v systemctl >/dev/null 2>&1; then
  systemctl enable --now cron >/dev/null 2>&1 || true
  if systemctl is-active --quiet cron; then
    echo "  OK   cron activo (enabled: $(systemctl is-enabled cron 2>/dev/null || echo '?'))"
  else
    echo "  ERROR: cron instalado pero el servicio no esta activo."; exit 1
  fi
else
  service cron start >/dev/null 2>&1 || true
  echo "  (sin systemd: se intento 'service cron start')"
fi

echo ""
echo "[1/4] Daily MongoDB backup..."
bash "$DEPLOY_DIR/scripts/install-daily-backup-cron.sh" "$DEPLOY_DIR"

echo ""
echo "[2/4] SSL cert renewal timer..."
bash "$DEPLOY_DIR/scripts/certbot/install-systemd.sh" "$DEPLOY_DIR"

echo ""
echo "[3/4] Git backup push..."
bash "$DEPLOY_DIR/scripts/install-git-backup-cron.sh" "$DEPLOY_DIR"

echo ""
echo "=== All scheduled tasks installed ==="
echo ""
echo "  03:00 UTC — MongoDB backup"
echo "  04:15 UTC — SSL cert renewal"
echo "  06:00 UTC — Git backup push"
echo "  18:00 UTC — Git backup push"
