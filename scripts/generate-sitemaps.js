require('dotenv').config();
const fs = require('fs');
const path = require('path');
const connectDB = require('../config/database');
const {
  KURATE_BASE,
  buildSitemapForBase,
  buildRobotsTxt
} = require('../utils/seoSitemap');

const EXPORT_DIR = path.resolve(__dirname, '..', 'exports');
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

async function writeSiteBundle(label, baseUrl) {
  const { xml, urls } = await buildSitemapForBase(baseUrl);
  const safeLabel = label.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const sitemapPath = path.join(EXPORT_DIR, `sitemap-${safeLabel}.xml`);
  const robotsPath = path.join(EXPORT_DIR, `robots-${safeLabel}.txt`);
  fs.writeFileSync(sitemapPath, xml, 'utf8');
  fs.writeFileSync(robotsPath, buildRobotsTxt(baseUrl), 'utf8');

  if (label === 'KuraTe') {
    const publicSitemap = path.join(PUBLIC_DIR, 'sitemap.xml');
    fs.writeFileSync(publicSitemap, xml, 'utf8');
    const publicRobots = path.join(PUBLIC_DIR, 'robots.txt');
    const existingRobots = fs.existsSync(publicRobots) ? fs.readFileSync(publicRobots, 'utf8') : '';
    if (!existingRobots.includes('Sitemap:')) {
      fs.writeFileSync(publicRobots, `${existingRobots.trim()}\n\nSitemap: ${baseUrl}/sitemap.xml\n`);
    }
  }

  return { sitemapPath, robotsPath, urlCount: urls.length, baseUrl };
}

(async () => {
  await connectDB();
  fs.mkdirSync(EXPORT_DIR, { recursive: true });

  const kurate = await writeSiteBundle('KuraTe', KURATE_BASE);

  console.log('--------------------------------------------------');
  console.log('Google sitemap export');
  console.log('--------------------------------------------------');
  console.log(`KuraTe base:   ${kurate.baseUrl}`);
  console.log(`  URLs:           ${kurate.urlCount}`);
  console.log(`  Sitemap:        ${kurate.sitemapPath}`);
  console.log(`  Robots:         ${kurate.robotsPath}`);
  console.log('--------------------------------------------------');
  console.log('Google Search Console — submit:');
  console.log(`  KuraTe property: ${KURATE_BASE}`);
  console.log(`  KuraTe sitemap:  ${KURATE_BASE}/sitemap.xml`);
  console.log('--------------------------------------------------');

  process.exit(0);
})().catch((err) => {
  console.error('Sitemap export failed:', (err && err.message) || String(err));
  process.exit(1);
});
