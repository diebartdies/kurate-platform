#!/bin/bash
# Quick prod diagnostics for admin API / nginx / app container issues.
set -eu

DEPLOY_DIR="${1:-/root/FullMinent-platform}"
cd "$DEPLOY_DIR"

echo "==> Container status"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'NAMES|FullMinent' || true

echo ""
echo "==> App health (inside app network)"
if docker exec FullMinent_app wget -qO- http://127.0.0.1:5000/api/v1/health 2>/dev/null; then
  echo ""
else
  echo "FAIL: app did not respond on /api/v1/health"
fi

echo ""
echo "==> Public API via nginx (localhost)"
curl -sk -o /dev/null -w "category-pricing HTTP %{http_code}\n" https://127.0.0.1/api/v1/public/category-pricing || true
curl -sk -o /dev/null -w "admin/professionals HTTP %{http_code} (expect 401 without token)\n" https://127.0.0.1/api/v1/admin/professionals || true

echo ""
echo "==> Recent app errors"
docker logs FullMinent_app --tail 30 2>&1 | tail -30

echo ""
echo "==> Recent nginx errors"
docker logs FullMinent_nginx --tail 20 2>&1 | tail -20

echo ""
echo "If admin returns 429: admin rate limit was too low — redeploy with ADMIN_RATE_LIMIT_MAX (default 2000)."
echo "If admin/professionals is 502: docker logs FullMinent_app --tail 100"
echo "If 401 after login: log out, clear site data, log in again (cookie + token sync)."
echo "After code deploy: bash scripts/deploy-restart.sh $DEPLOY_DIR"
