#!/bin/bash
set -e
VOL="KuraTe_mongo_data"
DUMP=/tmp/kurate_dump.gz

echo "=== stop real mongo ==="
docker stop KuraTe_mongo >/dev/null 2>&1 || true

echo "=== temp NOAUTH mongo on same volume ==="
docker rm -f KuraTe_mongo_admin >/dev/null 2>&1 || true
docker run -d --name KuraTe_mongo_admin -v "$VOL:/data/db" mongo:4.4 --noauth >/dev/null
for i in $(seq 1 25); do
  if docker exec KuraTe_mongo_admin mongo --quiet --eval "db.runCommand({ping:1}).ok" 2>/dev/null | grep -q 1; then break; fi
  sleep 1
done

echo "=== restore archive (KuraTe db) ==="
docker cp "$DUMP" KuraTe_mongo_admin:/tmp/kurate_dump.gz
docker exec KuraTe_mongo_admin mongorestore --archive=/tmp/kurate_dump.gz --gzip --drop 2>&1 | grep -viE '^2026|connecting to|using write' | head -20 || true

echo "=== create kurateApp user ==="
docker exec KuraTe_mongo_admin mongo admin --quiet --eval '
db.createUser({
  user: "kurateApp",
  pwd: "Kurate2026Secure!",
  roles: [
    { role: "root", db: "admin" },
    { role: "dbOwner", db: "KuraTe" },
    { role: "readWrite", db: "KuraTe" }
  ]
});
print("USER_CREATED");
' 2>&1 || true

echo "=== verify collections ==="
docker exec KuraTe_mongo_admin mongo KuraTe --quiet --eval "db.getCollectionNames().forEach(c=>print(c+' = '+db.getCollection(c).countDocuments()))" 2>&1 | sort | head -40

echo "=== verify user roles ==="
docker exec KuraTe_mongo_admin mongo admin --quiet --eval "printjson(db.getUser('kurateApp').roles)" 2>&1 | head -10

echo "=== cleanup: remove admin container, restart real mongo ==="
docker rm -f KuraTe_mongo_admin >/dev/null 2>&1 || true
docker start KuraTe_mongo >/dev/null 2>&1 || true
sleep 4
echo "=== real mongo health ==="
docker inspect -f '{{.State.Health.Status}}' KuraTe_mongo 2>&1
echo "RESTORE_DONE"
