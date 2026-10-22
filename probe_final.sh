#!/bin/bash
B="https://kurate.drsrv.net.ar"
echo "=== FINAL PROOF: a REAL, freshly-registered user logs in fine ==="
echo "--- 1) register (new real account) ---"
R=$(curl -sk -w '\n%{http_code}' -X POST "$B/api/v1/auth/register" -H 'Content-Type: application/json' -d '{"email":"carlo.kurate@drsrv.net.ar","password":"Kurate1010Comodo2026!","name":"Carlo KuraTe","role":"user"}')
echo "register_http=$(echo "$R" | tail -1)"
CODE=$(echo "$R" | grep -oE "[0-9]{6}" | head -1)
echo "verify_code=$CODE"
echo "--- 2) verify email ---"
V=$(curl -sk -w '\n%{http_code}' -X POST "$B/api/v1/auth/verify-email" -H 'Content-Type: application/json' -d "{\"email\":\"carlo.kurate@drsrv.net.ar\",\"code\":\"$CODE\"}")
echo "verify_http=$(echo "$V" | tail -1)"
echo "--- 3) LOGIN with the known password ---"
L=$(curl -sk -w '\n%{http_code}' -X POST "$B/api/v1/auth/login" -H 'Content-Type: application/json' -d '{"email":"carlo.kurate@drsrv.net.ar","password":"Kurate1010Comodo2026!"}')
echo "login_http=$(echo "$L" | tail -1)"
TOK=$(echo "$L" | grep -oE "eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+" | head -1)
echo "jwt_present=$([ -n "$TOK" ] && echo YES || echo NO)"
echo "--- 4) authenticated GET /users/me (role user) ---"
CONF=$(grep -nE "app\.use\(\"/[a-zA-Z0-9/_-]+\",\s*(users|auth)" server.js 2>/dev/null | head -2)
echo "mounts: $CONF"
code=$(curl -sk -o /dev/null -w '%{http_code}' "$B/api/v1/users/me" -H "Authorization: Bearer $TOK")
echo "/api/v1/users/me = $code"
code=$(curl -sk -o /dev/null -w '%{http_code}' "$B/api/users/me" -H "Authorization: Bearer $TOK")
echo "/api/users/me     = $code"