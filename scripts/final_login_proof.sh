#!/bin/bash
B="https://kurate.drsrv.net.ar"
echo "=== the ONE thing that mattered: does a REAL fresh user work over public HTTPS? ==="
echo "--- register [201] ---"
R=$(curl -sk -w '\n%{http_code}' -X POST "$B/api/v1/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"email":"carlo.kurate@drsrv.net.ar","password":"Palo1010Comodo2026!","name":"Carlo KuraTe","role":"user"}')
RC=$(echo "$R" | tail -1); echo "register_http=$RC"
# code returned by server in register response (dev-friendly)
CODE=$(echo "$R" | grep -oE "[0-9]{6}" | head -1)
echo "verify_code=$CODE"
echo "--- verify-email [200] ---"
V=$(curl -sk -w '\n%{http_code}' -X POST "$B/api/v1/auth/verify-email" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"carlo.kurate@drsrv.net.ar\",\"code\":\"$CODE\"}")
echo "verify_http=$(echo "$V" | tail -1)"
TOK=$(echo "$V" | grep -oE "eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+" | head -1)
echo "jwt_after_verify=$([ -n "$TOK" ] && echo YES || echo NO)"
echo "--- login [200 + JWT] ---"
L=$(curl -sk -w '\n%{http_code}' -X POST "$B/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"carlo.kurate@drsrv.net.ar","password":"Palo1010Comodo2026!"}')
echo "login_http=$(echo "$L" | tail -1)"
LT=$(echo "$L" | grep -oE "eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+" | head -1)
echo "login_jwt=$([ -n "$LT" ] && echo YES || echo NO)"
[ -n "$LT" ] && echo "$LT" > /tmp/kurate_login.jwt
echo "=== summary ==="
echo "RESULT: $(echo "$RC" | grep -q 201 && echo register_OK; echo "$V" | tail -1 | grep -q 200 && echo verify_OK; echo "$L" | tail -1 | grep -q 200 && echo login_OK)"