#!/bin/bash
cd /root/KuraTe-platform || exit 1
echo "=== 1) auth routes ==="
grep -nE "router\.(post|get|put)\(" routes/auth.js 2>/dev/null
echo "=== 2) login logic (what field + role gate) ==="
ctrl=$(grep -rl "INVALID_PASSWORD\|matchPassword" controllers 2>/dev/null | head -1)
echo "controller=$ctrl"
grep -nE "email|password|matchPassword|role|isVerified|isApproved|approved|verified|token|json\(|status\(" "$ctrl" 2>/dev/null | sed -n '1,50p'
echo "=== 3) how register creates users (password field + verified + role) ==="
reg=$(grep -rln "exports.register\|registerUser\|status(201)" controllers 2>/dev/null | head -1)
echo "register_impl=$reg"
grep -nE "User\.create|create\(|password|role|isVerified|verified|approved|professional|request\.body" "$reg" 2>/dev/null | sed -n '1,40p'
echo "=== 4) admin allowlist / first-admin env ==="
grep -rniE "adminEmail|ADMIN_EMAIL|firstAdmin|superadmin|isAdmin=true|allowlist" server.js routes controllers middleware config 2>/dev/null | grep -ivE "public|\.css|\.map" | head -20
echo "=== 5) User model auth fields ==="
grep -nE "email:|password:|role:|isVerified:|verified:|approved:|isApproved:|authMethods|googleId|phone:" models/User.js 2>/dev/null | head -25
