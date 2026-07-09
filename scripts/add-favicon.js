const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');
const faviconLinks = `
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="alternate icon" href="/favicon.ico">`;

fs.readdirSync(publicDir)
  .filter((f) => f.endsWith('.html'))
  .forEach((file) => {
    const filePath = path.join(publicDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('favicon.svg')) return;
    content = content.replace(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      `<meta name="viewport" content="width=device-width, initial-scale=1.0">${faviconLinks}`
    );
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated', file);
  });

// favicon.ico fallback file (SVG content; route in server.js sets correct MIME)
fs.copyFileSync(path.join(publicDir, 'favicon.svg'), path.join(publicDir, 'favicon.ico'));
console.log('Created favicon.ico');
