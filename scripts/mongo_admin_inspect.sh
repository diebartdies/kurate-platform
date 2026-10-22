#!/bin/bash
set -e
VOL="KuraTe_mongo_data"
echo "=== stopping main mongo ==="
docker stop KuraTe_mongo >/dev/null 2>&1 || true
echo "=== starting noauth admin container on same volume ==="
docker rm -f mongo_admin_tmp >/dev/null 2>&1 || true
docker run -d --name mongo_admin_tmp -v "$VOL:/data/db" mongo:4.4 --noauth >/dev/null
for i in $(seq 1 15); do
  if docker exec mongo_admin_tmp mongo --quiet --eval "db.runCommand({ping:1}).ok" >/dev/null 2>&1; then break; fi
  sleep 1
done
echo "=== users ==="
docker exec mongo_admin_tmp mongo --quiet admin --eval "db.getUsers().forEach(u=>print(u.user+' | '+JSON.stringify(u.roles)+' | pwd='+(u.credentials&&u.credentials.SCRAM_SHA_1?'sha1hashed':'none')))"
echo "=== databases ==="
docker exec mongo_admin_tmp mongo --quiet --eval "db.adminCommand('listDatabases').databases.forEach(d=>print(d.name+' '+(d.sizeOnDisk/1048576).toFixed(1)+'MB'))"
echo "=== docs count ==="
docker exec mongo_admin_tmp mongo --quiet KuraTe --eval "db.getCollectionNames().forEach(c=>print(c+' = '+db.getCollection(c).countDocuments()))" 2>&1 | head -60
echo "=== cleanup admin container ==="
docker rm -f mongo_admin_tmp >/dev/null 2>&1 || true
echo "=== restart main mongo ==="
docker start KuraTe_mongo >/dev/null 2>&1 || true
echo "DONE"
