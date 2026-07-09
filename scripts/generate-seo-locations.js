#!/usr/bin/env node
require('dotenv').config();

const connectDB = require('../config/database');
const {
  REGISTRY_PATH,
  MIN_PROFESSIONALS,
  refreshLocationRegistry
} = require('../utils/seoLocations');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await connectDB();

  if (dryRun) {
    const { buildLocationRegistry } = require('../utils/seoLocations');
    const registry = await buildLocationRegistry();
    console.log(`[dry-run] SEO location pages: ${registry.totalPages} (min ${MIN_PROFESSIONALS} professional(s) each)`);
    registry.pages.forEach((page) => {
      const suffix = page.areaName ? `${page.areaName}, ${page.provinceName}` : page.provinceName;
      console.log(`  ${page.path} -> ${suffix} (${page.count})`);
    });
    process.exit(0);
  }

  const registry = await refreshLocationRegistry();
  console.log(`SEO location pages: ${registry.totalPages} (min ${MIN_PROFESSIONALS} professional(s) each)`);
  registry.pages.forEach((page) => {
    const suffix = page.areaName ? `${page.areaName}, ${page.provinceName}` : page.provinceName;
    console.log(`  ${page.path} -> ${suffix} (${page.count})`);
  });
  console.log(`Registry written to ${REGISTRY_PATH}`);
  process.exit(0);
}

main().catch((error) => {
  console.error('[generate-seo-locations]', error.message);
  process.exit(1);
});
