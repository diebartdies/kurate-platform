var admin = db.getSiblingDB("admin");
var u = admin.getUser("kurateApp");
if (u) {
  print("USER_EXISTS roles=" + JSON.stringify(u.roles));
} else {
  admin.createUser({
    user: "kurateApp",
    pwd: "Kurate2026Secure!",
    roles: [
      { role: "root", db: "admin" },
      { role: "dbOwner", db: "KuraTe" }
    ]
  });
  print("USER_CREATED");
}