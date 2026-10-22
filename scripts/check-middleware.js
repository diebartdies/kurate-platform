const fs = require('fs');
const content = fs.readFileSync('/app/server.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
  if (i >= 69 && i <= 180 || i >= 475 && i <= 570) {
    console.log((i+1) + ': ' + line.trim());
  }
});