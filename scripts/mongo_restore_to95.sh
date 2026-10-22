#!/bin/bash
set -u

echo "=== [1/2] create kurateApp user (first user via localhost exception) ==="
docker exec KuraTe_mongo mongo --quiet admin --eval "
db.createUser({ user: 'kurateApp', pwd: 'Kurate2026Secure!', roles: [ { role: 'root', db: 'admin' }, { role: 'dbOwner', db: 'KuraTe' }, { role: 'readWrite', db: 'KuraTe' } ] });
print('USER_CREATED');
" 2>&1

echo ""
echo "=== [2/2] restore dump into KuraTe db ==="
for i in $(seq 1 15); do
  H=$(docker inspect -f '{{.State.Health.Status}}' KuraTe_mongo 2>/dev/null)
  [ "$H" = "healthy" ] && break
  sleep 2
done
docker cp /tmp/kurate_dump.gz KuraTe_mongo:/tmp/kurate_dump.gz
docker exec KuraTe_mongo mongorestore --archive=/tmp/kurate_dump.gz --gzip \
  --authenticationDatabase admin -u kurateApp -p 'Kurate2026Secure!' \
  --db KuraTe 2>&1 | tail -20
echo "RESTORE_RC=${PIPESTATUS[0]}"
