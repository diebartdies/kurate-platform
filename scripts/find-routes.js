const fs = require('fs');
const content = fs.readFileSync('/app/server.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
  if (line.includes('app.get') || line.includes('app.post') || line.includes('app.put') || line.includes('app.delete') || line.includes('app.use')) {
    console.log((i+1) + ': ' + line.trim());
  }
});