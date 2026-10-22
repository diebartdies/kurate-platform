// Create active avisos for all professionals based on their hogarProfile.services
// Each professional gets one aviso per unique environment+serviceLine combo
var now = new Date();
var endDate = new Date(now);
endDate.setDate(endDate.getDate() + 30);

var count = 0;
var skipped = 0;

db.users.find({
  role: "professional",
  accountDeletedAt: null,
  isVerified: true,
  "hogarProfile.services": { $exists: true, $ne: [] }
}).forEach(function(user) {
  var hp = user.hogarProfile || {};
  var services = hp.services || [];
  var area = hp.area || "";
  
  // Build unique env+serviceLine combos from service paths
  var combos = {};
  services.forEach(function(svc) {
    var path = svc.path || "";
    // Format: "hogar/linea-blanca/lavarropas" -> env=hogar, line=linea-blanca
    var parts = path.split("/");
    if (parts.length >= 2) {
      var env = parts[0];
      var line = parts[1];
      var key = env + "|" + line;
      if (!combos[key]) combos[key] = { env: env, line: line, name: line };
    }
  });
  
  // Also check professionalProfile.services (dot-separated format like ANALISA)
  var ppServices = (user.professionalProfile || {}).services || [];
  ppServices.forEach(function(path) {
    var parts = path.split(".");
    if (parts.length >= 2) {
      var env = parts[0];
      var line = parts[1];
      var key = env + "|" + line;
      if (!combos[key]) combos[key] = { env: env, line: line, name: line };
    }
  });
  
  var keys = Object.keys(combos);
  if (keys.length === 0) {
    skipped++;
    return;
  }
  
  keys.forEach(function(key) {
    var combo = combos[key];
    
    // Check if aviso already exists for this professional+environment+serviceLine
    var existing = db.avisos.findOne({
      professional: user._id,
      environment: combo.env,
      serviceLine: combo.line,
      status: { $in: ["pending_payment", "active", "expiring"] }
    });
    
    if (!existing) {
      db.avisos.insertOne({
        professional: user._id,
        environment: combo.env,
        serviceLine: combo.line,
        serviceLineName: combo.name,
        text: "Aviso generado automáticamente",
        startDate: now,
        endDate: endDate,
        status: "active",
        price: 0,
        renewalCount: 0,
        createdAt: now
      });
      count++;
      print("CREATED aviso for", user.name || user._id, "->", combo.env + "/" + combo.line);
    } else {
      print("EXISTS aviso for", user.name || user._id, "->", combo.env + "/" + combo.line);
    }
  });
});

print("---");
print("Avisos created:", count);
print("Users skipped (no services):", skipped);
