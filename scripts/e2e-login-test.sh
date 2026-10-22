#!/bin/bash
set -e
B="https://kurate.drsrv.net.ar"
J=''
# 1) register a REAL fresh user through the public HTTPS front door
echo "=== 1) POST /api/v1/auth/register (role=user, fresh email) ==="
REG=$(curl -sk -w '\n%{http_code}' -X POST "$B/api/v1/auth/register" -H 'Content-Type: application/json' -d '{
  "email":"carlo.kurate@drsrv.net.ar",
  "password":"Palo1010Comodo2026!",
  "name":"Carlo KuraTe",
  "role":"user"
}' 2>&1)
echo "$REG" | tail -1 | grep -q 20 && echo "REGISTER_OK(201/200)" || echo "REGISTER_FAILED"
echo "$REG" | head -1
CODE=$(echo "$REG" | head -1 | grep -oE '[0-9]{6}' | head -1)
echo "verify_code=$CODE"
# 2) verify email (production flow)
echo "=== 2) POST /api/v1/auth/verify-email (code) ==="
V=$(curl -sk -w '\n%{http_code}' -X POST "$B/api/v1/auth/verify-email" -H 'Content-Type: application/json' -d "{\"email\":\"carlo.kurate@drsrv.net.ar\",\"code\":\"$CODE\"}" 2>&1)
echo "$V" | tail -1
# 3) login with the SAME password I set
echo "=== 3) POST /api/v1/auth/login ==="
L=$(curl -sk -w '\n%{http_code}' -X POST "$B/api/v1/auth/login" -H 'Content-Type: application/json' -d '{"email":"carlo.kurate@drsrv.net.ar","password":"Palo1010Comodo2026!"}' 2>&1)
RC=$(echo "$L" | tail -1)
echo "login_http=$RC"
TOK=$(echo "$L" | head -1 | grep -oE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' | head -1)
echo "jwt_present=$([ -n "$TOK" ] && echo YES || echo NO)"
[ -n "$TOK" ] && echo "$TOK" > /tmp/kurate.jwt
# 4) hit protected /api/v1/users/me with token
echo "=== 4) GET /api/v1/users/me (authenticated) ==="
[ -n "$TOK" ] && curl -sk -w '\n%{http_code}\n' "$B/api/v1/users/me" -H "Authorization: Bearer $TOK" | head -8
echo "=== DONE ==="