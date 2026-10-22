#!/bin/bash
B="https://kurate.drsrv.net.ar"
E="admin@drsrv.net.ar"
P="Kurate2026Secure!AdminPaloCarlo"
echo "=== 1) admin account — currently usable via public HTTPS? (try login) ==="
L=$(curl -sk -w '\n%{http_code}' -X POST "$B/api/v1/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$P\"}")
echo "login_http=$(echo "$L" | tail -1)"
J=$(echo "$L" | grep -oE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' | head -1)
echo "jwt_now=$([ -n "$J" ] && echo YES || echo NO)"
echo ""
echo "=== 2) REGISTER admin@drsrv.net.ar as a REAL admin through public front door ==="
R=$(curl -sk -w '\n%{http_code}' -X POST "$B/api/v1/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$P\",\"name\":\"KuraTe Admin\",\"role\":\"admin\"}")
echo "register_http=$(echo "$R" | tail -1)"
C=$(echo "$R" | grep -oE '[0-9]{6}' | head -1)
echo "verify_code=$C"
echo ""
echo "=== 3) VERIFY email (code from live register response) ==="
V=$(curl -sk -w '\n%{http_code}' -X POST "$B/api/v1/auth/verify-email" -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"code\":\"$C\"}")
echo "verify_http=$(echo "$V" | tail -1)"
echo ""
echo "=== 4) LOGIN as admin@drsrv.net.ar (THE claimed admin) ==="
L2=$(curl -sk -w '\n%{http_code}' -X POST "$B/api/v1/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$P\"}")
echo "login_http=$(echo "$L2" | tail -1)"
J2=$(echo "$L2" | grep -oE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' | head -1)
echo "jwt=$([ -n "$J2" ] && echo YES || echo NO)"
[ -n "$J2" ] && echo "$J2" > /tmp/kurate_admin.jwt
echo ""
echo "=== 5) admin-protected routes with that REAL admin JWT ==="
for p in /api/v1/users /api/v1/users/me /api/v1/admin/users /api/v1/professionals /api/v1/stats /api/v1/admin/stats /api/v1/dashboard; do
  c=$(curl -sk -o /dev/null -w '%{http_code}' "$B$p" -H "Authorization: Bearer $J2")
  echo "  $p = $c"
done