#!/bin/bash
# The user says admin@drsrv.net.ar is THE admin account.
# Find its real state in the REAL migrated DB on .95, then make it usable.
M="docker exec KuraTe_mongo mongo --quiet --host 127.0.0.1 --port 27017 KuraTe --eval"
echo "=== 1) does admin@drsrv.net.ar exist in the .95 prod DB? ==="
$M 'const u=db.users.findOne({email:/^admin@drsrv\.net\.ar$/i});
print(u? JSON.stringify({id:u._id,email:u.email,role:u.role,isVerified:u.isVerified,verActive:u.isActive,name:u.name,profType:u.professionalType,profId:u.professionalId,seed:u.isSeed},null,1) : "NOT FOUND admin@drsrv.net.ar");' 2>&1
echo ""
echo "=== 2) all accounts whose email is @drsrv.net.ar (real-ish) in prod DB ==="
for dom in drsrv.net.ar drsrv.com.ar drsrv.local; do
  $M "db.users.find({email:{\$regex:/@${dom//./\.}\$/i}},{email:1,role:1,isVerified:1,isActive:1}).forEach(u=>print(u.email+' | role='+u.role+' | verified='+u.isVerified));" 2>&1 | grep -v "^$"
done
echo ""
echo "=== 3) any user claimed as admin via role field anywhere? ==="
$M "db.users.find({role:/admin/i},{email:1,role:1}).limit(20).forEach(u=>print(u.email+' -> '+u.role));" 2>&1
echo ""
echo "=== 4) professional identities referenced by professionalType/professionalId (who is 'algo' demo owner) ==="
$M "db.users.find({professionalType:{\$nin:[null,'']},professionalId:{\$exists:true}},{email:1,name:1,professionalType:1,professionalId:1}).limit(12).forEach(u=>print((u.name||u.email)+' | type='+String(u.professionalType)+' | profId='+String(u.professionalId)));" 2>&1