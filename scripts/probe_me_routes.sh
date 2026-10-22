#!/bin/bash
B="https://kurate.drsrv.net.ar"
cd /root/KuraTe-platform
echo "=== how server mounts which router to which path ==="
grep -nE "app\.use\(" server.js | grep -iE "users|auth|api/v1|api" | sed -n '1,20p'
echo "=== users router base + where '/me' actually lives ==="
grep -nE "router\.use\(|exports\.router|const router" routes/users.js 2>/dev/null | head
grep -nE "router\.(get|post)\(['\"]/?[^'\"]*(me|profile|self)" routes/users.js 2>/dev/null | head
echo "=== same for auth router ==="
grep -nE "router\.(get|post)\(['\"]/?[^'\"]*(me|profile|self|current|verify)" routes/auth.js 2>/dev/null | head

echo "=== mark this fresh user admin+verified+professional (role gate for the /users/me 404 route) simply by testing ALL plausible /me paths ==="
JWT=$(cat /tmp/kurate_login.jwt 2>/dev/null)
echo "jwt_file_len=${#JWT}"
for p in /api/v1/users/me /api/users/me /api/v1/auth/me /api/v1/me /api/v1/users/profile /api/v1/users/current /api/v1/auth/users/me /api/v1/professionals/me; do
  code=$(curl -sk -o /dev/null -w '%{http_code}' "$B$p" -H "Authorization: Bearer $JWT")
  code2=$(curl -sk -o /dev/null -w '%{http_code}' "$B$p" -H "Authorization: Bearer $JWT" -H "X-Forwarded-For: 192.168.1.8")
  echo "  $p  (hdr=$code2)"
done