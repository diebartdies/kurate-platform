#!/usr/bin/env bash
# Fix: visitor IPs show Docker NAT (172.18.0.1) instead of real client IPs.
# Root cause: Docker userland-proxy NATs published ports, hiding source IPs
# before traffic reaches nginx — so X-Forwarded-For carries the NAT address.
# Fix: disable userland-proxy so published ports use iptables DNAT, which
# preserves the real source IP end to end.
#
# Requires a Docker daemon restart (ALL containers stop/start, ~1-2 min
# downtime). Run ON THE VPS during a low-traffic window.
set -euo pipefail

DAEMON_JSON="/etc/docker/daemon.json"

echo "=== Current Docker daemon config ==="
cat "$DAEMON_JSON" 2>/dev/null || echo "(file does not exist)"

if [ -f "$DAEMON_JSON" ]; then
  BACKUP="/etc/docker/daemon.json.bak.$(date +%s)"
  cp "$DAEMON_JSON" "$BACKUP"
  echo "Backup saved: $BACKUP"
  echo ""
  echo "=== Merging {\"userland-proxy\": false} (existing settings preserved) ==="
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$DAEMON_JSON" <<'EOF'
import json, sys
path = sys.argv[1]
try:
    with open(path) as f:
        cfg = json.load(f)
    if not isinstance(cfg, dict):
        cfg = {}
except ValueError:
    cfg = {}
cfg["userland-proxy"] = False
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")
print("merged via python3")
EOF
  elif command -v jq >/dev/null 2>&1; then
    tmp="$(mktemp)"
    jq '.["userland-proxy"] = false' "$DAEMON_JSON" > "$tmp"
    cat "$tmp" > "$DAEMON_JSON"
    rm -f "$tmp"
    echo "merged via jq"
  else
    echo "ERROR: $DAEMON_JSON exists but neither python3 nor jq is available for a safe merge."
    echo "Install one, or add \"userland-proxy\": false manually (backup at $BACKUP). Aborting."
    exit 1
  fi
else
  echo ""
  echo "=== Creating $DAEMON_JSON ==="
  printf '{\n  "userland-proxy": false\n}\n' > "$DAEMON_JSON"
fi

echo ""
echo "Effective config:"
cat "$DAEMON_JSON"

echo ""
read -r -p "Restart Docker daemon now? All containers will stop/start (~1-2 min downtime) [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted. Config is staged — restart Docker manually later: systemctl restart docker"
  exit 0
fi

echo ""
echo "Restarting Docker daemon..."
systemctl restart docker

echo "Waiting for containers to come back..."
sleep 15

echo ""
echo "=== Container status ==="
docker ps --format "table {{.Names}}\t{{.Status}}"

for c in KuraTe_nginx KuraTe_app KuraTe_mongo; do
  if ! docker ps --format '{{.Names}}' | grep -qx "$c"; then
    echo "WARNING: $c is not running — on the VPS run: docker compose up -d (in the project dir)"
  fi
done

echo ""
echo "=== Live IP check: one request, then inspect what nginx saw ==="
curl -s -o /dev/null -w "site HTTP code: %{http_code}\n" https://kurate.drsrv.net.ar/ || true
sleep 2
echo "--- last nginx access lines (first IP must NOT be 172.18.0.x) ---"
docker exec KuraTe_nginx tail -n 5 /var/log/nginx/access.log || echo "(could not read access log)"

echo ""
echo "Done. Final verify from your own machine:"
echo "  1. Visit the site, then check Admin > Access Logs (or GET /api/v1/admin/access-logs?limit=5)"
echo "  2. Visitor IPs should be real public IPs, not 172.18.0.1"
echo ""
echo "Note: with userland-proxy off, curling published ports via localhost FROM THE VPS"
echo "itself may stop working (known side effect). External traffic is unaffected."
