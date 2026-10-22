#!/bin/bash
# FINAL ANSWER, one file, zero inline quoting. Runs remotely.
B="https://kurate.drsrv.net.ar"
echo "=== THE answer to 'ningun usuario funciona': a REAL account login over public HTTPS ==="
L=$(curl -sk -w '\n%{http_code}' -X POST "$B/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"carlo.kurate@drsrv.net.ar","password":"Kurate2026Secure!PaloCarlo"}')
echo "login_http=$(echo "$L" | tail -1)"
JT=$(echo "$L" | grep -oE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' | head -1)
echo "jwt_present=$([ -n "$JT" ] && echo YES || echo NO)"
[ -n "$JT" ] && echo "$JT" > /tmp/kurate.working.jwt
echo "=== now /me with that real JWT (the exact route nobody had before) ==="
for p in /api/v1/users/me /api/users/me /api/v1/auth/me /api/v1/me; do
  c=$(curl -sk -o /dev/null -w '%{http_code}' "$B$p" -H "Authorization: Bearer $JT")
  echo "  $p = $c"
done