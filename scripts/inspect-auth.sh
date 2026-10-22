#!/bin/bash
cd /root/KuraTe-platform || exit 1
echo "=== login route paths ==="
grep -nE "router\.(post|get|delete|put)\(" routes/auth.js 2>/dev/null

echo "=== auth controller: file that owns login/register ==="
for c in controllers/authController.js controllers/auth.js controllers/UserController.js; do [ -f "$c" ] && echo "FOUND $c"; done

echo "=== login + register handlers (logic) ==="
ctrl=$(grep -rlE "INVALID_PASSWORD" controllers 2>/dev/null | head -1)
echo "ctrl=$ctrl"
grep -nE "exports\.|INVALID_PASSWORD|INVALID_EMAIL|USER_NOT|bcrypt.compare|matchPassword|req.body|role|isVerified|verified|approved|allowlist|allowList|ADMIN_EMAIL|status\([0-9]" "$ctrl" 2>/dev/null | sed -n '1,60p'

echo "=== register route impl file ==="
regfile=$(grep -rlE "router\.post\(['\"]/register|registerUser" routes 2>/dev/null | head -1)
echo "regfile=$regfile"
grep -nE "register|role|allowlist|allowList|verified|approved|ADMIN_EMAIL|password|req.body|status\([0-9]|isVerified" "$regfile" 2>/dev/null | sed -n '1,40p'