const { join } = require('path');

module.exports = {
  // Changes the cache location for Puppeteer to stay within the project (D: Drive)
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};