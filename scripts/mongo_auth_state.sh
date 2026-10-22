#!/bin/bash
cd /root/KuraTe-platform
echo "=== mongod.conf (auth real state) ==="
cat mongo-tls/mongod.conf 2>/dev/null || docker exec KuraTe_mongo cat /etc/mongo/mongod.conf 2>/dev/null
echo ""
echo "=== how the APP really reaches mongo (compose env + .env + container env) ==="
grep -iE "MONGO|2701[78]" docker-compose.yml | head -6
echo "--- .env ---"
grep -iE "MONGO" .env 2>/dev/null
echo "--- live container env (the actual truth) ---"
docker exec KuraTe_app sh -lc 'env | grep -i mongo | sed "s/=.*/=***/"'
echo ""
echo "=== try connecting via auth root (MONGO_INITDB_ROOT) if set in compose ==="
grep -iE "MONGO_INITDB_ROOT|MONGO_INITDB_DATABASE" docker-compose.yml .env 2>/dev/null