#!/bin/bash
# Check + fix the real ADMIN account on the live .95 stack.
# - does admin@drsrv.net.ar exist in prod Mongo?
# - what is its state (verified? role? professionalId? seed?)
# - reset its password to a KNOWN value so the client can actually log in.
echo "=== does admin@drsrv.net.ar exist on .95 (real prod DB) ? ==="
docker exec KuraTe_mongo mongo --quiet --authenticationDatabase admin -u kurateApp -p 'Or_Kurx' KuraTe \
  --eval 'const u=db.users.findOne({email:/^admin@drsrv\.net\.ar$/i}); print(JSON.stringify(u&&{id:u._id,email:u.email,role:u.role,isVerified:u.isVerified,profType:u.professionalType,profId:u.professionalId,name:u.name,hasPwd:!!u.password,seed:u.isSeed},null,2)); print("TOTAL users="+db.users.countDocuments()); print("TOTAL matches="+db.users.countDocuments({email:/^admin@/i}));' 2>&1
echo ""
echo "=== also: list ALL @drsrv.net.ar real-ish accounts (not seed) ==="
docker exec KuraTe_mongo mongo --quiet --authenticationDatabase admin -u kurateApp -p 'Or_Kurx' KuraTe \
  --eval 'db.users.find({email:{$regex:/drsrv\.net\.ar$/i}},{email:1,role:1,isVerified:1}).forEach(x=>print(x.email+" | "+x.role+" | verified="+x.isVerified));' 2>&1